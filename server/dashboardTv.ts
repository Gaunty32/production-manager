import { storage } from "./storage";
import { PRINT_MACHINE_ID } from "@shared/machines";
import {
  getStaffAvailableSlots,
  getStaffMachineAllocationSlots,
  isStaffOnHoliday,
  type TimeSlot,
} from "@shared/scheduling";

const TZ = "Europe/London";

function londonDateStr(d: Date): string {
  // en-CA renders as YYYY-MM-DD
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function londonMonthStr(d: Date): string {
  return londonDateStr(d).slice(0, 7);
}

function londonMinutesNow(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return (h % 24) * 60 + m;
}

function londonTimeHHMM(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Merge a list of time slots into non-overlapping ranges and sum their length.
function unionMinutes(slots: TimeSlot[]): number {
  if (slots.length === 0) return 0;
  const sorted = [...slots].sort((a, b) => a.startTime - b.startTime);
  let total = 0;
  let curStart = sorted[0].startTime;
  let curEnd = sorted[0].endTime;
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.startTime <= curEnd) {
      curEnd = Math.max(curEnd, s.endTime);
    } else {
      total += curEnd - curStart;
      curStart = s.startTime;
      curEnd = s.endTime;
    }
  }
  total += curEnd - curStart;
  return total;
}

function intersect(a: TimeSlot, b: TimeSlot): TimeSlot | null {
  const start = Math.max(a.startTime, b.startTime);
  const end = Math.min(a.endTime, b.endTime);
  return end > start ? { startTime: start, endTime: end } : null;
}

export const DAILY_TARGET_KEY = "dashboard_tv_daily_target";
export const TOKEN_KEY = "dashboard_tv_token";
export const SLUG_KEY = "dashboard_tv_slug";
export const DEFAULT_DAILY_TARGET = 750;

// Short, easy-to-type code for entering the dashboard URL on a TV / Firestick remote.
// Uses an unambiguous alphabet (no 0/o/1/l/i) so it's easy to read and type.
export function generateTvSlug(): string {
  const chars = "23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function buildDashboardTvData() {
  const now = new Date();
  const todayStr = londonDateStr(now);
  const monthStr = londonMonthStr(now);
  const nowMin = londonMinutesNow(now);
  // Noon "today" date so getDay()/toDateString() in the scheduling helpers
  // line up with the London calendar date (server runs in UTC).
  const today = new Date(`${todayStr}T12:00:00Z`);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = londonDateStr(tomorrow);

  const [
    jobs,
    allLineItems,
    customers,
    staff,
    machines,
    schedules,
    productionEntries,
    shifts,
    allocations,
    holidays,
    jobErrors,
  ] = await Promise.all([
    storage.getJobs(),
    storage.getAllJobLineItems(),
    storage.getCustomers(),
    storage.getStaff(),
    storage.getMachines(),
    storage.getJobSchedules(),
    storage.getProductionEntries(),
    storage.getStaffShifts(),
    storage.getStaffMachineAllocations(),
    storage.getStaffHolidays(),
    storage.getAllJobErrors(),
  ]);

  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const machineById = new Map(machines.map((m) => [m.id, m]));

  // Line items grouped by job
  const lineItemsByJob = new Map<string, typeof allLineItems>();
  for (const li of allLineItems) {
    const arr = lineItemsByJob.get(li.jobId) ?? [];
    arr.push(li);
    lineItemsByJob.set(li.jobId, arr);
  }

  // Quantity produced per line item (all time) from production entries
  const producedByLineItem = new Map<string, number>();
  for (const e of productionEntries) {
    producedByLineItem.set(
      e.lineItemId,
      (producedByLineItem.get(e.lineItemId) ?? 0) + (e.quantityCompleted ?? 0),
    );
  }

  const remainingForLineItem = (li: (typeof allLineItems)[number]): number => {
    if (li.completed) return 0;
    return Math.max(0, li.quantity - (producedByLineItem.get(li.id) ?? 0));
  };

  // Per-job helpers
  const dueDateStr = (jobId: string, j: (typeof jobs)[number]): string | null =>
    j.requiredDispatchDate ? londonDateStr(new Date(j.requiredDispatchDate)) : null;

  const jobCompletionDateStr = (jobId: string): string | null => {
    const items = lineItemsByJob.get(jobId) ?? [];
    let max: number | null = null;
    for (const li of items) {
      if (li.completedAt) {
        const t = new Date(li.completedAt).getTime();
        if (max === null || t > max) max = t;
      }
    }
    return max === null ? null : londonDateStr(new Date(max));
  };

  const isActive = (j: (typeof jobs)[number]) =>
    !j.completed && j.status === "production";

  // ── Section 1: Today's Production ──────────────────────────────────────────
  let ordersDueToday = 0;
  let ordersOverdue = 0;
  let ordersCompletedToday = 0;
  let ordersRemainingToday = 0;

  for (const j of jobs) {
    const due = dueDateStr(j.id, j);
    const compDate = j.completed ? jobCompletionDateStr(j.id) : null;
    if (compDate === todayStr) ordersCompletedToday++;
    if (due === todayStr && j.status !== "pending_customer_approval") {
      ordersDueToday++;
      if (!j.completed) ordersRemainingToday++;
    }
    if (isActive(j) && due && due < todayStr) ordersOverdue++;
  }

  // Garments completed today (production entries dated today)
  let garmentsCompletedToday = 0;
  for (const e of productionEntries) {
    if (londonDateStr(new Date(e.workDate)) === todayStr) {
      garmentsCompletedToday += e.quantityCompleted ?? 0;
    }
  }

  // Garments remaining for today's workload (active jobs due today or overdue)
  let garmentsRemainingToday = 0;
  for (const j of jobs) {
    if (!isActive(j)) continue;
    const due = dueDateStr(j.id, j);
    if (due && due <= todayStr) {
      for (const li of lineItemsByJob.get(j.id) ?? []) {
        garmentsRemainingToday += remainingForLineItem(li);
      }
    }
  }

  // ── Section 2: Daily Target ─────────────────────────────────────────────────
  const targetRaw = await storage.getAppSetting(DAILY_TARGET_KEY);
  const dailyTarget = Math.max(1, parseInt(targetRaw ?? "", 10) || DEFAULT_DAILY_TARGET);
  const targetCompleted = garmentsCompletedToday;
  const targetRemaining = Math.max(0, dailyTarget - targetCompleted);
  const targetPercent = Math.min(100, Math.round((targetCompleted / dailyTarget) * 100));

  // ── Machine capacity / utilisation ─────────────────────────────────────────
  const onHolidayToday = new Set(
    staff.filter((s) => isStaffOnHoliday(today, s.id, holidays)).map((s) => s.id),
  );

  // Scheduled minutes today per machine + current job / scheduled line items
  const scheduledMinutesByMachine = new Map<number, number>();
  const todaySchedulesByMachine = new Map<number, typeof schedules>();
  for (const sc of schedules) {
    if (londonDateStr(new Date(sc.scheduledDate)) !== todayStr) continue;
    scheduledMinutesByMachine.set(
      sc.machineId,
      (scheduledMinutesByMachine.get(sc.machineId) ?? 0) + Math.max(0, sc.endTime - sc.startTime),
    );
    const arr = todaySchedulesByMachine.get(sc.machineId) ?? [];
    arr.push(sc);
    todaySchedulesByMachine.set(sc.machineId, arr);
  }

  // Staffed (capacity) minutes per machine: union of operator coverage today
  const capacityMinutesByMachine = new Map<number, number>();
  for (const m of machines) {
    if (!m.isActive) continue;
    const coverage: TimeSlot[] = [];
    for (const s of staff) {
      if (onHolidayToday.has(s.id)) continue;
      const avail = getStaffAvailableSlots(today, s.id, shifts);
      if (avail.length === 0) continue;
      const allocSlots = getStaffMachineAllocationSlots(today, m.id, s.id, allocations);
      if (allocSlots === null) {
        // No allocations: staff can work any machine during their shift
        coverage.push(...avail);
      } else if (allocSlots.length > 0) {
        for (const a of avail) {
          for (const al of allocSlots) {
            const inter = intersect(a, al);
            if (inter) coverage.push(inter);
          }
        }
      }
      // allocSlots === [] -> allocated elsewhere, no coverage for this machine
    }
    capacityMinutesByMachine.set(m.id, unionMinutes(coverage));
  }

  // Items completed today per machine (production entries)
  const itemsCompletedByMachine = new Map<number, number>();
  for (const e of productionEntries) {
    if (e.machineId == null) continue;
    if (londonDateStr(new Date(e.workDate)) !== todayStr) continue;
    itemsCompletedByMachine.set(
      e.machineId,
      (itemsCompletedByMachine.get(e.machineId) ?? 0) + (e.quantityCompleted ?? 0),
    );
  }

  // Operator covering "now" for a machine (allocation first, else default operator)
  const operatorNowForMachine = (machineId: number): string | null => {
    const m = machineById.get(machineId);
    // Default operator takes precedence when configured (mirrors machine sheet behaviour)
    if (m?.defaultOperatorId && !onHolidayToday.has(m.defaultOperatorId)) {
      const avail = getStaffAvailableSlots(today, m.defaultOperatorId, shifts);
      if (avail.some((sl) => sl.startTime <= nowMin && nowMin < sl.endTime)) {
        return staffName.get(m.defaultOperatorId) ?? null;
      }
    }
    for (const s of staff) {
      if (onHolidayToday.has(s.id)) continue;
      const allocSlots = getStaffMachineAllocationSlots(today, machineId, s.id, allocations);
      const onShiftNow = () =>
        getStaffAvailableSlots(today, s.id, shifts).some(
          (sl) => sl.startTime <= nowMin && nowMin < sl.endTime,
        );
      if (allocSlots === null) {
        // No allocations: staff can work any machine during their shift
        if (onShiftNow()) return s.name;
      } else if (allocSlots.some((sl) => sl.startTime <= nowMin && nowMin < sl.endTime)) {
        if (onShiftNow()) return s.name;
      }
    }
    if (m?.defaultOperatorId) return staffName.get(m.defaultOperatorId) ?? null;
    return null;
  };

  const machineCards = machines
    .filter((m) => m.isActive)
    .map((m) => {
      const capacity = capacityMinutesByMachine.get(m.id) ?? 0;
      const used = Math.min(scheduledMinutesByMachine.get(m.id) ?? 0, capacity || Infinity);
      const utilisation = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;

      // Current job (schedule covering "now")
      const todays = todaySchedulesByMachine.get(m.id) ?? [];
      const current = todays.find((sc) => sc.startTime <= nowMin && nowMin < sc.endTime);
      let currentJobLabel: string | null = null;
      let operator: string | null = null;
      if (current) {
        const job = jobs.find((j) => j.id === current.jobId);
        if (job) {
          const cust = customerName.get(job.customerId) ?? "";
          currentJobLabel = cust ? `${cust} — ${job.jobName}` : job.jobName;
        }
        operator = staffName.get(current.staffId) ?? null;
      }
      if (!operator) operator = operatorNowForMachine(m.id);

      // Items remaining for line items scheduled to this machine today
      let itemsRemaining = 0;
      const seen = new Set<string>();
      for (const sc of todays) {
        if (sc.lineItemId && !seen.has(sc.lineItemId)) {
          seen.add(sc.lineItemId);
          const li = allLineItems.find((x) => x.id === sc.lineItemId);
          if (li) itemsRemaining += remainingForLineItem(li);
        }
      }

      return {
        id: m.id,
        name: m.name,
        currentJob: currentJobLabel,
        operator,
        itemsCompletedToday: itemsCompletedByMachine.get(m.id) ?? 0,
        itemsRemainingToday: itemsRemaining,
        utilisation,
        hasCapacity: capacity > 0,
      };
    });

  // ── Section 3: Capacity remaining by discipline ─────────────────────────────
  const disciplineCapacity = (machineIds: number[]) => {
    let capacity = 0;
    let used = 0;
    for (const id of machineIds) {
      const cap = capacityMinutesByMachine.get(id) ?? 0;
      capacity += cap;
      used += Math.min(scheduledMinutesByMachine.get(id) ?? 0, cap || Infinity);
    }
    const remaining = capacity - used;
    const utilisation = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
    let status: "green" | "amber" | "red" | "none" = "none";
    if (capacity > 0) {
      status = utilisation < 85 ? "green" : utilisation < 100 ? "amber" : "red";
    }
    return {
      capacityHours: Math.round((capacity / 60) * 10) / 10,
      usedHours: Math.round((used / 60) * 10) / 10,
      remainingHours: Math.round((remaining / 60) * 10) / 10,
      utilisation,
      status,
    };
  };

  const embroideryMachineIds = machines
    .filter((m) => m.isActive && m.id !== PRINT_MACHINE_ID)
    .map((m) => m.id);
  const printMachineIds = machines
    .filter((m) => m.isActive && m.id === PRINT_MACHINE_ID)
    .map((m) => m.id);

  const capacity = {
    embroidery: disciplineCapacity(embroideryMachineIds),
    print: printMachineIds.length > 0 ? disciplineCapacity(printMachineIds) : null,
    packing: null as null, // No scheduling data for packing/dispatch yet
  };

  // ── Section 5: Service Level ─────────────────────────────────────────────────
  let shippedOnTimeToday = 0;
  let monthCompleted = 0;
  let monthOnTime = 0;
  let monthTurnaroundSum = 0;
  let monthTurnaroundCount = 0;
  let ordersAtRisk = 0;

  for (const j of jobs) {
    const compDate = j.completed ? jobCompletionDateStr(j.id) : null;
    if (compDate === todayStr && j.completedOnTime === true) shippedOnTimeToday++;
    if (compDate && compDate.slice(0, 7) === monthStr) {
      monthCompleted++;
      if (j.completedOnTime === true) monthOnTime++;
      if (j.submittedAt) {
        const items = lineItemsByJob.get(j.id) ?? [];
        let maxComp: number | null = null;
        for (const li of items) {
          if (li.completedAt) {
            const t = new Date(li.completedAt).getTime();
            if (maxComp === null || t > maxComp) maxComp = t;
          }
        }
        if (maxComp !== null) {
          const days = (maxComp - new Date(j.submittedAt).getTime()) / 86400000;
          if (days >= 0) {
            monthTurnaroundSum += days;
            monthTurnaroundCount++;
          }
        }
      }
    }
    const due = dueDateStr(j.id, j);
    if (isActive(j) && (due === todayStr || due === tomorrowStr)) ordersAtRisk++;
  }

  const serviceLevel = {
    shippedOnTimeToday,
    onTimeDispatchPercent: monthCompleted > 0 ? Math.round((monthOnTime / monthCompleted) * 100) : null,
    ordersAtRisk,
    avgTurnaroundDays:
      monthTurnaroundCount > 0
        ? Math.round((monthTurnaroundSum / monthTurnaroundCount) * 10) / 10
        : null,
  };

  // ── Section 6: Quality ───────────────────────────────────────────────────────
  let lastErrorMs: number | null = null;
  let errorsThisMonth = 0;
  const errorJobIdsThisMonth = new Set<string>();
  for (const e of jobErrors) {
    const t = new Date(e.reportedAt).getTime();
    if (lastErrorMs === null || t > lastErrorMs) lastErrorMs = t;
    if (londonMonthStr(new Date(e.reportedAt)) === monthStr) {
      errorsThisMonth++;
      errorJobIdsThisMonth.add(e.jobId);
    }
  }
  const daysSinceLastError =
    lastErrorMs === null ? null : Math.floor((now.getTime() - lastErrorMs) / 86400000);
  const errorFreeOrderPercent =
    monthCompleted > 0
      ? Math.max(0, Math.round(((monthCompleted - errorJobIdsThisMonth.size) / monthCompleted) * 100))
      : null;

  const quality = {
    daysSinceLastError,
    errorsThisMonth,
    errorFreeOrderPercent,
  };

  // ── Section 7: Revenue / Production value ────────────────────────────────────
  let valueCompletedToday = 0;
  let valueMTD = 0;
  let valueDueToday = 0;
  let valueOverdue = 0;
  for (const j of jobs) {
    const total = j.invoiceTotal ?? 0;
    if (j.invoicedAt) {
      const invStr = londonDateStr(new Date(j.invoicedAt));
      if (invStr === todayStr) valueCompletedToday += total;
      if (invStr.slice(0, 7) === monthStr) valueMTD += total;
    }
    const due = dueDateStr(j.id, j);
    if (isActive(j) && due === todayStr) valueDueToday += total;
    if (isActive(j) && due && due < todayStr) valueOverdue += total;
  }
  const value = {
    completedToday: Math.round(valueCompletedToday),
    monthToDate: Math.round(valueMTD),
    dueToday: Math.round(valueDueToday),
    overdue: Math.round(valueOverdue),
  };

  // ── Section 8: Active Team ───────────────────────────────────────────────────
  const onShiftNow: string[] = [];
  for (const s of staff) {
    if (onHolidayToday.has(s.id)) continue;
    const avail = getStaffAvailableSlots(today, s.id, shifts);
    if (avail.some((sl) => sl.startTime <= nowMin && nowMin < sl.endTime)) {
      onShiftNow.push(s.name);
    }
  }
  const machineAssignments = machineCards
    .filter((m) => m.operator)
    .map((m) => ({ machine: m.name, operator: m.operator as string }));
  const unassignedMachines = machineCards
    .filter((m) => m.hasCapacity && !m.operator)
    .map((m) => m.name);

  const team = {
    onShiftCount: onShiftNow.length,
    onShift: onShiftNow,
    assignments: machineAssignments,
    unassignedMachines,
  };

  // ── Section 9: Alerts ────────────────────────────────────────────────────────
  type Alert = { severity: "red" | "amber" | "blue"; label: string; count: number };
  const alerts: Alert[] = [];

  // Due today not started (no production on any line item)
  let dueTodayNotStarted = 0;
  let waitingStockJobs = 0;
  let waitingArtworkJobs = 0;
  for (const j of jobs) {
    if (!isActive(j)) continue;
    const items = lineItemsByJob.get(j.id) ?? [];
    const due = dueDateStr(j.id, j);
    if (due === todayStr) {
      const anyProduced = items.some((li) => (producedByLineItem.get(li.id) ?? 0) > 0 || li.completed);
      if (!anyProduced) dueTodayNotStarted++;
    }
    if (items.some((li) => li.awaitingStock)) waitingStockJobs++;
    if (items.some((li) => !li.logoApproved)) waitingArtworkJobs++;
  }
  const waitingCustomer = jobs.filter((j) => j.status === "pending_customer_approval").length;

  if (ordersOverdue > 0) alerts.push({ severity: "red", label: "Orders overdue", count: ordersOverdue });
  if (dueTodayNotStarted > 0)
    alerts.push({ severity: "red", label: "Due today, not started", count: dueTodayNotStarted });
  if (ordersAtRisk > 0)
    alerts.push({ severity: "amber", label: "At risk of missing dispatch", count: ordersAtRisk });
  if (waitingStockJobs > 0)
    alerts.push({ severity: "amber", label: "Waiting for stock", count: waitingStockJobs });
  if (waitingArtworkJobs > 0)
    alerts.push({ severity: "amber", label: "Waiting for artwork approval", count: waitingArtworkJobs });
  if (unassignedMachines.length > 0)
    alerts.push({ severity: "amber", label: "Machines with no operator", count: unassignedMachines.length });
  if (waitingCustomer > 0)
    alerts.push({ severity: "blue", label: "Waiting for customer response", count: waitingCustomer });

  const severityRank = { red: 0, amber: 1, blue: 2 } as const;
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    lastUpdated: londonTimeHHMM(now),
    todaysProduction: {
      ordersDueToday,
      ordersCompletedToday,
      ordersRemainingToday,
      ordersOverdue,
      garmentsCompletedToday,
      garmentsRemainingToday,
    },
    dailyTarget: {
      target: dailyTarget,
      completed: targetCompleted,
      remaining: targetRemaining,
      percent: targetPercent,
    },
    capacity,
    machines: machineCards,
    serviceLevel,
    quality,
    value,
    team,
    alerts,
  };
}
