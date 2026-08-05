// Operator-led allocation (Stage 1).
// People own jobs; machines provide production capacity.
// Each production-ready job should have a responsible operator, a
// recommended machine, and (via jobs.machineId) a confirmed machine.

import { db } from "./db";
import { jobs, jobLineItems, staff, machines, customers, productionEntries, users } from "@shared/schema";
import { and, eq, ne, isNull, inArray, gte, lt, sql } from "drizzle-orm";
import { PRINT_MACHINE_ID, isPrintJobType } from "@shared/machines";

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
  /** For unowned jobs: the operator already implied by the line items /
   * machine schedule (explicit line-item operator, else the machine's
   * default operator) when it is unambiguous. */
  suggestedOperatorId: string | null;
  suggestedOperatorName: string | null;
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
  }>;
};

async function buildJobCards(activeJobs: Awaited<ReturnType<typeof getActiveJobs>>): Promise<JobCard[]> {
  const jobIds = activeJobs.map(j => j.id);
  if (jobIds.length === 0) return [];
  const items = await db.select().from(jobLineItems).where(inArray(jobLineItems.jobId, jobIds));
  const allStaff = await db.select().from(staff);
  const allMachines = await db.select().from(machines);
  const allCustomers = await db.select().from(customers);
  const staffName = new Map(allStaff.map(s => [s.id, s.name]));
  const activeStaffIds = new Set(allStaff.filter(s => s.active !== false).map(s => s.id));
  const machineName = new Map(allMachines.map(m => [m.id, m.name]));
  const custName = new Map(allCustomers.map(c => [c.id, c.name]));
  const itemsByJob = new Map<string, typeof items>();
  for (const li of items) {
    const arr = itemsByJob.get(li.jobId) ?? [];
    arr.push(li);
    itemsByJob.set(li.jobId, arr);
  }
  const machineDefaultOperator = new Map(allMachines.map(m => [m.id, m.defaultOperatorId ?? null]));
  const todayStr = londonDateStr(new Date());
  return activeJobs.map(j => {
    const lis = (itemsByJob.get(j.id) ?? []) as any[];
    // Effective operator already implied by the schedule: explicit line-item
    // operator first, else the assigned machine's default operator. Only
    // suggest when every resolvable (incomplete) line item points at ONE person.
    let suggestedOperatorId: string | null = null;
    if (!j.responsibleOperatorId) {
      const implied = new Set<string>();
      for (const li of lis) {
        if (li.completed) continue;
        const op = li.operatorId ?? (li.machineId != null ? machineDefaultOperator.get(li.machineId) : null);
        if (op) implied.add(op);
      }
      if (implied.size === 1) {
        const only = Array.from(implied)[0];
        // Only suggest active staff — inactive operators aren't rendered on
        // the board, so assigning to them would hide the job entirely.
        if (activeStaffIds.has(only)) suggestedOperatorId = only;
      }
    }
    const lineItems = lis.map(li => ({
      id: li.id,
      jobType: li.jobType,
      description: li.description,
      position: li.position,
      quantity: li.quantity,
      completed: li.completed,
      awaitingStock: li.awaitingStock,
      logoApproved: li.logoApproved,
      machineId: li.machineId,
    }));
    const outstandingQty = lis.filter(li => !li.completed).reduce((s, li) => s + li.quantity, 0);
    const totalQty = lis.reduce((s, li) => s + li.quantity, 0);
    const dueStr = j.requiredDispatchDate ? londonDateStr(new Date(j.requiredDispatchDate)) : null;
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
      suggestedOperatorId,
      suggestedOperatorName: suggestedOperatorId ? staffName.get(suggestedOperatorId) ?? null : null,
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
      unallocated.push(c);
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
        itemsRemaining: jobsFor.reduce((sum, c) => sum + c.outstandingQty, 0),
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
  const owned = activeJobs.filter(j => j.responsibleOperatorId === staffId);
  const cards = await buildJobCards(owned);
  cards.sort((a, b) =>
    (a.requiredDispatchDate ?? "9999").localeCompare(b.requiredDispatchDate ?? "9999") || b.outstandingQty - a.outstandingQty);

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
      itemsRemaining: cards.reduce((s, c) => s + c.outstandingQty, 0),
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
): Promise<{ machineId: number | null; machineName: string | null; reason: string }> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) return { machineId: null, machineName: null, reason: "Job not found" };
  const responsibleOperatorId = operatorIdOverride !== undefined ? operatorIdOverride : job.responsibleOperatorId;
  const items = await db.select().from(jobLineItems).where(eq(jobLineItems.jobId, jobId));
  const allMachines = (await db.select().from(machines)).filter(m => m.isActive);

  const isPrint = items.some(li => isPrintJobType(li.jobType));
  if (isPrint) {
    const printMachine = allMachines.find(m => m.id === PRINT_MACHINE_ID);
    if (printMachine) return { machineId: printMachine.id, machineName: printMachine.name, reason: "Print work is routed to the print machine" };
  }
  const embMachines = allMachines.filter(m => m.id !== PRINT_MACHINE_ID);
  if (embMachines.length === 0) return { machineId: null, machineName: null, reason: "No active machines available" };

  // Outstanding quantity per machine across active jobs (line-item machine first, job machine as fallback)
  const activeJobs = await getActiveJobs();
  const activeIds = new Set(activeJobs.map(j => j.id));
  const jobMachine = new Map(activeJobs.map(j => [j.id, j.machineId]));
  const allItems = activeIds.size > 0
    ? await db.select().from(jobLineItems).where(inArray(jobLineItems.jobId, Array.from(activeIds)))
    : [];
  const load = new Map<number, number>();
  for (const li of allItems) {
    if (li.completed) continue;
    const mId = li.machineId ?? jobMachine.get(li.jobId) ?? null;
    if (mId == null) continue;
    load.set(mId, (load.get(mId) ?? 0) + li.quantity);
  }

  // Prefer a machine whose default operator is the job's responsible operator
  const candidates = [...embMachines].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
  if (responsibleOperatorId) {
    const operatorMachine = candidates.find(m => m.defaultOperatorId === responsibleOperatorId);
    if (operatorMachine) {
      return {
        machineId: operatorMachine.id,
        machineName: operatorMachine.name,
        reason: `Usual machine for the responsible operator (current queue: ${(load.get(operatorMachine.id) ?? 0).toLocaleString()} items)`,
      };
    }
  }
  const best = candidates[0];
  return {
    machineId: best.id,
    machineName: best.name,
    reason: `Lightest current queue (${(load.get(best.id) ?? 0).toLocaleString()} items outstanding)`,
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

  const [updated] = await db.update(jobs).set(updates).where(eq(jobs.id, jobId)).returning();
  return updated;
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
  const unallocated = cards.filter(c => c.allocationStatus !== "blocked" && !c.responsibleOperatorId);
  const blocked = cards.filter(c => c.allocationStatus === "blocked");
  const atRisk = cards.filter(c => (c.overdue || c.dueToday) && c.outstandingQty > 0);
  return {
    unallocatedCount: unallocated.length,
    blockedCount: blocked.length,
    atRiskCount: atRisk.length,
  };
}
