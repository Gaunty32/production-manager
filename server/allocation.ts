// Operator-led allocation (Stage 1).
// People own jobs; machines provide production capacity.
// Each production-ready job should have a responsible operator, a
// recommended machine, and (via jobs.machineId) a confirmed machine.

import { db } from "./db";
import { jobs, jobLineItems, jobSchedule, staff, machines, customers, productionEntries, staffShifts, machineScheduleBlocks, staffMachineAllocations, staffHolidays, bankHolidays } from "@shared/schema";
import { and, eq, ne, isNull, inArray, gte, lt } from "drizzle-orm";
import { PRINT_MACHINE_ID, isPrintJobType } from "@shared/machines";
import { maybeSendProductionStartedNotification } from "./customerOrderNotifications";
import { findAvailableSlots, minutesToTime } from "@shared/scheduling";

/** London calendar date (yyyy-MM-dd) for "today". */
function londonDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

/** Active production jobs — mirrors the staff Production Queue filters:
 * not completed, not waiting on customer, not invoiced/ready, and not
 * blocked on advance payment. */
async function getActiveJobs() {
  // Filter as much as possible in SQL; the advance-payment rule needs the
  // customer record so that part stays in JS.
  const candidates = await db.select().from(jobs).where(and(
    eq(jobs.completed, false),
    ne(jobs.status, "completed"),
    ne(jobs.status, "pending_customer_approval"),
    ne(jobs.invoiceStatus, "invoiced"),
    ne(jobs.invoiceStatus, "ready"),
    isNull(jobs.invoicedAt),
  ));
  const custIds = Array.from(new Set(candidates.map(j => j.customerId)));
  const relevantCustomers = custIds.length > 0
    ? await db.select().from(customers).where(inArray(customers.id, custIds))
    : [];
  const custById = new Map(relevantCustomers.map(c => [c.id, c]));
  return candidates.filter(j => {
    const cust = custById.get(j.customerId);
    if (cust?.requiresAdvancePayment && !j.paymentReceived) return false;
    return true;
  });
}

type JobCard = {
  id: string;
  jobNumber: number | null;
  jobName: string;
  customerName: string;
  requiredDispatchDate: string | null;
  outstandingQty: number;
  totalQty: number;
  jobTypes: string[];
  responsibleOperatorId: string | null;
  responsibleOperatorName: string | null;
  allocationStatus: string;
  blockedReason: string | null;
  machineId: number | null;
  machineName: string | null;
  recommendedMachineId: number | null;
  recommendedMachineName: string | null;
  machineOverrideReason: string | null;
  awaitingStock: boolean;
  awaitingArtwork: boolean;
  overdue: boolean;
  dueToday: boolean;
  planningStatus: "scheduled" | "at_risk" | "unscheduled";
  plannedCompletionDate: string | null;
  plannedStartTime: number | null;
  plannedEndTime: number | null;
  plannedOperatorName: string | null;
  plannedMachineName: string | null;
  planningReason: string | null;
  /** For unowned jobs: the operator already implied by the line items /
   * machine schedule (explicit line-item operator, else the machine's
   * default operator) when it is unambiguous. */
  suggestedOperatorId: string | null;
  suggestedOperatorName: string | null;
  /** For unowned jobs: every active operator the line items / machine schedule
   * imply, with the outstanding quantity that is theirs. One entry = the whole
   * job is theirs; several = the job is split between team members. */
  impliedOperators: Array<{ staffId: string; name: string; outstandingQty: number }>;
  /** Set on the copy of a split job shown in one operator's column / queue:
   * the outstanding quantity belonging to that operator. */
  shareQty?: number;
  lineItems: Array<{
    id: string;
    jobType: string;
    description: string | null;
    position: string | null;
    quantity: number;
    completed: boolean;
    awaitingStock: boolean;
    logoApproved: boolean;
    machineId: number | null;
    effectiveOperatorId: string | null;
  }>;
};

async function buildJobCards(activeJobs: Awaited<ReturnType<typeof getActiveJobs>>): Promise<JobCard[]> {
  const jobIds = activeJobs.map(j => j.id);
  if (jobIds.length === 0) return [];
  const items = await db.select().from(jobLineItems).where(inArray(jobLineItems.jobId, jobIds));
  const allStaff = await db.select().from(staff);
  const allMachines = await db.select().from(machines);
  const allCustomers = await db.select().from(customers);
  const schedules = await db.select().from(jobSchedule).where(inArray(jobSchedule.jobId, jobIds));
  const entries = await db.select().from(productionEntries).where(inArray(
    productionEntries.lineItemId,
    items.map(i => i.id),
  ));
  const staffName = new Map(allStaff.map(s => [s.id, s.name]));
  const activeStaffIds = new Set(allStaff.filter(s => s.active !== false).map(s => s.id));
  const machineName = new Map(allMachines.map(m => [m.id, m.name]));
  const custName = new Map(allCustomers.map(c => [c.id, c.name]));
  const itemsByJob = new Map<string, typeof items>();
  const schedulesByJob = new Map<string, typeof schedules>();
  const completedByLineItem = new Map<string, number>();
  for (const entry of entries) {
    completedByLineItem.set(entry.lineItemId, (completedByLineItem.get(entry.lineItemId) ?? 0) + entry.quantityCompleted);
  }
  for (const schedule of schedules.filter(s => s.status !== "cancelled")) {
    const arr = schedulesByJob.get(schedule.jobId) ?? [];
    arr.push(schedule);
    schedulesByJob.set(schedule.jobId, arr);
  }
  for (const li of items) {
    const arr = itemsByJob.get(li.jobId) ?? [];
    arr.push(li);
    itemsByJob.set(li.jobId, arr);
  }
  const machineDefaultOperator = new Map(allMachines.map(m => [m.id, m.defaultOperatorId ?? null]));
  const todayStr = londonDateStr(new Date());
  return activeJobs.map(j => {
    const lis = (itemsByJob.get(j.id) ?? []) as any[];
    // Effective operator per line item: explicit line-item operator first,
    // else the assigned machine's default operator.
    const effectiveOp = (li: any): string | null =>
      li.operatorId ?? (li.machineId != null ? machineDefaultOperator.get(li.machineId) ?? null : null);

    // Operators already implied by the schedule for unowned jobs. Jobs can be
    // split between several team members — collect ALL of them (active staff
    // only; inactive operators aren't rendered on the board, so assigning to
    // them would hide the job entirely) with their share of the outstanding work.
    const impliedShares = new Map<string, number>();
    if (!j.responsibleOperatorId) {
      for (const li of lis) {
        if (li.completed) continue;
        const op = effectiveOp(li);
        if (op && activeStaffIds.has(op)) impliedShares.set(op, (impliedShares.get(op) ?? 0) + li.quantity);
      }
    }
    const impliedOperators = Array.from(impliedShares.entries())
      .map(([staffId, outstandingQty]) => ({ staffId, name: staffName.get(staffId) ?? "Unknown", outstandingQty }))
      .sort((a, b) => b.outstandingQty - a.outstandingQty);
    // Only suggest a single job owner when the ENTIRE outstanding work points
    // at ONE person — partial coverage must not hand them the whole job.
    const outstandingQtyForShares = lis.filter(li => !li.completed).reduce((s, li) => s + li.quantity, 0);
    const impliedSum = impliedOperators.reduce((s, op) => s + op.outstandingQty, 0);
    const suggestedOperatorId =
      impliedOperators.length === 1 && impliedSum === outstandingQtyForShares
        ? impliedOperators[0].staffId
        : null;
    const lineItems = lis.map(li => ({
      id: li.id,
      jobType: li.jobType,
      description: li.description,
      position: li.position,
      quantity: Math.max(0, li.quantity - (completedByLineItem.get(li.id) ?? 0)),
      completed: li.completed,
      awaitingStock: li.awaitingStock,
      logoApproved: li.logoApproved,
      machineId: li.machineId,
      effectiveOperatorId: effectiveOp(li),
    }));
    const outstandingQty = lis
      .filter(li => !li.completed)
      .reduce((s, li) => s + Math.max(0, li.quantity - (completedByLineItem.get(li.id) ?? 0)), 0);
    const totalQty = lis.reduce((s, li) => s + li.quantity, 0);
    const dueStr = j.requiredDispatchDate ? londonDateStr(new Date(j.requiredDispatchDate)) : null;
    const planned = [...(schedulesByJob.get(j.id) ?? [])]
      .filter(s => s.status !== "completed")
      .sort((a, b) =>
        new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime() ||
        a.endTime - b.endTime);
    const firstPlan = planned[0] ?? null;
    const finalPlan = planned[planned.length - 1] ?? null;
    const completionDate = finalPlan ? londonDateStr(new Date(finalPlan.scheduledDate)) : null;
    const planningStatus: JobCard["planningStatus"] = !finalPlan
      ? "unscheduled"
      : dueStr && completionDate && completionDate > dueStr
        ? "at_risk"
        : "scheduled";
    return {
      id: j.id,
      jobNumber: j.jobNumber,
      jobName: j.jobName,
      customerName: custName.get(j.customerId) ?? "",
      requiredDispatchDate: dueStr,
      outstandingQty,
      totalQty,
      jobTypes: Array.from(new Set(lis.map(li => li.jobType))),
      responsibleOperatorId: j.responsibleOperatorId,
      responsibleOperatorName: j.responsibleOperatorId ? staffName.get(j.responsibleOperatorId) ?? null : null,
      allocationStatus: j.allocationStatus,
      blockedReason: j.blockedReason,
      machineId: j.machineId,
      machineName: j.machineId != null ? machineName.get(j.machineId) ?? null : null,
      recommendedMachineId: j.recommendedMachineId,
      recommendedMachineName: j.recommendedMachineId != null ? machineName.get(j.recommendedMachineId) ?? null : null,
      machineOverrideReason: j.machineOverrideReason,
      awaitingStock: lis.some(li => li.awaitingStock),
      awaitingArtwork: lis.some(li => !li.logoApproved),
      overdue: dueStr != null && dueStr < todayStr,
      dueToday: dueStr === todayStr,
      planningStatus,
      plannedCompletionDate: completionDate,
      plannedStartTime: firstPlan?.startTime ?? null,
      plannedEndTime: finalPlan?.endTime ?? null,
      plannedOperatorName: finalPlan ? staffName.get(finalPlan.staffId) ?? null : null,
      plannedMachineName: finalPlan ? machineName.get(finalPlan.machineId) ?? null : null,
      planningReason: !j.responsibleOperatorId
        ? "Choose a responsible operator first"
        : !j.machineId
          ? "Choose a machine after the operator"
          : !finalPlan
            ? "Ready to schedule"
            : planningStatus === "at_risk"
              ? "Planned completion is after dispatch date"
              : null,
      suggestedOperatorId,
      suggestedOperatorName: suggestedOperatorId ? staffName.get(suggestedOperatorId) ?? null : null,
      impliedOperators,
      lineItems,
    };
  });
}

/** All active jobs with their owners — read-only view for every staff member. */
export async function getActiveJobsOverview() {
  const activeJobs = await getActiveJobs();
  const cards = await buildJobCards(activeJobs);
  cards.sort((a, b) =>
    (a.requiredDispatchDate ?? "9999").localeCompare(b.requiredDispatchDate ?? "9999") || b.outstandingQty - a.outstandingQty);
  return cards;
}

/** Manager allocation board: every active operator with their owned jobs,
 * plus the unallocated and blocked job lists. */
export async function getAllocationBoard() {
  const activeJobs = await getActiveJobs();
  const cards = await buildJobCards(activeJobs);
  const allStaff = await db.select().from(staff).where(eq(staff.active, true));

  const byOperator = new Map<string, JobCard[]>();
  const unallocated: JobCard[] = [];
  const blocked: JobCard[] = [];
  for (const c of cards) {
    if (c.allocationStatus === "blocked") {
      blocked.push(c);
    } else if (c.responsibleOperatorId) {
      const arr = byOperator.get(c.responsibleOperatorId) ?? [];
      arr.push(c);
      byOperator.set(c.responsibleOperatorId, arr);
    } else {
      // The schedule may already give some or all of this job to one or more
      // people — show their share in each of their columns.
      for (const op of c.impliedOperators) {
        const arr = byOperator.get(op.staffId) ?? [];
        arr.push({ ...c, shareQty: op.outstandingQty });
        byOperator.set(op.staffId, arr);
      }
      // Any outstanding work NOT covered by the schedule still needs a
      // decision, so the job also stays in the awaiting list.
      const impliedSum = c.impliedOperators.reduce((s, op) => s + op.outstandingQty, 0);
      if (impliedSum < c.outstandingQty || c.impliedOperators.length === 0) {
        unallocated.push(impliedSum > 0 ? { ...c, shareQty: c.outstandingQty - impliedSum } : c);
      }
    }
  }
  const sortByDue = (a: JobCard, b: JobCard) =>
    (a.requiredDispatchDate ?? "9999").localeCompare(b.requiredDispatchDate ?? "9999") || b.outstandingQty - a.outstandingQty;
  unallocated.sort(sortByDue);
  blocked.sort(sortByDue);

  const operators = allStaff
    .map(s => {
      const jobsFor = (byOperator.get(s.id) ?? []).sort(sortByDue);
      return {
        staffId: s.id,
        name: s.name,
        jobs: jobsFor,
        jobCount: jobsFor.length,
        itemsRemaining: jobsFor.reduce((sum, c) => sum + (c.shareQty ?? c.outstandingQty), 0),
        earliestDue: jobsFor[0]?.requiredDispatchDate ?? null,
        atRisk: jobsFor.filter(c => c.overdue || c.dueToday).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { operators, unallocated, blocked };
}

/** Personal work queue for one operator: their owned jobs in the order they
 * should be worked, plus today's totals. */
export async function getOperatorQueue(staffId: string) {
  const activeJobs = await getActiveJobs();
  const allCards = await buildJobCards(activeJobs);
  // Their queue: jobs they own, plus their share of unowned jobs the schedule
  // splits between team members (only their line items, only their quantity).
  const cards: JobCard[] = [];
  for (const c of allCards) {
    if (c.responsibleOperatorId === staffId) {
      cards.push(c);
    } else if (!c.responsibleOperatorId && c.allocationStatus !== "blocked") {
      const share = c.impliedOperators.find(op => op.staffId === staffId);
      if (share) {
        cards.push({
          ...c,
          shareQty: share.outstandingQty,
          lineItems: c.lineItems.filter(li => li.effectiveOperatorId === staffId),
        });
      }
    }
  }
  cards.sort((a, b) =>
    (a.requiredDispatchDate ?? "9999").localeCompare(b.requiredDispatchDate ?? "9999")
    || (b.shareQty ?? b.outstandingQty) - (a.shareQty ?? a.outstandingQty));

  // Today's totals (London day) from production entries + completed line items
  const todayStr = londonDateStr(new Date());
  const dayStart = new Date(`${todayStr}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600 * 1000); // generous window, filtered below
  const entries = await db.select().from(productionEntries)
    .where(and(eq(productionEntries.staffId, staffId), gte(productionEntries.workDate, new Date(dayStart.getTime() - 12 * 3600 * 1000)), lt(productionEntries.workDate, dayEnd)));
  const todaysEntries = entries.filter(e => londonDateStr(new Date(e.workDate)) === todayStr);
  const itemsCompletedToday = todaysEntries.reduce((s, e) => s + e.quantityCompleted, 0);
  const minutesToday = todaysEntries.reduce((s, e) => s + e.productionTimeMinutes, 0);

  const [staffRow] = await db.select().from(staff).where(eq(staff.id, staffId));

  return {
    staffId,
    staffName: staffRow?.name ?? "Unknown",
    currentJob: cards[0] ?? null,
    nextJobs: cards.slice(1),
    totals: {
      jobsAllocated: cards.length,
      itemsRemaining: cards.reduce((s, c) => s + (c.shareQty ?? c.outstandingQty), 0),
      itemsCompletedToday,
      minutesRecordedToday: minutesToday,
    },
  };
}

/** Recommend a machine for a job. Stage 1 heuristic:
 * - Print work is force-routed to the print machine (by name).
 * - Otherwise, the active machine with the least outstanding allocated
 *   quantity (balance the queues), preferring machines whose default
 *   operator matches the job's responsible operator. */
export async function recommendMachineForJob(
  jobId: string,
  operatorIdOverride?: string | null,
): Promise<{
  machineId: number | null;
  machineName: string | null;
  reason: string;
  earliestDate?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  canMeetDeadline?: boolean;
  alternatives?: Array<{ machineId: number; machineName: string; earliestDate: string; startTime: number; endTime: number; canMeetDeadline: boolean }>;
}> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) return { machineId: null, machineName: null, reason: "Job not found" };
  const responsibleOperatorId = operatorIdOverride !== undefined ? operatorIdOverride : job.responsibleOperatorId;
  const items = await db.select().from(jobLineItems).where(eq(jobLineItems.jobId, jobId));
  const allMachines = (await db.select().from(machines)).filter(m => m.isActive);
  if (!responsibleOperatorId) {
    return { machineId: null, machineName: null, reason: "Choose a responsible operator before selecting a machine", alternatives: [] };
  }
  const [operator] = await db.select().from(staff).where(and(eq(staff.id, responsibleOperatorId), eq(staff.active, true)));
  if (!operator) return { machineId: null, machineName: null, reason: "Responsible operator is not active", alternatives: [] };

  const isPrintOnly = items.length > 0 && items.every(li => isPrintJobType(li.jobType));
  if (isPrintOnly) {
    const printMachine = allMachines.find(m => m.id === PRINT_MACHINE_ID);
    if (printMachine) return { machineId: printMachine.id, machineName: printMachine.name, reason: "Print work is routed to the print machine" };
  }
  const embMachines = allMachines.filter(m => m.id !== PRINT_MACHINE_ID);
  if (embMachines.length === 0) return { machineId: null, machineName: null, reason: "No active machines available" };

  const [blocks, shifts, schedules, allocations, holidays, bankDays, progressEntries] = await Promise.all([
    db.select().from(machineScheduleBlocks),
    db.select().from(staffShifts),
    db.select().from(jobSchedule),
    db.select().from(staffMachineAllocations),
    db.select().from(staffHolidays),
    db.select().from(bankHolidays),
    db.select().from(productionEntries).where(inArray(productionEntries.lineItemId, items.map(i => i.id))),
  ]);
  const completedQty = new Map<string, number>();
  for (const entry of progressEntries) completedQty.set(entry.lineItemId, (completedQty.get(entry.lineItemId) ?? 0) + entry.quantityCompleted);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const horizon = new Date(start); horizon.setDate(horizon.getDate() + 60);
  const due = job.requiredDispatchDate ? new Date(job.requiredDispatchDate) : null;
  const alternatives: NonNullable<Awaited<ReturnType<typeof recommendMachineForJob>>["alternatives"]> = [];
  for (const machine of embMachines) {
    let duration = 0;
    for (const item of items.filter(i => !i.completed && !isPrintJobType(i.jobType))) {
      const remaining = Math.max(0, item.quantity - (completedQty.get(item.id) ?? 0));
      if (!remaining || !item.stitchCount) continue;
      const runs = Math.ceil(remaining / machine.heads);
      duration += Math.ceil((runs * (item.stitchCount / machine.stitchesPerMinute + machine.changeoverTimeMinutes) * (machine.schedulingMultiplier ?? 1)) / 10) * 10;
    }
    if (!duration) continue;
    const cursor = new Date(start);
    while (cursor <= horizon) {
      const slots = findAvailableSlots(cursor, machine.id, operator.id, blocks, shifts, schedules, allocations, holidays, bankDays);
      const slot = slots.find(s => s.endTime - s.startTime >= duration);
      if (slot) {
        const date = londonDateStr(cursor);
        alternatives.push({
          machineId: machine.id,
          machineName: machine.name,
          earliestDate: date,
          startTime: slot.startTime,
          endTime: slot.startTime + duration,
          canMeetDeadline: !due || cursor <= due,
        });
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  alternatives.sort((a, b) =>
    Number(b.canMeetDeadline) - Number(a.canMeetDeadline) ||
    a.earliestDate.localeCompare(b.earliestDate) ||
    a.startTime - b.startTime);
  const best = alternatives[0];
  if (!best) return { machineId: null, machineName: null, reason: `${operator.name} has no feasible machine slot in the next 60 days`, alternatives: [] };
  return {
    machineId: best.machineId,
    machineName: best.machineName,
    reason: `${operator.name} can complete this ${best.canMeetDeadline ? "on time" : "at the earliest available time"} on ${best.earliestDate} (${minutesToTime(best.startTime)}–${minutesToTime(best.endTime)})`,
    earliestDate: best.earliestDate,
    startTime: best.startTime,
    endTime: best.endTime,
    canMeetDeadline: best.canMeetDeadline,
    alternatives,
  };
}

/** Allocate (or reallocate) a job. Records who allocated and when, keeps the
 * original recommendation, and derives the allocation status. */
export async function allocateJob(
  jobId: string,
  input: {
    responsibleOperatorId?: string | null;
    machineId?: number | null;
    machineOverrideReason?: string | null;
    blockedReason?: string | null;
    allocatedById: string;
  },
) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new Error("Job not found");

  const updates: Record<string, unknown> = {
    allocatedById: input.allocatedById,
    allocatedAt: new Date(),
  };

  const finalOperator = input.responsibleOperatorId !== undefined ? input.responsibleOperatorId : job.responsibleOperatorId;
  const finalMachine = input.machineId !== undefined ? input.machineId : job.machineId;
  if (finalMachine != null && !finalOperator) throw new Error("Choose a responsible operator before selecting a machine");
  if (finalOperator) {
    const [operator] = await db.select().from(staff).where(and(eq(staff.id, finalOperator), eq(staff.active, true)));
    if (!operator) throw new Error("Responsible operator must be an active staff member");
  }
  if (finalMachine != null) {
    const [machine] = await db.select().from(machines).where(and(eq(machines.id, finalMachine), eq(machines.isActive, true)));
    if (!machine) throw new Error("Machine must be active");
  }

  if (input.responsibleOperatorId !== undefined) updates.responsibleOperatorId = input.responsibleOperatorId;
  if (input.machineId !== undefined) {
    updates.machineId = input.machineId;
    // Snapshot the recommendation at decision time (against the operator being
    // set in this request), so the recommended-vs-overridden record is accurate.
    if (job.recommendedMachineId == null && input.machineId != null) {
      const rec = await recommendMachineForJob(jobId, finalOperator ?? null);
      updates.recommendedMachineId = rec.machineId;
    }
    updates.machineOverrideReason = input.machineOverrideReason ?? null;
  }
  if (input.blockedReason !== undefined) updates.blockedReason = input.blockedReason;

  const finalBlocked = input.blockedReason !== undefined ? input.blockedReason : job.blockedReason;
  updates.allocationStatus = finalBlocked ? "blocked" : finalOperator ? "allocated" : "unallocated";

  const allocationChanged =
    (input.responsibleOperatorId !== undefined && input.responsibleOperatorId !== job.responsibleOperatorId) ||
    (input.machineId !== undefined && input.machineId !== job.machineId);
  if (
    finalOperator &&
    finalMachine != null &&
    !finalBlocked &&
    !job.productionStartedEmailSentAt &&
    !job.productionStartedEmailQueuedAt
  ) {
    updates.productionStartedEmailQueuedAt = new Date();
  }
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(jobs).set(updates).where(eq(jobs.id, jobId)).returning();
    let replanLineItemIds: string[] = [];
    if (allocationChanged) {
      const outstanding = await tx.select().from(jobLineItems)
        .where(and(eq(jobLineItems.jobId, jobId), eq(jobLineItems.completed, false)));
      replanLineItemIds = outstanding
        .filter(item => item.machineId != null || finalMachine != null)
        .map(item => item.id);
      for (const item of outstanding) {
        const itemMachineId = isPrintJobType(item.jobType)
          ? PRINT_MACHINE_ID
          : input.machineId !== undefined
            ? finalMachine ?? null
            : item.machineId;
        await tx.update(jobLineItems).set({
          operatorId: finalOperator ?? null,
          machineId: itemMachineId,
        }).where(eq(jobLineItems.id, item.id));
      }
      const today = new Date(); today.setHours(0, 0, 0, 0);
      await tx.delete(jobSchedule).where(and(
        eq(jobSchedule.jobId, jobId),
        eq(jobSchedule.status, "scheduled"),
        gte(jobSchedule.scheduledDate, today),
      ));
    }
    return { ...updated, planning: { replanLineItemIds } };
  });
  await maybeSendProductionStartedNotification(jobId);
  return result;
}

/** Give every unowned, unblocked job whose line items already imply a single
 * operator to that operator. Goes through allocateJob so status/audit fields
 * are derived consistently. Returns how many jobs were assigned. */
export async function adoptSuggestedOperators(allocatedById: string) {
  const activeJobs = await getActiveJobs();
  const cards = await buildJobCards(activeJobs);
  const adoptable = cards.filter(
    c => !c.responsibleOperatorId && c.allocationStatus !== "blocked" && c.suggestedOperatorId,
  );
  for (const c of adoptable) {
    await allocateJob(c.id, { responsibleOperatorId: c.suggestedOperatorId, allocatedById });
  }
  return { assigned: adoptable.length };
}

/** Summary used by the TV dashboard and manager alerts. */
export async function getAllocationSummary() {
  const activeJobs = await getActiveJobs();
  const cards = await buildJobCards(activeJobs);
  const unallocated = cards.filter(c =>
    c.allocationStatus !== "blocked" && !c.responsibleOperatorId
    && c.impliedOperators.reduce((s, op) => s + op.outstandingQty, 0) < c.outstandingQty);
  const blocked = cards.filter(c => c.allocationStatus === "blocked");
  const atRisk = cards.filter(c => (c.overdue || c.dueToday) && c.outstandingQty > 0);
  return {
    unallocatedCount: unallocated.length,
    blockedCount: blocked.length,
    atRiskCount: atRisk.length,
  };
}
