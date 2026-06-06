import type { Express } from "express";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { isStaffAuthenticated } from "./staffAuth";
import { isCasualAuthenticated, loginCasual, setCasualPinWithToken, normalizeMobile } from "./casualAuth";
import { sendWhatsAppAsync } from "./highlevelService";
import { subtractTimeSlots, minutesToTime, type TimeSlot } from "@shared/scheduling";
import {
  insertCasualStaffSchema,
  casualLoginSchema,
  casualSetPinSchema,
  generateShiftsSchema,
  claimShiftSchema,
  insertShiftSchema,
  type Shift,
} from "@shared/schema";

const INVITE_TTL_DAYS = 30;
const WEEKLY_LIMIT = 3;
const AMEND_CANCEL_MIN_DAYS = 4;
const FRAGMENT_MIN_MINUTES = 30; // discard slivers smaller than this when splitting
const CLAIM_MIN_MINUTES = 30;

function getBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  return "http://localhost:5000";
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Monday–Sunday week range containing the given date
function getWeekRange(date: Date): { from: Date; to: Date } {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { from: monday, to: sunday };
}

function daysUntil(date: Date): number {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Simple in-memory rate limiter to slow down PIN brute-forcing on the public
// casual login/set-pin endpoints. Keyed by client IP.
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX_ATTEMPTS = 10;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: any, res: any, next: any) {
  const key = (req.ip || req.headers["x-forwarded-for"] || "unknown").toString();
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
  }
  next();
}

// Merge contiguous/overlapping available shift rows for one machine+date into
// the fewest rows. Mutates the DB (deletes fragments, creates merged rows).
async function mergeAvailableShifts(machineId: number, date: Date): Promise<void> {
  await storage.mergeAvailableShiftsAtomic(machineId, date);
}

export function registerCasualShiftRoutes(app: Express) {
  // ============================================================
  // MANAGER ROUTES (staff authenticated)
  // ============================================================

  // List casual staff
  app.get("/api/casual-staff", isStaffAuthenticated, async (_req, res) => {
    try {
      const staff = await storage.listCasualStaff();
      const safe = staff.map(({ pinHash, ...rest }) => ({ ...rest, hasPin: !!pinHash }));
      res.json(safe);
    } catch (error: any) {
      console.error("List casual staff error:", error);
      res.status(500).json({ error: "Failed to load summer staff" });
    }
  });

  // Create casual staff + generate an invite link (best-effort WhatsApp send)
  app.post("/api/casual-staff", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertCasualStaffSchema.parse(req.body);
      const mobileNumber = normalizeMobile(data.mobileNumber);

      const existing = await storage.getCasualStaffByMobile(mobileNumber);
      if (existing) {
        return res.status(409).json({ error: "Someone with this mobile number already exists." });
      }

      const member = await storage.createCasualStaff({ ...data, mobileNumber });
      const { token, inviteUrl } = await issueInvite(member.id);
      await storage.updateCasualStaff(member.id, { inviteSentAt: new Date() });

      const message = `Hi ${member.firstName}, you've been added as summer staff at Select Branding. Set your PIN and pick your shifts here: ${inviteUrl}`;
      const sent = await trySend(mobileNumber, message, member.firstName, member.lastName);

      res.json({ id: member.id, inviteUrl, token, whatsappSent: sent });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Create casual staff error:", error);
      res.status(500).json({ error: "Failed to add summer staff" });
    }
  });

  // Re-issue an invite link
  app.post("/api/casual-staff/:id/invite", isStaffAuthenticated, async (req, res) => {
    try {
      const member = await storage.getCasualStaffById(req.params.id);
      if (!member) return res.status(404).json({ error: "Not found" });
      const { token, inviteUrl } = await issueInvite(member.id);
      await storage.updateCasualStaff(member.id, { inviteSentAt: new Date() });
      const message = `Hi ${member.firstName}, here's your link to set your PIN and pick shifts at Select Branding: ${inviteUrl}`;
      const sent = await trySend(member.mobileNumber, message, member.firstName, member.lastName);
      res.json({ inviteUrl, token, whatsappSent: sent });
    } catch (error: any) {
      console.error("Reissue invite error:", error);
      res.status(500).json({ error: "Failed to create invite link" });
    }
  });

  // Activate / deactivate
  app.patch("/api/casual-staff/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const { active, firstName, lastName } = req.body || {};
      const updates: any = {};
      if (typeof active === "boolean") updates.active = active;
      if (typeof firstName === "string" && firstName.trim()) updates.firstName = firstName.trim();
      if (typeof lastName === "string") updates.lastName = lastName.trim();
      const member = await storage.updateCasualStaff(req.params.id, updates);
      const { pinHash, ...safe } = member;
      res.json(safe);
    } catch (error: any) {
      console.error("Update casual staff error:", error);
      res.status(500).json({ error: "Failed to update summer staff" });
    }
  });

  app.delete("/api/casual-staff/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteCasualStaff(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete casual staff error:", error);
      res.status(500).json({ error: "Failed to remove summer staff" });
    }
  });

  // List shifts (manager view) — optional ?status= & date range
  app.get("/api/shifts", isStaffAuthenticated, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const from = req.query.from ? new Date(String(req.query.from)) : undefined;
      const to = req.query.to ? new Date(String(req.query.to)) : undefined;
      const shifts = await storage.listShifts({ status, from, to });
      res.json(await decorateShifts(shifts));
    } catch (error: any) {
      console.error("List shifts error:", error);
      res.status(500).json({ error: "Failed to load shifts" });
    }
  });

  // Generate suggested shifts from machine availability
  app.post("/api/shifts/generate-suggestions", isStaffAuthenticated, async (req, res) => {
    try {
      const input = generateShiftsSchema.parse(req.body || {});
      if (input.dailyEndTime <= input.dailyStartTime) {
        return res.status(400).json({ error: "End time must be after start time." });
      }

      // Clear previous (unpublished) suggestions so re-running is idempotent
      await storage.deleteSuggestedShifts();

      const today = startOfDay(new Date());
      const rangeStart = new Date(today);
      rangeStart.setDate(today.getDate() + 1); // start tomorrow
      const rangeEnd = new Date(today);
      rangeEnd.setDate(today.getDate() + input.weeks * 7);
      rangeEnd.setHours(23, 59, 59, 999);

      const [machines, machineBlocks, jobSchedules, bankHolidays] = await Promise.all([
        storage.getMachines(),
        storage.getMachineScheduleBlocks(undefined, rangeStart, rangeEnd),
        storage.getJobSchedules(undefined, undefined, undefined, rangeStart, rangeEnd),
        storage.getBankHolidays(rangeStart, rangeEnd),
      ]);

      const activeMachines = machines.filter((m) => m.isActive);
      const operating: TimeSlot = { startTime: input.dailyStartTime, endTime: input.dailyEndTime };
      const toCreate: Array<{ machineId: number; date: Date; startTime: number; endTime: number; status: string }> = [];

      for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day === 0 && !input.includeSunday) continue;
        if (day === 6 && !input.includeSaturday) continue;
        if (bankHolidays.some((bh) => sameDay(new Date(bh.date), d))) continue;

        const dayDate = startOfDay(d);
        for (const machine of activeMachines) {
          const blocked: TimeSlot[] = [];
          for (const b of machineBlocks) {
            if (b.machineId === machine.id && sameDay(new Date(b.date), dayDate)) {
              blocked.push({ startTime: b.startTime, endTime: b.endTime });
            }
          }
          for (const js of jobSchedules) {
            if (js.machineId === machine.id && sameDay(new Date(js.scheduledDate), dayDate)) {
              blocked.push({ startTime: js.startTime, endTime: js.endTime });
            }
          }

          const slots = subtractTimeSlots(operating, blocked);
          for (const slot of slots) {
            if (slot.endTime - slot.startTime >= input.minShiftMinutes) {
              toCreate.push({
                machineId: machine.id,
                date: dayDate,
                startTime: slot.startTime,
                endTime: slot.endTime,
                status: "suggested",
              });
            }
          }
        }
      }

      const count = await storage.createShiftsBulk(toCreate);
      res.json({ created: count });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Generate suggestions error:", error);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  // Manually create a shift (manager) — created as available
  app.post("/api/shifts", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertShiftSchema.parse({
        ...req.body,
        date: req.body.date ? new Date(req.body.date) : undefined,
      });
      if (data.endTime <= data.startTime) {
        return res.status(400).json({ error: "End time must be after start time." });
      }
      const status = req.body.status === "suggested" ? "suggested" : "available";
      const shift = await storage.createShift({ ...data, date: startOfDay(new Date(data.date)), status });
      res.json(shift);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Create shift error:", error);
      res.status(500).json({ error: "Failed to create shift" });
    }
  });

  // Edit a shift (manager) — times/date only
  app.patch("/api/shifts/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const shift = await storage.getShift(req.params.id);
      if (!shift) return res.status(404).json({ error: "Not found" });
      const updates: Partial<Shift> = {};
      if (req.body.startTime != null) updates.startTime = Number(req.body.startTime);
      if (req.body.endTime != null) updates.endTime = Number(req.body.endTime);
      if (req.body.date) updates.date = startOfDay(new Date(req.body.date));
      const s = updates.startTime ?? shift.startTime;
      const e = updates.endTime ?? shift.endTime;
      if (e <= s) return res.status(400).json({ error: "End time must be after start time." });
      const updated = await storage.updateShift(req.params.id, updates);
      res.json(updated);
    } catch (error: any) {
      console.error("Update shift error:", error);
      res.status(500).json({ error: "Failed to update shift" });
    }
  });

  app.delete("/api/shifts/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteShift(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete shift error:", error);
      res.status(500).json({ error: "Failed to delete shift" });
    }
  });

  // Publish suggested shifts → available. Optional body { ids: [] } to publish a subset.
  app.post("/api/shifts/publish", isStaffAuthenticated, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
      const published = await storage.publishShifts(ids);

      // Notify active casual staff that shifts are live (best-effort WhatsApp)
      if (published > 0) {
        const baseUrl = getBaseUrl();
        const staff = await storage.listCasualStaff();
        for (const member of staff) {
          if (member.active && member.pinHash) {
            sendWhatsAppAsync(
              member.mobileNumber,
              `Hi ${member.firstName}, new shifts are available at Select Branding. Grab yours here: ${baseUrl}/casual`,
              { firstName: member.firstName, lastName: member.lastName ?? undefined },
            );
          }
        }
      }

      res.json({ published });
    } catch (error: any) {
      console.error("Publish shifts error:", error);
      res.status(500).json({ error: "Failed to publish shifts" });
    }
  });

  // ============================================================
  // CASUAL STAFF ROUTES (mobile portal)
  // ============================================================

  app.post("/api/casual/set-pin", rateLimit, async (req, res) => {
    try {
      const data = casualSetPinSchema.parse(req.body);
      const member = await setCasualPinWithToken(data.token, data.pin);
      (req.session as any).casualStaffId = member.id;
      res.json({ id: member.id, firstName: member.firstName });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      res.status(400).json({ error: error.message || "Could not set PIN" });
    }
  });

  app.post("/api/casual/login", rateLimit, async (req, res) => {
    try {
      const data = casualLoginSchema.parse(req.body);
      const member = await loginCasual(data);
      (req.session as any).casualStaffId = member.id;
      res.json({ id: member.id, firstName: member.firstName, lastName: member.lastName });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      res.status(401).json({ error: error.message || "Login failed" });
    }
  });

  app.post("/api/casual/logout", (req, res) => {
    (req.session as any).casualStaffId = undefined;
    res.json({ success: true });
  });

  app.get("/api/casual/me", isCasualAuthenticated, async (req, res) => {
    try {
      const id = (req.session as any).casualStaffId;
      const member = await storage.getCasualStaffById(id);
      if (!member || !member.active) {
        (req.session as any).casualStaffId = undefined;
        return res.status(401).json({ error: "Login required" });
      }
      const { from, to } = getWeekRange(new Date());
      const weekCount = await storage.countClaimedShiftsInRange(id, from, to);
      res.json({
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        weeklyLimit: WEEKLY_LIMIT,
        shiftsThisWeek: weekCount,
      });
    } catch (error: any) {
      console.error("Casual me error:", error);
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  // Available shifts (future only)
  app.get("/api/casual/shifts/available", isCasualAuthenticated, async (_req, res) => {
    try {
      const now = startOfDay(new Date());
      const shifts = await storage.listShifts({ status: "available", from: now });
      res.json(await decorateShifts(shifts));
    } catch (error: any) {
      console.error("Available shifts error:", error);
      res.status(500).json({ error: "Failed to load available shifts" });
    }
  });

  // My claimed shifts
  app.get("/api/casual/shifts/mine", isCasualAuthenticated, async (req, res) => {
    try {
      const id = (req.session as any).casualStaffId;
      const shifts = await storage.getShiftsClaimedBy(id);
      const decorated = await decorateShifts(shifts);
      const withFlags = decorated.map((s: any) => ({
        ...s,
        canModify: daysUntil(new Date(s.date)) >= AMEND_CANCEL_MIN_DAYS,
      }));
      res.json(withFlags);
    } catch (error: any) {
      console.error("My shifts error:", error);
      res.status(500).json({ error: "Failed to load your shifts" });
    }
  });

  // Claim a shift (optionally a sub-range of the window). Atomic: the split,
  // weekly-limit check and ownership are all done inside a DB transaction with a
  // row lock so concurrent claims can't double-book or exceed the weekly cap.
  app.post("/api/casual/shifts/:id/claim", isCasualAuthenticated, async (req, res) => {
    try {
      const id = (req.session as any).casualStaffId;
      const shift = await storage.getShift(req.params.id);
      if (!shift) {
        return res.status(409).json({ error: "Sorry, that shift is no longer available." });
      }

      const body = claimShiftSchema.partial().parse(req.body || {});
      const { from, to } = getWeekRange(new Date(shift.date));

      const claimed = await storage.claimShiftAtomic({
        shiftId: req.params.id,
        casualStaffId: id,
        start: body.startTime,
        end: body.endTime,
        weeklyLimit: WEEKLY_LIMIT,
        weekFrom: from,
        weekTo: to,
        minMinutes: CLAIM_MIN_MINUTES,
        fragmentMinMinutes: FRAGMENT_MIN_MINUTES,
      });

      res.json(claimed);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      if (error.code === "UNAVAILABLE") {
        return res.status(409).json({ error: error.message });
      }
      if (["PAST", "OUT_OF_RANGE", "TOO_SHORT", "WEEKLY_LIMIT"].includes(error.code)) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Claim shift error:", error);
      res.status(500).json({ error: "Failed to claim shift" });
    }
  });

  // Cancel a claimed shift (>= 4 days ahead) → back to available
  app.post("/api/casual/shifts/:id/cancel", isCasualAuthenticated, async (req, res) => {
    try {
      const id = (req.session as any).casualStaffId;
      const shift = await storage.getShift(req.params.id);
      if (!shift || shift.claimedById !== id || shift.status !== "claimed") {
        return res.status(404).json({ error: "Shift not found" });
      }
      if (daysUntil(new Date(shift.date)) < AMEND_CANCEL_MIN_DAYS) {
        return res.status(400).json({ error: `Shifts can only be cancelled ${AMEND_CANCEL_MIN_DAYS}+ days ahead.` });
      }

      await storage.updateShift(shift.id, { status: "available", claimedById: null, claimedAt: null });
      await mergeAvailableShifts(shift.machineId, new Date(shift.date));

      // Notify other active staff a shift opened up (best-effort)
      const baseUrl = getBaseUrl();
      const staff = await storage.listCasualStaff();
      for (const member of staff) {
        if (member.id !== id && member.active && member.pinHash) {
          sendWhatsAppAsync(
            member.mobileNumber,
            `Hi ${member.firstName}, a shift just opened up at Select Branding. Grab it here: ${baseUrl}/casual`,
            { firstName: member.firstName, lastName: member.lastName ?? undefined },
          );
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Cancel shift error:", error);
      res.status(500).json({ error: "Failed to cancel shift" });
    }
  });

  // Amend a claimed shift's hours (shrink within current window, >= 4 days ahead)
  app.post("/api/casual/shifts/:id/amend", isCasualAuthenticated, async (req, res) => {
    try {
      const id = (req.session as any).casualStaffId;
      const shift = await storage.getShift(req.params.id);
      if (!shift || shift.claimedById !== id || shift.status !== "claimed") {
        return res.status(404).json({ error: "Shift not found" });
      }
      if (daysUntil(new Date(shift.date)) < AMEND_CANCEL_MIN_DAYS) {
        return res.status(400).json({ error: `Shifts can only be changed ${AMEND_CANCEL_MIN_DAYS}+ days ahead.` });
      }

      const { startTime: s, endTime: e } = claimShiftSchema.parse(req.body);
      if (e <= s || s < shift.startTime || e > shift.endTime) {
        return res.status(400).json({ error: "New times must be within your current shift." });
      }
      if (e - s < CLAIM_MIN_MINUTES) {
        return res.status(400).json({ error: `Shifts must be at least ${CLAIM_MIN_MINUTES} minutes.` });
      }

      const oldStart = shift.startTime;
      const oldEnd = shift.endTime;
      const updated = await storage.updateShift(shift.id, { startTime: s, endTime: e });

      // Release freed time back to available
      if (s - oldStart >= FRAGMENT_MIN_MINUTES) {
        await storage.createShift({
          machineId: shift.machineId,
          date: startOfDay(new Date(shift.date)),
          startTime: oldStart,
          endTime: s,
          status: "available",
        });
      }
      if (oldEnd - e >= FRAGMENT_MIN_MINUTES) {
        await storage.createShift({
          machineId: shift.machineId,
          date: startOfDay(new Date(shift.date)),
          startTime: e,
          endTime: oldEnd,
          status: "available",
        });
      }
      await mergeAvailableShifts(shift.machineId, new Date(shift.date));

      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Amend shift error:", error);
      res.status(500).json({ error: "Failed to change shift" });
    }
  });

  // ---------- helpers ----------

  async function issueInvite(casualStaffId: string) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await storage.createCasualInviteToken({ casualStaffId, token, expiresAt });
    const inviteUrl = `${getBaseUrl()}/casual/set-pin?token=${token}`;
    return { token, inviteUrl };
  }

  async function trySend(mobile: string, message: string, firstName?: string, lastName?: string | null) {
    try {
      const { sendWhatsApp } = await import("./highlevelService");
      return await sendWhatsApp(mobile, message, { firstName, lastName: lastName ?? undefined });
    } catch {
      return false;
    }
  }

  // Attach machine name + readable times, plus claimant name for manager views
  async function decorateShifts(shifts: Shift[]) {
    const machines = await storage.getMachines();
    const machineMap = new Map(machines.map((m) => [m.id, m.name]));
    const claimantIds = Array.from(new Set(shifts.map((s) => s.claimedById).filter(Boolean))) as string[];
    const claimantMap = new Map<string, string>();
    for (const cid of claimantIds) {
      const c = await storage.getCasualStaffById(cid);
      if (c) claimantMap.set(cid, `${c.firstName}${c.lastName ? " " + c.lastName : ""}`);
    }
    return shifts.map((s) => ({
      ...s,
      machineName: machineMap.get(s.machineId) ?? `Machine ${s.machineId}`,
      startLabel: minutesToTime(s.startTime),
      endLabel: minutesToTime(s.endTime),
      claimedByName: s.claimedById ? claimantMap.get(s.claimedById) ?? null : null,
    }));
  }
}
