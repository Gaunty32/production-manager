import express from "express";
import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { buildDashboardTvData, TOKEN_KEY, SLUG_KEY, DAILY_TARGET_KEY, DEFAULT_DAILY_TARGET, generateTvSlug } from "./dashboardTv";
import { PRINT_MACHINE_ID, isPrintJobType } from "@shared/machines";
import bcrypt from "bcrypt";
import { 
  insertCustomerSchema, 
  updateCustomerSchema, 
  insertStaffSchema, 
  updateStaffSchema, 
  insertJobSchema, 
  updateJobSchema,
  insertStaffShiftSchema,
  updateStaffShiftSchema,
  insertMachineScheduleBlockSchema,
  updateMachineScheduleBlockSchema,
  insertJobScheduleSchema,
  updateJobScheduleSchema,
  insertJobLineItemSchema,
  updateJobLineItemSchema,
  insertStaffMachineAllocationSchema,
  updateStaffMachineAllocationSchema,
  insertStaffHolidaySchema,
  updateStaffHolidaySchema,
  insertBankHolidaySchema,
  updateBankHolidaySchema,
  insertLogoSetupSchema,
  updateLogoSetupSchema,
  insertJobErrorSchema,
  updateJobErrorSchema,
  insertConversationSchema,
  insertConversationMessageSchema,
  insertSampleSchema,
  insertSampleFileSchema,
  featureRequests,
} from "@shared/schema";
import { z } from "zod";
import { xeroService } from "./xero";
import { dpdService } from "./dpd";
import { calculateJobPrice, calculateShippingCost, CODE_TO_PRINT_SIZE } from "@shared/pricing";
import { loginCustomer, registerCustomer, resetCustomerPassword, isCustomerAuthenticated, attachCustomerUser } from "./customerAuth";
import { loginStaff, registerStaff, isStaffAuthenticated, attachUser } from "./staffAuth";
import { registerCasualShiftRoutes } from "./casualShiftRoutes";
import { registerPurchasingRoutes } from "./purchasingRoutes";
import { customerLoginSchema, insertCustomerUserSchema, updateCustomerUserSchema, staffLoginSchema, staffRegisterSchema, passwordResetRequestSchema, passwordResetConfirmSchema, customerJobSubmissionSchema, insertJobFileSchema, insertJobMessageSchema, canViewPrices, updateMachineSchema, insertTaskSchema, type Job } from "@shared/schema";
import { setupProductionDatabase } from "./setup-production";
import { checkRateLimit, resetRateLimit } from "./rateLimiter";
import { requestPasswordReset, confirmPasswordReset } from "./passwordReset";
import { sendPasswordResetEmail, sendNewJobSubmissionEmail, sendJobApprovedEmail, sendJobRejectedEmail, sendStaffMessageToCustomerEmail, sendStaffMessageCCEmail, sendNewChatEmail, sendTeamInviteEmail, sendDemoAccessEmail, sendNewLogoSetupEmail, sendNewPrintJobEmail, sendCustomerDirectMessageNotificationEmail, sendMobileGuideEmail, sendPaymentReceiptEmail, sendDispatchNotificationEmail, sendMentionNotificationEmail, sendDeliverabilityTestEmail } from "./emailService";
import { getOrCreateStripeCustomer, createSetupIntent, listSavedCards, deletePaymentMethod, setDefaultPaymentMethod, chargeCustomerCard } from "./stripeService";
import { shouldSendStaffNotification } from "./notificationThrottle";


// ─── Base URL helper ──────────────────────────────────────────────────────────
function getBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  return 'http://localhost:5000';
}

// ─── @Mention detection & notification ───────────────────────────────────────
// Extracts @FirstName handles from a message and fires notification emails to
// matched staff members (excluding the sender themselves).
async function notifyMentionedStaff(
  messageText: string,
  senderName: string,
  senderUserId: string,
  contextLabel: string,
  contextUrl: string,
): Promise<void> {
  try {
    const handles = [...messageText.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase());
    if (!handles.length) return;

    const allStaff = await storage.getStaff();
    const allUsers = await storage.getAllUsers();

    // Build a set of userIds already linked to a staff record
    const linkedUserIds = new Set(allStaff.map(s => s.userId).filter(Boolean));

    for (const handle of [...new Set(handles)]) {
      // First try to match against a staff record by first name
      const staffMatch = allStaff.find(s => s.name.split(' ')[0].toLowerCase() === handle);

      let mentionedName: string;
      let userRecord: typeof allUsers[number] | undefined;

      if (staffMatch) {
        mentionedName = staffMatch.name;
        userRecord = staffMatch.userId
          ? allUsers.find(u => u.id === staffMatch.userId)
          : allUsers.find(u => [u.firstName, u.lastName].filter(Boolean).join(' ').toLowerCase().startsWith(handle));
      } else {
        // Fall back to matching users who have no staff record (e.g. admin/super_admin without a staff entry)
        userRecord = allUsers.find(u =>
          !linkedUserIds.has(u.id) &&
          u.active &&
          u.role !== 'demo' &&
          (u.firstName || '').toLowerCase() === handle
        );
        mentionedName = userRecord
          ? [userRecord.firstName, userRecord.lastName].filter(Boolean).join(' ') || userRecord.email
          : handle;
      }

      if (!userRecord?.email) continue;
      // Don't notify the sender themselves
      if (userRecord.id === senderUserId) continue;

      sendMentionNotificationEmail({
        mentionedName,
        mentionedEmail: userRecord.email,
        senderName,
        messageText,
        contextLabel,
        contextUrl,
      }).catch(e => console.error('[Mention] Email failed:', e));
    }
  } catch (e) {
    console.error('[Mention] notifyMentionedStaff error:', e);
  }
}

// Single-flight guard for the bulk auto-schedule endpoint (see usage for rationale)
let autoScheduleInProgress = false;

// Helper function to auto-schedule a line item when it has a machine assigned
export async function autoScheduleLineItem(lineItemId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { findAvailableSlots, minutesToTime } = await import("@shared/scheduling");
    
    const lineItem = await storage.getJobLineItem(lineItemId);
    if (!lineItem) {
      return { success: false, error: "Line item not found" };
    }
    
    // Skip if no machine assigned or already completed
    if (!lineItem.machineId || lineItem.completed) {
      return { success: true };
    }
    
    // Check if already scheduled
    const existingSchedules = await storage.getJobSchedules();
    const alreadyScheduled = existingSchedules.some(s => s.lineItemId === lineItemId);
    if (alreadyScheduled) {
      return { success: true };
    }
    
    // Get job for dispatch date
    const job = await storage.getJob(lineItem.jobId);
    if (!job) {
      return { success: false, error: "Job not found" };
    }

    // Block scheduling if customer requires advance payment and payment not yet received
    const customer = await storage.getCustomer(job.customerId);
    if (customer?.requiresAdvancePayment && !job.paymentReceived) {
      return { success: false, error: "Awaiting advance payment before scheduling" };
    }
    
    // Fetch machine specs from DB for accurate duration calculation
    const machine = await storage.getMachine(lineItem.machineId);
    const heads = machine?.heads ?? 6;
    const spm = machine?.stitchesPerMinute ?? 750;
    const changeover = machine?.changeoverTimeMinutes ?? 3;
    
    // Calculate duration from quantity and stitch count
    const quantity = lineItem.quantity || 0;
    const stitchCount = lineItem.stitchCount || 0;
    
    if (quantity === 0) {
      return { success: false, error: "Line item has no quantity" };
    }
    
    const multiplier = (machine as any)?.schedulingMultiplier ?? 1;
    const calcDuration = (qty: number, stitches: number): number => {
      if (!stitches || !qty) return 0;
      const runs = Math.ceil(qty / heads);
      const timePerRun = (stitches / spm) + changeover;
      const raw = runs * timePerRun;
      return Math.ceil((raw * multiplier) / 10) * 10;
    };
    
    let effectiveDuration = calcDuration(quantity, stitchCount);
    
    // If no duration calculated (missing stitch count), estimate based on quantity
    // Assume approximately 1 minute per 5 items as a conservative baseline
    if (effectiveDuration === 0) {
      effectiveDuration = Math.max(30, Math.ceil(quantity / 5));
      console.log(`Auto-scheduling: No stitch count for line item ${lineItemId}, estimating ${effectiveDuration} minutes based on quantity ${quantity}`);
    }
    
    // Get scheduling data
    const machineBlocks = await storage.getMachineScheduleBlocks();
    const staffShifts = await storage.getStaffShifts();
    const staffMachineAllocations = await storage.getStaffMachineAllocations();
    const staffHolidays = await storage.getStaffHolidays();
    const bankHolidays = await storage.getBankHolidays();
    const staff = await storage.getStaff();
    
    if (staff.length === 0) {
      return { success: false, error: "No staff available" };
    }
    
    // Determine date range for scheduling
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    
    let endDate: Date;
    if (job.requiredDispatchDate) {
      endDate = new Date(job.requiredDispatchDate);
      // If overdue, still try to schedule ASAP within next 30 days
      if (endDate < startDate) {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 30);
      }
    } else {
      // No dispatch date, schedule within 30 days
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30);
    }
    
    // Re-fetch schedules for accurate slot calculation
    const allSchedules = await storage.getJobSchedules();

    // Search the earliest available slot across a given set of staff members.
    const searchEarliestSlot = (
      staffList: typeof staff
    ): { date: Date; startTime: number; endTime: number; staffId: string } | null => {
      let found: { date: Date; startTime: number; endTime: number; staffId: string } | null = null;
      for (let dayOffset = 0; dayOffset <= 30; dayOffset++) {
        const checkDate = new Date(startDate);
        checkDate.setDate(checkDate.getDate() + dayOffset);

        if (checkDate > endDate && found) break;

        for (const staffMember of staffList) {
          const availableSlots = findAvailableSlots(
            checkDate,
            lineItem.machineId!,
            staffMember.id,
            machineBlocks,
            staffShifts,
            allSchedules,
            staffMachineAllocations,
            staffHolidays,
            bankHolidays
          );

          // Find first slot that fits the duration
          for (const slot of availableSlots) {
            const slotDuration = slot.endTime - slot.startTime;
            if (slotDuration >= effectiveDuration) {
              const candidateSlot = {
                date: new Date(checkDate),
                startTime: slot.startTime,
                endTime: slot.startTime + effectiveDuration,
                staffId: staffMember.id
              };

              // Pick earliest slot
              if (!found || checkDate < found.date ||
                  (checkDate.toDateString() === found.date.toDateString() && slot.startTime < found.startTime)) {
                found = candidateSlot;
              }
              break;
            }
          }
        }

        // If we found a slot today, no need to check more days
        if (found && found.date.toDateString() === checkDate.toDateString()) {
          break;
        }
      }
      return found;
    };

    // Prefer the machine's default operator (using their shift pattern). Fall back to
    // any other staff member only if the default operator has no available slot.
    let bestSlot: { date: Date; startTime: number; endTime: number; staffId: string } | null = null;
    const defaultOperator = machine?.defaultOperatorId
      ? staff.find(s => s.id === machine.defaultOperatorId)
      : undefined;
    if (defaultOperator) {
      bestSlot = searchEarliestSlot([defaultOperator]);
    }
    if (!bestSlot) {
      const fallbackStaff = defaultOperator
        ? staff.filter(s => s.id !== defaultOperator.id)
        : staff;
      bestSlot = searchEarliestSlot(fallbackStaff);
    }

    if (!bestSlot) {
      return { success: false, error: "No available time slots found within 30 days" };
    }
    
    // Create the schedule
    await storage.createJobSchedule({
      jobId: lineItem.jobId,
      lineItemId: lineItem.id,
      machineId: lineItem.machineId,
      staffId: bestSlot.staffId,
      scheduledDate: bestSlot.date.toISOString(),
      startTime: bestSlot.startTime,
      endTime: bestSlot.endTime,
      status: "scheduled"
    });
    
    console.log(`Auto-scheduled line item ${lineItemId} on ${bestSlot.date.toDateString()} at ${minutesToTime(bestSlot.startTime)}`);
    return { success: true };
  } catch (error) {
    console.error("Auto-scheduling error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Helper function to recalculate job's total actual production time from completed line items
async function recalculateJobProductionTime(jobId: string): Promise<void> {
  const allLineItems = await storage.getJobLineItems(jobId);
  
  // Get all completed items with tracked time (including 0 minutes)
  const completedItemsWithTime = allLineItems.filter(item => 
    item.completed && item.actualProductionTimeMinutes !== null && item.actualProductionTimeMinutes !== undefined
  );
  
  // Sum total minutes and convert to hours
  if (completedItemsWithTime.length > 0) {
    const totalMinutes = completedItemsWithTime.reduce((sum, item) => sum + (item.actualProductionTimeMinutes || 0), 0);
    const totalHours = totalMinutes / 60;
    await storage.updateJob(jobId, { actualProductionTime: totalHours });
  } else {
    // No completed items with time tracked, set to null
    await storage.updateJob(jobId, { actualProductionTime: null });
  }
}

// Deterministic build version shared by every server instance for a single
// deployment. We hash the built client index.html (which references content-
// hashed JS/CSS bundles), so the value is identical across Cloud Run instances
// of the same build but changes whenever a new build is published. This lets
// clients reliably detect a republish and auto-reload. Falls back to a start
// timestamp in development where the build directory does not exist.
function computeBuildVersion(): string {
  try {
    const indexPath = path.resolve(import.meta.dirname, "public", "index.html");
    const html = fs.readFileSync(indexPath, "utf8");
    return crypto.createHash("sha1").update(html).digest("hex").slice(0, 12);
  } catch {
    return `dev-${Date.now()}`;
  }
}

const SERVER_START_VERSION = computeBuildVersion();

export async function registerRoutes(app: Express): Promise<Server> {
  // Casual / summer staff shift system routes
  registerCasualShiftRoutes(app);

  // Purchasing & Consumables routes
  registerPurchasingRoutes(app);

  // Version endpoint — used by client to detect deployments and auto-reload.
  // no-store prevents any intermediary/CDN caching from delaying detection.
  app.get("/api/version", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ version: SERVER_START_VERSION });
  });

  // Serve object storage files via /api/img/* — distinct path avoids platform CDN interception
  app.get("/api/img/*", async (req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const svc = new ObjectStorageService();
      // req.path is e.g. /api/img/uploads/uuid → translate to /objects/uploads/uuid
      // Collapse any repeated /api/img prefixes (legacy stored URLs were sometimes
      // double-prefixed, producing /api/img/api/img/uploads/...).
      let suffix = req.path.replace(/^(\/api\/img)+/, "");
      const objectPath = `/objects${suffix}`;
      const file = await svc.getObjectEntityFile(objectPath);

      // If a filename hint is provided (e.g. from chat file attachments), set Content-Disposition
      // so the browser downloads with the correct original filename and extension.
      const filenameHint = req.query.filename as string | undefined;
      if (filenameHint) {
        const safeFilename = filenameHint.replace(/[^\w.\- ]/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
      }

      await svc.downloadObject(file, res, 86400); // cache 24h
    } catch (err: any) {
      if (err?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Not found" });
      }
      console.error("Object serve error:", err);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // Production database setup endpoint (only in production)
  if (process.env.NODE_ENV === 'production') {
    app.get('/api/setup-production', setupProductionDatabase);
  }

  // Temporary utility endpoint to generate password hash
  app.post('/api/util/generate-hash', async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      
      const hash = await bcrypt.hash(password, 10);
      
      res.json({ 
        password,
        hash,
        sql: `UPDATE customer_users SET password_hash = '${hash}' WHERE email = 'accounts@shirtworks.co.uk';`
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate hash" });
    }
  });

  // Quick setup endpoint to create initial admin user (use once, then remove)
  app.get('/api/create-admin', async (req, res) => {
    try {
      // First, ensure the username column exists in the users table
      await storage.ensureUsernameColumn();
      
      // Check if chris user already exists
      const existingUser = await storage.getUserByEmail('chris@selectuniforms.co.uk');
      
      if (existingUser) {
        // Update existing user to have username if missing
        if (!existingUser.username) {
          await storage.updateUserUsername(existingUser.id, 'chris');
        }
        return res.json({ 
          message: "Admin user already exists and has been updated", 
          username: "chris",
          canLogin: true 
        });
      }

      // Create the chris user
      const user = await registerStaff({
        username: 'chris',
        email: 'chris@selectuniforms.co.uk',
        password: 'SelectUniforms2024!',
        firstName: 'Chris',
        lastName: 'User',
        role: 'super_admin',
      });

      res.json({ 
        message: "Admin user created successfully!", 
        username: "chris",
        canLogin: true 
      });
    } catch (error: any) {
      console.error("Error creating admin user:", error);
      res.status(500).json({ 
        error: error.message || "Failed to create admin user",
        details: error.toString()
      });
    }
  });

  // Diagnostic endpoint to check session and database status
  app.get('/api/diagnostics', async (req, res) => {
    try {
      const diagnostics: any = {
        nodeEnv: process.env.NODE_ENV,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasSessionSecret: !!process.env.SESSION_SECRET,
        sessionId: req.sessionID,
        hasSession: !!req.session,
        sessionUserId: req.session?.userId,
        fullSession: req.session,
        cookieHeaders: req.headers.cookie,
        cookieConfig: {
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        },
      };

      // Check if we can query the database
      try {
        const users = await storage.getAllUsers();
        diagnostics.databaseConnection = 'OK';
        diagnostics.userCount = users.length;
        diagnostics.usersWithUsername = users.filter(u => u.username).length;
      } catch (dbError: any) {
        diagnostics.databaseConnection = 'ERROR';
        diagnostics.databaseError = dbError.message;
      }

      res.json(diagnostics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Test endpoint to manually set session
  app.get('/api/test-session', (req: any, res) => {
    if (!req.session.testCounter) {
      req.session.testCounter = 0;
    }
    req.session.testCounter++;
    
    res.json({
      message: 'Session test',
      counter: req.session.testCounter,
      sessionId: req.sessionID,
      cookiesSent: res.getHeaders()['set-cookie'],
    });
  });

  // Fix chris password - update existing user with password hash
  app.get('/api/fix-chris-password', async (req, res) => {
    try {
      const password = 'SelectUniforms2024!';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Update the chris user with the password
      await storage.updateUserPassword('46418210', hashedPassword);
      
      res.json({
        success: true,
        message: 'Password updated successfully for chris',
        userId: '46418210',
        note: 'You can now login with chris / SelectUniforms2024!',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack,
      });
    }
  });

  // Test login endpoint - try to login via GET request
  app.get('/api/test-login', async (req, res) => {
    try {
      console.log('[TEST-LOGIN] Attempting test login...');
      
      // First check if user exists
      const userByUsername = await storage.getUserByUsername('chris');
      const userByEmail = await storage.getUserByEmail('chris@selectuniforms.co.uk');
      
      console.log('[TEST-LOGIN] User by username:', userByUsername ? 'Found' : 'Not found');
      console.log('[TEST-LOGIN] User by email:', userByEmail ? 'Found' : 'Not found');
      
      // Return diagnostic info even if login fails
      const diagnostics = {
        userExistsByUsername: !!userByUsername,
        userExistsByEmail: !!userByEmail,
        usernameData: userByUsername ? {
          id: userByUsername.id,
          username: userByUsername.username,
          email: userByUsername.email,
          passwordHashPrefix: userByUsername.password?.substring(0, 10) || 'NO_PASSWORD',
        } : null,
        emailData: userByEmail ? {
          id: userByEmail.id,
          username: userByEmail.username,
          email: userByEmail.email,
          passwordHashPrefix: userByEmail.password?.substring(0, 10) || 'NO_PASSWORD',
        } : null,
      };
      
      // Try to login with chris credentials
      const user = await loginStaff({
        email: 'chris',
        password: 'SelectUniforms2024!',
      });

      console.log('[TEST-LOGIN] Login successful, userId:', user.id);

      // Set userId in session
      req.session.userId = user.id;
      
      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      res.json({
        success: true,
        message: 'Login successful',
        userId: user.id,
        sessionId: req.sessionID,
        username: user.username,
        diagnostics,
      });
    } catch (error: any) {
      console.error('[TEST-LOGIN] Error:', error.message);
      
      // Still return diagnostic info on failure
      const userByUsername = await storage.getUserByUsername('chris');
      const userByEmail = await storage.getUserByEmail('chris@selectuniforms.co.uk');
      
      res.status(401).json({
        success: false,
        error: error.message,
        diagnostics: {
          userExistsByUsername: !!userByUsername,
          userExistsByEmail: !!userByEmail,
          usernameData: userByUsername ? {
            id: userByUsername.id,
            username: userByUsername.username,
            email: userByUsername.email,
            passwordHashPrefix: userByUsername.password?.substring(0, 10) || 'NO_PASSWORD',
          } : null,
          emailData: userByEmail ? {
            id: userByEmail.id,
            username: userByEmail.username,
            email: userByEmail.email,
            passwordHashPrefix: userByEmail.password?.substring(0, 10) || 'NO_PASSWORD',
          } : null,
        },
      });
    }
  });

  // Public: demo access request (no auth required)
  app.post("/api/demo/request-access", async (req, res) => {
    const DEMO_EMAIL = "demo@selectbranding.co.uk";
    const DEMO_PASSWORD = "SBdemo2025!";
    const schema = z.object({
      firstName: z.string().min(1, "First name is required").max(100),
      lastName: z.string().min(1, "Last name is required").max(100),
      email: z.string().email("Invalid email address"),
      phone: z.string().min(1, "Phone number is required").max(50).default(""),
      company: z.string().max(200).default(""),
    });
    try {
      const data = schema.parse(req.body);
      // Ensure the demo user exists before sending credentials
      const existing = await storage.getUserByEmail(DEMO_EMAIL);
      if (!existing) {
        const newUser = await registerStaff({
          username: "demo",
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          firstName: "Demo",
          lastName: "User",
          role: "demo",
        });
        await storage.updateUserActive(newUser.id, true);
      } else if (existing.role !== "demo" || !existing.active) {
        await storage.updateUserRole(existing.id, "demo");
        await storage.updateUserActive(existing.id, true);
      }
      const baseUrl = getBaseUrl();
      await sendDemoAccessEmail({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        company: data.company,
        portalUrl: `${baseUrl}/portal-preview`,
      });

      // Sync contact to HighLevel (fire-and-forget — never block the response)
      // Uses HighLevel v1 REST API (location API key auth)
      const hlApiKey = process.env.HIGHLEVEL_API_KEY;
      const hlLocationId = process.env.HIGHLEVEL_LOCATION_ID;
      if (hlApiKey && hlLocationId) {
        fetch("https://rest.gohighlevel.com/v1/contacts/", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${hlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            ...(data.phone ? { phone: data.phone } : {}),
            ...(data.company ? { companyName: data.company } : {}),
            tags: ["demo-request"],
            source: "Select Branding Demo Page",
          }),
        })
          .then(async (r) => {
            const body = await r.json().catch(() => ({}));
            if (!r.ok) {
              console.error("[HighLevel] Contact creation failed:", r.status, JSON.stringify(body));
            } else {
              const contactId = body?.contact?.id ?? body?.id;
              console.log("[HighLevel] Contact created:", contactId ?? "ok");
            }
          })
          .catch((err) => console.error("[HighLevel] Network error:", err));
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Demo access request error:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      res.status(500).json({ error: error.message || "Failed to send demo access email" });
    }
  });

  // Staff authentication routes
  app.post("/api/staff-auth/login", async (req, res) => {
    try {
      console.log(`[LOGIN] Attempt for user: ${req.body.email}, NODE_ENV: ${process.env.NODE_ENV}`);
      const data = staffLoginSchema.parse(req.body);
      
      // Rate limiting: 5 attempts per email per 15 minutes
      const rateLimitKey = `login:${data.email}`;
      if (!checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
        return res.status(429).json({ 
          error: "Too many login attempts. Please try again in 15 minutes." 
        });
      }
      
      const user = await loginStaff(data);
      console.log(`[LOGIN] User authenticated: ${user.id}`);
      
      // Reset rate limit on successful login
      resetRateLimit(rateLimitKey);
      
      // Regenerate session to prevent session fixation attacks
      req.session.regenerate((err) => {
        if (err) {
          console.error("[LOGIN] Session regeneration error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        
        console.log(`[LOGIN] Session regenerated, setting userId: ${user.id}`);
        req.session.userId = user.id;
        req.session.save((err) => {
          if (err) {
            console.error("[LOGIN] Session save error:", err);
            return res.status(500).json({ error: "Login failed" });
          }
          console.log(`[LOGIN] Session saved successfully, sessionID: ${req.sessionID}`);
          res.json(user);
        });
      });
    } catch (error: any) {
      console.error("[LOGIN] Login error:", error);
      res.status(401).json({ error: error.message || "Login failed" });
    }
  });

  app.post("/api/staff-auth/register", isStaffAuthenticated, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Only super admins can register new staff" });
      }

      const data = staffRegisterSchema.parse(req.body);
      const user = await registerStaff(data);
      res.json(user);
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(400).json({ error: error.message || "Registration failed" });
    }
  });

  app.post("/api/staff-auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      // Clear the session cookie
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Force logout endpoint - clears ALL sessions (both OAuth and staff)
  app.get("/api/force-logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      // Clear the session cookie
      res.clearCookie("connect.sid", { path: "/" });
      res.send(`
        <html>
          <body>
            <h1>Logged Out</h1>
            <p>Your session has been cleared.</p>
            <p><a href="/staff/login">Click here to go to Staff Login</a></p>
            <script>
              // Also clear any local storage
              localStorage.clear();
              sessionStorage.clear();
            </script>
          </body>
        </html>
      `);
    });
  });

  app.get("/api/staff-auth/user", isStaffAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;

      let realUser = null;
      if (req.session.realStaffUserId) {
        const ru = await storage.getUser(req.session.realStaffUserId);
        if (ru) {
          const { password: __, ...ruWithoutPassword } = ru;
          realUser = { ...ruWithoutPassword, profileImageUrl: normalizeImgUrl(ruWithoutPassword.profileImageUrl) };
        }
      }

      res.json({
        ...userWithoutPassword,
        profileImageUrl: normalizeImgUrl(userWithoutPassword.profileImageUrl),
        isStaffImpersonating: !!req.session.realStaffUserId,
        realUser,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Password reset routes
  app.post("/api/staff-auth/request-reset", async (req, res) => {
    try {
      const data = passwordResetRequestSchema.parse(req.body);
      const token = await requestPasswordReset(data);
      
      // Send email with reset link
      await sendPasswordResetEmail(data.email, token);
      
      // Always return success to prevent email enumeration
      res.json({ message: "If an account exists with this email, you will receive a password reset link." });
    } catch (error: any) {
      console.error("Password reset request error:", error);
      // Always return success to prevent email enumeration
      res.json({ message: "If an account exists with this email, you will receive a password reset link." });
    }
  });

  app.post("/api/staff-auth/confirm-reset", async (req, res) => {
    try {
      const data = passwordResetConfirmSchema.parse(req.body);
      await confirmPasswordReset(data);
      res.json({ message: "Password reset successfully" });
    } catch (error: any) {
      console.error("Password reset confirm error:", error);
      res.status(400).json({ error: error.message || "Password reset failed" });
    }
  });

  // Middleware to check if user is super admin
  const requireSuperAdmin = async (req: any, res: any, next: any) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // When impersonating another staff member, check the REAL user's role
      const checkUserId = req.session.realStaffUserId || req.session.userId;
      const user = await storage.getUser(checkUserId);
      
      if (!user || user.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      
      next();
    } catch (error) {
      console.error("Error checking super admin status:", error);
      res.status(500).json({ error: "Authorization check failed" });
    }
  };

  // Normalise stored object-storage paths to a single /api/img/ prefix.
  // Handles legacy /objects/ paths and collapses any accidental double prefixes.
  function normalizeImgUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    // Collapse repeated /api/img prefixes (legacy double-prefixed URLs).
    let normalized = url.replace(/^(\/api\/img)+/, "/api/img");
    if (normalized.startsWith("/objects/")) return normalized.replace("/objects/", "/api/img/");
    return normalized;
  }

  // User management routes - protected for super admins only
  app.get("/api/users", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => ({ ...u, profileImageUrl: normalizeImgUrl(u.profileImageUrl) })));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const createUserSchema = z.object({
        username: z.string().min(3, "Username must be at least 3 characters"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        role: z.enum(["admin", "manager", "staff"]),
      });

      const data = createUserSchema.parse(req.body);
      
      // Check if username or email already exists
      const existingByUsername = await storage.getUserByUsername(data.username);
      const existingByEmail = await storage.getUserByEmail(data.email);
      
      if (existingByUsername || existingByEmail) {
        return res.status(400).json({ 
          error: "A user with this username or email already exists" 
        });
      }

      const user = await registerStaff({
        username: data.username,
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
      });

      res.json(user);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      res.status(500).json({ error: error.message || "Failed to create user" });
    }
  });

  app.patch("/api/users/:id/role", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      
      // Validate role against UserRole enum
      const validRoles = ["super_admin", "admin", "manager", "staff"];
      if (!role || typeof role !== "string" || !validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be one of: super_admin, admin, manager, staff" });
      }
      
      const user = await storage.updateUserRole(req.params.id, role);
      res.json(user);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.patch("/api/users/:id", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const { updateUserSchema } = await import("@shared/schema");
      const data = updateUserSchema.parse(req.body);
      
      // Check if username or email is being changed and if it conflicts with existing users
      if (data.username) {
        const existingUser = await storage.getUserByUsername(data.username);
        if (existingUser && existingUser.id !== req.params.id) {
          return res.status(400).json({ error: "Username already in use" });
        }
      }
      
      if (data.email) {
        const existingUser = await storage.getUserByEmail(data.email);
        if (existingUser && existingUser.id !== req.params.id) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }
      
      const user = await storage.updateUser(req.params.id, data);
      res.json(user);
    } catch (error: any) {
      console.error("Error updating user:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.errors[0]?.message || "Invalid input" });
      }
      res.status(500).json({ error: error.message || "Failed to update user" });
    }
  });

  // Trigger password reset email for a user (super admin only)
  // Directly set a user's password (super admin only, no email required)
  app.post("/api/users/:id/set-password", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const { password } = req.body;
      if (!password || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const passwordHash = await bcrypt.hash(password, 10);
      await storage.updateUserPassword(req.params.id, passwordHash);
      res.json({ message: `Password updated for ${user.email}` });
    } catch (error: any) {
      console.error("Error setting password:", error);
      res.status(500).json({ error: "Failed to set password" });
    }
  });

  app.post("/api/users/:id/reset-password", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.email) {
        return res.status(400).json({ error: "User has no email address configured" });
      }

      const token = await requestPasswordReset({ email: user.email });
      const baseUrl = getBaseUrl();
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      try {
        await sendPasswordResetEmail(user.email, token);
        res.json({ message: `Password reset email sent to ${user.email}`, resetUrl });
      } catch (emailError: any) {
        console.error("Email send failed, returning link instead:", emailError);
        res.json({ 
          warning: `Email could not be sent (${emailError?.message || 'email service error'}). Share the link below directly with the user.`,
          resetUrl 
        });
      }
    } catch (error: any) {
      console.error("Error generating password reset:", error);
      res.status(500).json({ error: "Failed to generate password reset" });
    }
  });

  // Activate or deactivate a user account (super admin only)
  app.patch("/api/users/:id/active", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const { active } = req.body;
      
      if (typeof active !== "boolean") {
        return res.status(400).json({ error: "Active status must be true or false" });
      }

      const user = await storage.getUser(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Prevent deactivating yourself
      if (req.params.id === req.session.userId && !active) {
        return res.status(400).json({ error: "You cannot deactivate your own account" });
      }

      await storage.updateUserActive(req.params.id, active);
      const updatedUser = await storage.getUser(req.params.id);
      
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user active status:", error);
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // Demo user management (super_admin only)
  app.post("/api/admin/send-test-email", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "email required" });
      const baseUrl = getBaseUrl();
      await sendNewChatEmail([email], {
        staffName: "Select Branding",
        subject: "Test notification",
        firstMessage: "This is a test email to confirm your notification settings are working correctly. If you received this, email notifications are active on your account.",
        portalUrl: `${baseUrl}/customer/dashboard`,
        isJobChat: false,
      });
      res.json({ success: true, sentTo: email });
    } catch (err) {
      console.error("Test email error:", err);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });

  app.post("/api/admin/send-deliverability-test", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { to, cc } = req.body;
      if (!to) return res.status(400).json({ error: "to required" });
      await sendDeliverabilityTestEmail({ to, cc });
      res.json({ success: true, sentTo: to, cc });
    } catch (err) {
      console.error("Deliverability test email error:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/admin/ensure-demo-user", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    const DEMO_EMAIL = "demo@selectbranding.co.uk";
    const DEMO_USERNAME = "demo";
    const DEMO_PASSWORD = "SBdemo2025!";
    try {
      let existing = await storage.getUserByEmail(DEMO_EMAIL);
      if (!existing) {
        existing = await registerStaff({
          username: DEMO_USERNAME,
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          firstName: "Demo",
          lastName: "User",
          role: "demo",
        });
        // Ensure active
        await storage.updateUserActive(existing.id, true);
      } else {
        // Ensure role is demo and user is active
        await storage.updateUserRole(existing.id, "demo");
        await storage.updateUserActive(existing.id, true);
      }
      res.json({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        message: "Demo account is ready",
      });
    } catch (error: any) {
      console.error("Error ensuring demo user:", error);
      res.status(500).json({ error: error.message || "Failed to ensure demo user" });
    }
  });

  // Data cleanup (super_admin only) — permanently delete old completed & invoiced jobs.
  // Preview the count + total value before deleting anything.
  const parseCleanupCutoff = (raw: unknown): Date | null => {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    // Treat the cutoff as the end of the given day so jobs invoiced on that date are included.
    d.setHours(23, 59, 59, 999);
    return d;
  };

  app.get("/api/admin/cleanup/old-jobs/preview", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const cutoff = parseCleanupCutoff(req.query.before);
      if (!cutoff) {
        return res.status(400).json({ error: "A valid 'before' date (YYYY-MM-DD) is required" });
      }
      const summary = await storage.getOldInvoicedJobsSummary(cutoff);
      res.json({ before: cutoff.toISOString(), ...summary });
    } catch (error: any) {
      console.error("Cleanup preview error:", error);
      res.status(500).json({ error: error.message || "Failed to preview cleanup" });
    }
  });

  app.delete("/api/admin/cleanup/old-jobs", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const cutoff = parseCleanupCutoff(req.query.before);
      if (!cutoff) {
        return res.status(400).json({ error: "A valid 'before' date (YYYY-MM-DD) is required" });
      }
      const deletedCount = await storage.deleteOldInvoicedJobs(cutoff);
      console.log(`[cleanup] Deleted ${deletedCount} old invoiced jobs before ${cutoff.toISOString()}`);
      res.json({ before: cutoff.toISOString(), deletedCount });
    } catch (error: any) {
      console.error("Cleanup delete error:", error);
      res.status(500).json({ error: error.message || "Failed to delete old jobs" });
    }
  });

  // Star management routes
  app.post("/api/users/:userId/stars", isStaffAuthenticated, async (req, res) => {
    try {
      const { userId } = req.params;
      const { starType } = req.body;
      
      if (starType !== "yellow" && starType !== "red") {
        return res.status(400).json({ error: "Star type must be 'yellow' or 'red'" });
      }
      
      const stars = await storage.awardStar(userId, starType);
      res.json(stars);
    } catch (error) {
      console.error("Error awarding star:", error);
      res.status(500).json({ error: "Failed to award star" });
    }
  });

  app.get("/api/stars/leaderboard", isStaffAuthenticated, async (req, res) => {
    try {
      const [stars, productionMetrics] = await Promise.all([
        storage.getStarsLeaderboard(),
        storage.getStaffProductionMetrics()
      ]);

      // Create a map of userId to stars
      const starsMap = new Map(
        stars.map(s => [s.userId, s])
      );

      // Start with production metrics (so staff with production data but no stars still appear)
      const leaderboard = productionMetrics.map(metric => {
        const starData = starsMap.get(metric.userId);
        
        // Use user names if available, otherwise fall back to staff name
        let firstName = starData?.firstName || metric.firstName || '';
        let lastName = starData?.lastName || metric.lastName || '';
        
        // If still no name, use staff name (split it if it has spaces)
        if (!firstName && !lastName && metric.staffName) {
          const nameParts = metric.staffName.split(' ');
          firstName = nameParts[0] || '';
          lastName = nameParts.slice(1).join(' ') || '';
        }
        
        return {
          userId: metric.userId || metric.staffId, // Use staffId as fallback for userId
          firstName,
          lastName,
          email: starData?.email || metric.email || '',
          yellowStars: starData?.yellowStars || 0,
          redStars: starData?.redStars || 0,
          stitchesPerHour: metric.stitchesPerHour,
          totalStitches: metric.totalStitches,
          totalHours: metric.totalHours,
        };
      });

      // Add any users with stars but no production metrics
      stars.forEach(starEntry => {
        if (!leaderboard.find(entry => entry.userId === starEntry.userId)) {
          leaderboard.push({
            ...starEntry,
            stitchesPerHour: 0,
            totalStitches: 0,
            totalHours: 0,
          });
        }
      });

      // Sort by stitches per hour (primary) then total stars (secondary)
      leaderboard.sort((a, b) => {
        const aStars = a.yellowStars + a.redStars;
        const bStars = b.yellowStars + b.redStars;
        
        if (b.stitchesPerHour !== a.stitchesPerHour) {
          return b.stitchesPerHour - a.stitchesPerHour;
        }
        return bStars - aStars;
      });

      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/staff-production/daily", isStaffAuthenticated, async (req, res) => {
    try {
      const dailyMetrics = await storage.getDailyStaffProductionMetrics();
      res.json(dailyMetrics);
    } catch (error) {
      console.error("Error fetching daily production metrics:", error);
      res.status(500).json({ error: "Failed to fetch daily production metrics" });
    }
  });

  // Weekly Performance Report API (requires staff authentication and price view permission)
  app.get("/api/reports/weekly-performance", isStaffAuthenticated, async (req: any, res) => {
    try {
      // Check authorization - only users who can view prices can access this report
      const user = await storage.getUser(req.session.userId);
      if (!user || !canViewPrices(user.role)) {
        return res.status(403).json({ error: "You do not have permission to view pricing reports" });
      }

      // Validate and sanitize query parameters
      const validTimezones = [
        'Europe/London', 'UTC', 'Europe/Paris', 'Europe/Berlin', 
        'America/New_York', 'America/Los_Angeles', 'America/Chicago',
        'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'
      ];
      
      const querySchema = z.object({
        weeks: z.string().optional().transform((val) => {
          if (!val) return 12;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 52) return 12;
          return num;
        }),
        timezone: z.string().optional().default('Europe/London').refine(
          (tz) => validTimezones.includes(tz),
          { message: `Invalid timezone. Supported: ${validTimezones.join(', ')}` }
        ),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      
      const performanceData = await storage.getWeeklyPerformance({
        weeks: params.weeks,
        endDate: params.endDate,
        timezone: params.timezone,
      });
      
      res.json(performanceData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching weekly performance:", error);
      res.status(500).json({ error: "Failed to fetch weekly performance data" });
    }
  });

  // Customer-specific weekly trend (output + invoiced value) — used by Customers page chart
  app.get("/api/reports/all-customers-weekly-trend", isStaffAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user || !canViewPrices(user.role)) {
        return res.status(403).json({ error: "You do not have permission to view pricing reports" });
      }
      const querySchema = z.object({
        weeks: z.string().optional().transform((val) => {
          if (!val) return 52;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 104) return 52;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
        topN: z.string().optional().transform((val) => {
          if (!val) return 15;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 50) return 15;
          return num;
        }),
      });
      const params = querySchema.parse(req.query);
      const data = await storage.getAllCustomersWeeklyTrend({
        weeks: params.weeks,
        endDate: params.endDate,
        topN: params.topN,
        timezone: 'Europe/London',
      });
      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching all-customers weekly trend:", error);
      res.status(500).json({ error: "Failed to fetch trend" });
    }
  });

  app.get("/api/reports/customer-weekly-trend", isStaffAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user || !canViewPrices(user.role)) {
        return res.status(403).json({ error: "You do not have permission to view pricing reports" });
      }

      const querySchema = z.object({
        customerId: z.string().min(1),
        weeks: z.string().optional().transform((val) => {
          if (!val) return 52;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 104) return 52;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      const data = await storage.getCustomerWeeklyTrend({
        customerId: params.customerId,
        weeks: params.weeks,
        endDate: params.endDate,
        timezone: 'Europe/London',
      });
      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching customer weekly trend:", error);
      res.status(500).json({ error: "Failed to fetch customer weekly trend" });
    }
  });

  // Production Time Analysis API (requires staff authentication)
  app.get("/api/reports/production-time-analysis", isStaffAuthenticated, async (req: any, res) => {
    try {
      const querySchema = z.object({
        weeks: z.string().optional().transform((val) => {
          if (!val) return 12;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 52) return 12;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      
      const analysisData = await storage.getProductionTimeAnalysis({
        weeks: params.weeks,
        endDate: params.endDate,
      });
      
      res.json(analysisData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching production time analysis:", error);
      res.status(500).json({ error: "Failed to fetch production time analysis data" });
    }
  });

  // Staff Performance Report API (on-time vs late orders)
  app.get("/api/reports/staff-performance", isStaffAuthenticated, async (req: any, res) => {
    try {
      const querySchema = z.object({
        weeks: z.string().optional().transform((val) => {
          if (!val) return 12;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 52) return 12;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      const data = await storage.getStaffPerformanceReport({
        weeks: params.weeks,
        endDate: params.endDate,
      });
      
      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching staff performance:", error);
      res.status(500).json({ error: "Failed to fetch staff performance data" });
    }
  });

  // Errors Report API
  app.get("/api/reports/errors", isStaffAuthenticated, async (req: any, res) => {
    try {
      const querySchema = z.object({
        weeks: z.string().optional().transform((val) => {
          if (!val) return 12;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 52) return 12;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      const data = await storage.getErrorsReport({
        weeks: params.weeks,
        endDate: params.endDate,
      });
      
      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching errors report:", error);
      res.status(500).json({ error: "Failed to fetch errors report data" });
    }
  });

  // Daily Production Report API
  app.get("/api/reports/daily-production", isStaffAuthenticated, async (req: any, res) => {
    try {
      const querySchema = z.object({
        weeks: z.string().optional().transform((val) => {
          if (!val) return 12;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 52) return 12;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      const data = await storage.getDailyProductionReport({
        weeks: params.weeks,
        endDate: params.endDate,
      });
      
      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching daily production:", error);
      res.status(500).json({ error: "Failed to fetch daily production data" });
    }
  });

  app.get("/api/reports/weekly-production", isStaffAuthenticated, async (req: any, res) => {
    try {
      const querySchema = z.object({
        weeks: z.string().optional().transform((val) => {
          if (!val) return 12;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 52) return 12;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      const data = await storage.getWeeklyProductionByStaff({
        weeks: params.weeks,
        endDate: params.endDate,
      });
      
      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching weekly production:", error);
      res.status(500).json({ error: "Failed to fetch weekly production data" });
    }
  });

  // Daily Output Log API - per-day, per-staff embroidery output (garments + stitches)
  app.get("/api/reports/daily-output", isStaffAuthenticated, async (req: any, res) => {
    try {
      const querySchema = z.object({
        days: z.string().optional().transform((val) => {
          if (!val) return 30;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 365) return 30;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      const data = await storage.getDailyOutputByStaff({
        days: params.days,
        endDate: params.endDate,
      });

      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching daily output:", error);
      res.status(500).json({ error: "Failed to fetch daily output data" });
    }
  });

  app.get("/api/reports/production-time", isStaffAuthenticated, async (req: any, res) => {
    try {
      const querySchema = z.object({
        days: z.string().optional().transform((val) => {
          if (!val) return 90;
          const num = parseInt(val);
          if (isNaN(num) || num < 1 || num > 730) return 90;
          return num;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      const data = await storage.getProductionTimeMetrics({
        days: params.days,
        endDate: params.endDate,
      });

      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching production time metrics:", error);
      res.status(500).json({ error: "Failed to fetch production time metrics" });
    }
  });

  // Sync historical invoice totals from Xero
  app.post("/api/reports/sync-invoice-totals", isStaffAuthenticated, async (req: any, res) => {
    try {
      // Only allow admins/super_admins
      const user = await storage.getUser(req.session.userId);
      if (!user || !canViewPrices(user.role)) {
        return res.status(403).json({ error: "Permission denied" });
      }

      // Get all invoiced jobs that are missing invoice_total
      const allJobs = await storage.getJobs();
      const jobsMissingTotal = allJobs.filter(
        j => j.invoiceStatus === "invoiced" && j.invoicedAt && (j.invoiceTotal === null || j.invoiceTotal === undefined)
      );

      if (jobsMissingTotal.length === 0) {
        return res.json({ synced: 0, message: "All invoiced jobs already have totals." });
      }

      // Group jobs by invoiceReference so we don't double-count consolidated invoices
      const byReference: Record<string, typeof jobsMissingTotal> = {};
      for (const job of jobsMissingTotal) {
        if (!job.invoiceReference) continue;
        if (!byReference[job.invoiceReference]) byReference[job.invoiceReference] = [];
        byReference[job.invoiceReference].push(job);
      }

      const invoiceNumbers = Object.keys(byReference);
      if (invoiceNumbers.length === 0) {
        return res.json({ synced: 0, message: "No invoice references found on jobs to sync." });
      }

      // Fetch invoice totals from Xero
      const xeroInvoices = await xeroService.getInvoicesByNumbers(invoiceNumbers);
      const xeroByNumber: Record<string, number> = {};
      for (const inv of xeroInvoices) {
        if (inv.InvoiceNumber && inv.SubTotal != null) {
          xeroByNumber[inv.InvoiceNumber] = inv.SubTotal;
        }
      }

      // Save totals: full amount on first job, 0 on the rest (avoids double-counting)
      let synced = 0;
      for (const [ref, jobs] of Object.entries(byReference)) {
        const subTotal = xeroByNumber[ref];
        if (subTotal == null) continue;

        // Assign full total to the first job, 0 to subsequent jobs in same invoice
        for (let i = 0; i < jobs.length; i++) {
          await storage.updateJob(jobs[i].id, { invoiceTotal: i === 0 ? subTotal : 0 });
          synced++;
        }
      }

      res.json({ synced, invoicesFound: xeroInvoices.length, message: `Updated ${synced} job(s) from ${xeroInvoices.length} Xero invoice(s).` });
    } catch (error) {
      console.error("Sync invoice totals error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to sync invoice totals" });
    }
  });

  // Customer Insights Report
  app.get("/api/reports/customer-insights", isStaffAuthenticated, async (req: any, res) => {
    try {
      const querySchema = z.object({
        startDate: z.string().optional().transform((val) => {
          if (!val) return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : date;
        }),
        endDate: z.string().optional().transform((val) => {
          if (!val) return new Date();
          const date = new Date(val);
          return isNaN(date.getTime()) ? new Date() : date;
        }),
      });

      const params = querySchema.parse(req.query);
      const { startDate, endDate } = params;

      const [allJobs, allCustomers, allLineItems] = await Promise.all([
        storage.getJobs(),
        storage.getCustomers(),
        storage.getAllJobLineItems(),
      ]);

      // Jobs table has no createdAt — use approvedAt → submittedAt → completedAt → invoicedAt
      const jobDate = (j: any): Date | null => {
        const raw = j.approvedAt ?? j.submittedAt ?? j.completedAt ?? j.invoicedAt;
        if (!raw) return null;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
      };

      // Jobs in the selected date range — use Number() coercion throughout
      const rangeJobs = allJobs.filter(j => {
        const d = jobDate(j);
        return d !== null && d >= startDate && d <= endDate;
      });

      // Active customers in range (use string keys to avoid type mismatches)
      const activeCustomerIds = new Set(rangeJobs.map(j => String(j.customerId)));
      const activeCustomerCount = activeCustomerIds.size;

      // Build job count and quantity maps keyed by string customerId
      const rangeJobIds = new Set(rangeJobs.map(j => Number(j.id)));
      const quantityByCustomer: Record<string, number> = {};
      const jobCountByCustomer: Record<string, number> = {};

      for (const job of rangeJobs) {
        const key = String(job.customerId);
        jobCountByCustomer[key] = (jobCountByCustomer[key] || 0) + 1;
      }

      for (const li of allLineItems) {
        if (!rangeJobIds.has(Number(li.jobId))) continue;
        const job = allJobs.find(j => Number(j.id) === Number(li.jobId));
        if (!job) continue;
        const key = String(job.customerId);
        quantityByCustomer[key] = (quantityByCustomer[key] || 0) + (li.quantity || 0);
      }

      // Top 5: build from job count (all range customers), merge in quantity
      const topCustomers = Object.entries(jobCountByCustomer)
        .map(([key, jobCount]) => {
          const customer = allCustomers.find(c => String(c.id) === key);
          return {
            customerId: Number(key),
            customerName: customer?.name || "Unknown",
            totalQuantity: quantityByCustomer[key] || 0,
            jobCount,
          };
        })
        .sort((a, b) => b.totalQuantity - a.totalQuantity || b.jobCount - a.jobCount)
        .slice(0, 5);

      // Dormant customers: have had jobs before, but none in the last 28 days
      const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
      const recentJobCustomerKeys = new Set(
        allJobs
          .filter(j => {
            const d = jobDate(j);
            return d !== null && d >= fourWeeksAgo;
          })
          .map(j => String(j.customerId))
      );
      const everActiveCustomerKeys = new Set(allJobs.map(j => String(j.customerId)));

      const dormantCustomers = allCustomers
        .filter(c => everActiveCustomerKeys.has(String(c.id)) && !recentJobCustomerKeys.has(String(c.id)))
        .map(c => {
          const customerJobs = allJobs.filter(j => String(j.customerId) === String(c.id));
          const datedJobs = customerJobs
            .map(j => ({ job: j, d: jobDate(j) }))
            .filter((x): x is { job: any; d: Date } => x.d !== null)
            .sort((a, b) => b.d.getTime() - a.d.getTime());
          const lastDate = datedJobs[0]?.d ?? null;
          const daysSinceLastOrder = lastDate
            ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;
          return {
            customerId: c.id,
            customerName: c.name,
            lastOrderDate: lastDate ? lastDate.toISOString() : null,
            daysSinceLastOrder,
          };
        })
        .sort((a, b) => (b.daysSinceLastOrder ?? -1) - (a.daysSinceLastOrder ?? -1));

      res.json({ activeCustomerCount, topCustomers, dormantCustomers });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching customer insights:", error);
      res.status(500).json({ error: "Failed to fetch customer insights" });
    }
  });

  // ── Re-engagement email endpoints ──────────────────────────────────────────

  // Preview: which customers would receive a re-engagement email
  app.get("/api/re-engagement/preview", isStaffAuthenticated, async (_req, res) => {
    try {
      const { getDormantCustomers } = await import("./reEngagement");
      const customers = await getDormantCustomers();
      res.json({ customers });
    } catch (error) {
      console.error("Re-engagement preview error:", error);
      res.status(500).json({ error: "Failed to fetch dormant customers" });
    }
  });

  // Trigger: send re-engagement emails now (or dry-run)
  app.post("/api/re-engagement/send", isStaffAuthenticated, async (req, res) => {
    try {
      const dryRun = req.body?.dryRun === true;
      const { runReEngagementCheck } = await import("./reEngagement");
      const result = await runReEngagementCheck({ dryRun });
      res.json(result);
    } catch (error) {
      console.error("Re-engagement send error:", error);
      res.status(500).json({ error: "Failed to run re-engagement check" });
    }
  });

  // Email budget status (today's send count + remaining quota)
  app.get("/api/re-engagement/budget", isStaffAuthenticated, (_req, res) => {
    const { getEmailBudget } = require("./emailBudget");
    res.json(getEmailBudget());
  });

  // Seed initial customers if database is empty
  const seedCustomers = async () => {
    try {
      const existing = await storage.getCustomers();
      if (existing.length === 0) {
        const initialCustomers = [
          { name: "Acme Corp" },
          { name: "TechStart Inc" },
          { name: "Global Industries" },
          { name: "Premier Manufacturing" },
          { name: "Elite Enterprises" },
        ];
        
        for (const customer of initialCustomers) {
          await storage.createCustomer(customer);
        }
        console.log("Seeded initial customers");
      }
    } catch (error) {
      console.error("Failed to seed customers:", error);
    }
  };

  // Run seed on startup
  await seedCustomers();

  // Customer Portal Authentication Routes
  app.post("/api/customer-auth/register", isStaffAuthenticated, async (req: any, res) => {
    try {
      const data = z.object({
        customerId: z.string().min(1),
        email: z.string().email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      }).parse(req.body);

      // Ensure no duplicate
      const existing = await storage.getCustomerUserByEmail(data.email);
      if (existing) return res.status(409).json({ error: "A customer portal login with this email already exists" });

      // Random placeholder password — user will set their own via invite link
      const crypto = await import("crypto");
      const placeholderPassword = crypto.randomBytes(32).toString("hex");
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(placeholderPassword, 10);

      const customerUser = await storage.createCustomerUser({
        customerId: data.customerId,
        email: data.email,
        passwordHash,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        mustResetPassword: true,
        active: true,
      });

      // Generate invite token (48 hours)
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await storage.createCustomerInviteToken({ customerUserId: customerUser.id, token, expiresAt });

      // Resolve staff inviter name
      const sessionUserId = String(req.session.userId);
      const allStaff = await storage.getStaff();
      const staffMember = allStaff.find(s => s.userId && String(s.userId) === sessionUserId);
      const inviterName = staffMember?.name || 'Select Branding';

      // Get company name
      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === data.customerId);
      const companyName = customer?.name || 'Select Branding';

      // Send invite email
      try {
        const baseUrl = getBaseUrl();
        await sendTeamInviteEmail(data.email, {
          firstName: data.firstName ?? null,
          inviterName,
          companyName,
          inviteUrl: `${baseUrl}/customer/invite?token=${token}`,
          isReset: false,
        });
      } catch (emailErr) {
        console.error('Failed to send portal invite email:', emailErr);
      }

      res.json(customerUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors.map(e => e.message).join(', ') });
      } else if (error instanceof Error && error.message.includes("already exists")) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : "Registration failed" });
      }
    }
  });

  app.post("/api/customer-auth/login", async (req, res) => {
    try {
      const data = customerLoginSchema.parse(req.body);
      const customerUser = await loginCustomer(data);
      
      // Set session
      (req.session as any).customerUserId = customerUser.id;
      
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("[CUSTOMER_LOGIN] Session save error:", err);
          return res.status(500).json({ error: "Session error" });
        }
        res.json(customerUser);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors.map(e => e.message).join(', ') });
      } else {
        res.status(401).json({ error: error instanceof Error ? error.message : "Login failed" });
      }
    }
  });

  app.post("/api/customer-auth/logout", (req, res) => {
    (req.session as any).customerUserId = undefined;
    res.json({ success: true });
  });

  // Customer notification settings
  // ── Stripe card management routes ──────────────────────────────────────────

  // Create a SetupIntent so the customer can save a card
  app.post("/api/customer-portal/stripe/setup-intent", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "User not found" });

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === customerUser.customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      // Get or create a Stripe customer record
      const stripeCustomerId = await getOrCreateStripeCustomer(
        customer.id,
        customer.name,
        customer.email,
        customer.stripeCustomerId || null,
      );

      // Persist the Stripe customer ID if new
      if (stripeCustomerId !== customer.stripeCustomerId) {
        await storage.updateCustomer(customer.id, { stripeCustomerId } as any);
      }

      const { clientSecret, setupIntentId } = await createSetupIntent(stripeCustomerId);
      res.json({ clientSecret, setupIntentId, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
    } catch (error: any) {
      console.error("Error creating setup intent:", error);
      res.status(500).json({ error: error.message || "Failed to create setup intent" });
    }
  });

  // List saved cards
  app.get("/api/customer-portal/stripe/cards", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "User not found" });

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === customerUser.customerId);
      if (!customer?.stripeCustomerId) return res.json([]);

      const cards = await listSavedCards(customer.stripeCustomerId);
      res.json(cards);
    } catch (error: any) {
      console.error("Error listing saved cards:", error);
      res.status(500).json({ error: error.message || "Failed to list cards" });
    }
  });

  // Delete a saved card
  app.delete("/api/customer-portal/stripe/cards/:paymentMethodId", isCustomerAuthenticated, async (req: any, res) => {
    try {
      await deletePaymentMethod(req.params.paymentMethodId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting card:", error);
      res.status(500).json({ error: error.message || "Failed to delete card" });
    }
  });

  // Pay selected line items using saved card
  app.post("/api/customer-portal/stripe/pay-jobs", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session?.customerUserId || req.session?.impersonationCustomerUserId;
      if (!customerUserId) return res.status(401).json({ error: "Unauthorized" });

      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(401).json({ error: "User not found" });

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === customerUser.customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      if (!customer.stripeCustomerId) {
        return res.status(400).json({ error: "No saved payment card on file. Please add a card first." });
      }

      const { lineItemIds } = req.body as { lineItemIds: string[] };
      if (!Array.isArray(lineItemIds) || lineItemIds.length === 0) {
        return res.status(400).json({ error: "No line items selected" });
      }

      const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;
      if (!pricingTable) {
        return res.status(400).json({ error: "No pricing table assigned to your account" });
      }

      // Look up each line item and calculate its price
      let subtotal = 0;
      const lineItemDetails: { id: string; jobName: string; jobType: string; quantity: number; price: number }[] = [];

      for (const lineItemId of lineItemIds) {
        const lineItem = await storage.getJobLineItem(lineItemId);
        if (!lineItem) continue;

        const job = await storage.getJob(lineItem.jobId);
        if (!job || job.customerId !== customerUser.customerId) continue;

        try {
          const priceResult = calculateJobPrice(
            [{ quantity: lineItem.quantity, stitchCount: lineItem.stitchCount || 0, jobType: lineItem.jobType || undefined }],
            pricingTable
          );
          const itemPrice = priceResult.lineItemPrices[0]?.totalPrice ?? 0;
          subtotal += itemPrice;
          lineItemDetails.push({
            id: lineItemId,
            jobName: job.jobName,
            jobType: lineItem.jobType || "Unknown",
            quantity: lineItem.quantity,
            price: itemPrice,
          });
        } catch {
          // skip unpriceable items
        }
      }

      if (subtotal === 0 || lineItemDetails.length === 0) {
        return res.status(400).json({ error: "Could not calculate prices for selected items" });
      }

      const vatAmount = subtotal * 0.2;
      const totalIncVat = subtotal + vatAmount;

      const description = `Customer payment — ${lineItemDetails.length} line item(s): ${lineItemDetails.map(l => l.jobName).join(", ")}`;
      const reference = `PORTAL-${Date.now()}`;

      const chargeResult = await chargeCustomerCard(
        customer.stripeCustomerId,
        totalIncVat,
        description,
        reference
      );

      // Allocate the deposit per job so we can apply it as a Xero Payment when
      // the final invoice is raised. Each line item's inc-VAT charge is added
      // to its parent job's depositAmountPaid.
      if (chargeResult.success) {
        const perJobDeposit = new Map<string, number>();
        for (const detail of lineItemDetails) {
          const lineItem = await storage.getJobLineItem(detail.id);
          if (!lineItem) continue;
          const grossForLine = detail.price * 1.2; // inc-VAT
          perJobDeposit.set(lineItem.jobId, (perJobDeposit.get(lineItem.jobId) || 0) + grossForLine);
        }
        const now = new Date();
        for (const [jobId, amount] of Array.from(perJobDeposit.entries())) {
          try {
            const existing = await storage.getJob(jobId);
            const prev = existing?.depositAmountPaid || 0;
            await storage.updateJob(jobId, {
              depositAmountPaid: prev + amount,
              depositLastPaidAt: now,
            } as any);
          } catch (e) {
            console.error(`Failed to record deposit on job ${jobId}:`, e);
          }
        }
      }

      // Send receipt email if charge succeeded
      if (chargeResult.success) {
        try {
          await sendPaymentReceiptEmail({
            customerEmail: customerUser.email,
            customerName: customer.name || customerUser.email,
            reference,
            subtotal,
            vatAmount,
            totalIncVat,
            lineItems: lineItemDetails,
            paymentIntentId: chargeResult.paymentIntentId,
          });
        } catch (emailErr) {
          console.error("Failed to send payment receipt email:", emailErr);
        }
      }

      res.json({ chargeResult, subtotal, vatAmount, totalIncVat, lineItemDetails, reference });
    } catch (error: any) {
      console.error("Error charging customer card:", error);
      res.status(500).json({ error: error.message || "Payment failed" });
    }
  });

  // ── End Stripe routes ───────────────────────────────────────────────────────

  app.patch("/api/customer-auth/me/notification-settings", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session?.customerUserId || req.session?.impersonationCustomerUserId;
      if (!customerUserId) return res.status(401).json({ error: "Not authenticated" });
      const { emailNotificationsMessages, emailNotificationsDispatch } = req.body;
      const settings: { emailNotificationsMessages?: boolean; emailNotificationsDispatch?: boolean } = {};
      if (typeof emailNotificationsMessages === "boolean") settings.emailNotificationsMessages = emailNotificationsMessages;
      if (typeof emailNotificationsDispatch === "boolean") settings.emailNotificationsDispatch = emailNotificationsDispatch;
      if (!Object.keys(settings).length) {
        return res.status(400).json({ error: "No valid settings provided" });
      }
      await storage.updateCustomerNotificationSettings(customerUserId, settings);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update notification settings" });
    }
  });

  // Look up customer info by email for login personalization (public endpoint)
  app.get("/api/customer-auth/lookup", async (req, res) => {
    try {
      const email = z.string().email().parse(req.query.email);
      
      // Find customer user by email
      const customerUser = await storage.getCustomerUserByEmail(email);
      
      if (!customerUser) {
        return res.json({ found: false });
      }
      
      // Get customer details
      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === customerUser.customerId);
      
      if (!customer) {
        return res.json({ found: false });
      }
      
      // Return customer info for personalization (no sensitive data)
      res.json({
        found: true,
        customerName: customer.name,
        logoUrl: customer.logoUrl || null,
        address: customer.address || null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid email format" });
      } else {
        res.status(500).json({ error: "Lookup failed" });
      }
    }
  });

  // Self-service forgot password — public, no auth required
  app.post("/api/customer-auth/forgot-password", async (req: any, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);

      const user = await storage.getCustomerUserByEmail(email);
      // Always return success to avoid email enumeration
      if (!user) return res.json({ success: true });

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await storage.createCustomerInviteToken({ customerUserId: user.id, token, expiresAt });

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === user.customerId);
      const companyName = customer?.name || 'Select Branding Solutions';

      const baseUrl = getBaseUrl();

      await sendTeamInviteEmail(user.email, {
        firstName: user.firstName ?? null,
        inviterName: 'Select Branding Solutions',
        companyName,
        inviteUrl: `${baseUrl}/customer/invite?token=${token}`,
        isReset: true,
      });

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Failed to send reset email" });
    }
  });

  app.post("/api/customer-auth/reset-password", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const { newPassword } = z.object({
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);
      
      const customerUserId = (req.session as any).customerUserId;
      await resetCustomerPassword(customerUserId, newPassword);
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : "Password reset failed" });
      }
    }
  });

  // Public: validate an invite token (returns user email/name so page can greet them)
  app.get("/api/customer-invite", async (req, res) => {
    try {
      const token = String(req.query.token || "");
      if (!token) return res.status(400).json({ error: "Token required" });
      const row = await storage.getCustomerInviteToken(token);
      if (!row || row.used) return res.status(400).json({ error: "Invalid or already used link" });
      if (new Date() > new Date(row.expiresAt)) return res.status(400).json({ error: "This link has expired" });
      const user = await storage.getCustomerUserById(row.customerUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ email: user.email, firstName: user.firstName });
    } catch (e) {
      res.status(500).json({ error: "Failed to validate link" });
    }
  });

  // Public: accept invite token — set password and activate account
  app.post("/api/customer-invite", async (req: any, res) => {
    try {
      const { token, newPassword } = z.object({
        token: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);

      const row = await storage.getCustomerInviteToken(token);
      if (!row || row.used) return res.status(400).json({ error: "Invalid or already used link" });
      if (new Date() > new Date(row.expiresAt)) return res.status(400).json({ error: "This link has expired" });

      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateCustomerPassword(row.customerUserId, passwordHash);
      await storage.updateCustomerMustResetPassword(row.customerUserId, false);
      await storage.markCustomerInviteTokenUsed(row.id);

      res.json({ success: true });
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(err => err.message).join(", ") });
      console.error("Failed to accept invite:", e);
      res.status(500).json({ error: "Failed to set password" });
    }
  });

  // Customer change password (requires current password)
  app.post("/api/customer-auth/change-password", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters"),
      }).parse(req.body);
      
      const customerUserId = (req.session as any).customerUserId;
      
      // Get the customer user to verify current password
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify current password
      const bcrypt = await import("bcrypt");
      const isValid = await bcrypt.compare(currentPassword, customerUser.passwordHash);
      if (!isValid) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
      
      // Hash and save new password
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateCustomerPassword(customerUserId, passwordHash);
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : "Password change failed" });
      }
    }
  });

  app.patch("/api/customer-users/:id/toggle-active", isStaffAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { active } = z.object({
        active: z.boolean(),
      }).parse(req.body);
      
      await storage.updateCustomerActive(id, active);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update customer status" });
      }
    }
  });

  app.patch("/api/customer-users/:id/notification-settings", isStaffAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { emailNotificationsMessages } = z.object({
        emailNotificationsMessages: z.boolean(),
      }).parse(req.body);

      await storage.updateCustomerNotificationSettings(id, { emailNotificationsMessages });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update notification settings" });
      }
    }
  });

  app.post("/api/customer-users/:id/reset-password", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getCustomerUserById(id);
      if (!user) return res.status(404).json({ error: "Customer user not found" });

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await storage.createCustomerInviteToken({ customerUserId: id, token, expiresAt });

      const sessionUserId = String(req.session.userId);
      const allStaff = await storage.getStaff();
      const staffMember = allStaff.find(s => s.userId && String(s.userId) === sessionUserId);
      const inviterName = staffMember?.name || 'Select Branding';

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === user.customerId);
      const companyName = customer?.name || 'Select Branding';

      const baseUrl = getBaseUrl();

      await sendTeamInviteEmail(user.email, {
        firstName: user.firstName ?? null,
        inviterName,
        companyName,
        inviteUrl: `${baseUrl}/customer/invite?token=${token}`,
        isReset: true,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending reset invite:", error);
      res.status(500).json({ error: "Failed to send reset link" });
    }
  });

  // Send a welcome invite email for a customer portal user
  app.post("/api/customer-users/:id/generate-invite", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getCustomerUserById(id);
      if (!user) return res.status(404).json({ error: "Customer user not found" });

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await storage.createCustomerInviteToken({ customerUserId: id, token, expiresAt });

      const sessionUserId = String(req.session.userId);
      const allStaff = await storage.getStaff();
      const staffMember = allStaff.find(s => s.userId && String(s.userId) === sessionUserId);
      const inviterName = staffMember?.name || 'Select Branding';

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === user.customerId);
      const companyName = customer?.name || 'Select Branding';

      const baseUrl = getBaseUrl();

      await sendTeamInviteEmail(user.email, {
        firstName: user.firstName ?? null,
        inviterName,
        companyName,
        inviteUrl: `${baseUrl}/customer/invite?token=${token}`,
        isReset: false,
      });

      await storage.updateCustomerUserInviteSent(id);

      res.json({ success: true });
    } catch (error) {
      console.error("Error generating invite:", error);
      res.status(500).json({ error: "Failed to send invite" });
    }
  });

  // Send mobile app guide email to a customer portal user
  app.post("/api/customer-users/:id/send-mobile-guide", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getCustomerUserById(id);
      if (!user) return res.status(404).json({ error: "Customer user not found" });

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === user.customerId);

      await sendMobileGuideEmail({
        to: user.email,
        firstName: user.firstName ?? null,
        companyName: customer?.name ?? null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending mobile guide:", error);
      res.status(500).json({ error: "Failed to send mobile guide email" });
    }
  });

  // Staff - Delete a portal user (must be disabled first)
  app.delete("/api/customer-users/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const user = await storage.getCustomerUserById(req.params.id);
      if (!user) return res.status(404).json({ error: "Customer user not found" });
      if (user.active !== false) return res.status(400).json({ error: "Only disabled portal users can be deleted" });
      await storage.deleteCustomerUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting portal user:", error);
      res.status(500).json({ error: "Failed to delete portal user" });
    }
  });

  // Update customer user details (email, name)
  app.patch("/api/customer-users/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const data = updateCustomerUserSchema.parse(req.body);
      
      // Check if email is being changed and if it's already in use
      if (data.email) {
        const existingUser = await storage.getCustomerUserByEmail(data.email);
        if (existingUser && existingUser.id !== id) {
          return res.status(400).json({ error: "Email address is already in use by another portal user" });
        }
      }
      
      const updated = await storage.updateCustomerUserDetails(id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update customer user" });
      }
    }
  });

  // Customer Impersonation - Start impersonation (super_admin only)
  app.post("/api/staff/customers/:customerId/impersonate", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { customerId } = req.params;
      
      // Get the authenticated staff user
      const user = await storage.getUser(req.session.userId);
      
      if (!user || user.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      
      // Get customer users for this customer
      const customerUsers = await storage.getCustomerUsersByCustomerId(customerId);
      
      if (!customerUsers || customerUsers.length === 0) {
        return res.status(404).json({ error: "No customer portal login found for this customer" });
      }
      
      // Use the first active customer user
      const customerUser = customerUsers.find(cu => cu.active);
      if (!customerUser) {
        return res.status(404).json({ error: "No active customer portal login found" });
      }
      
      // Generate a cryptographically secure random token
      const crypto = await import("crypto");
      const tokenBytes = crypto.randomBytes(32);
      const token = tokenBytes.toString('base64url');
      
      // Set expiry to 10 minutes from now
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
      
      // Create impersonation session (token will be hashed in storage)
      await storage.createImpersonationSession({
        token,
        staffUserId: user.id,
        customerUserId: customerUser.id,
        expiresAt,
      });
      
      res.json({ 
        token,
        impersonateUrl: `/customer/impersonate/${token}`,
      });
    } catch (error) {
      console.error("Error creating impersonation session:", error);
      res.status(500).json({ error: "Failed to create impersonation session" });
    }
  });

  // Customer Impersonation - Exchange token for session
  app.get("/customer/impersonate/:token", async (req: any, res) => {
    try {
      const { token } = req.params;
      
      // Validate and get the impersonation session
      const session = await storage.getImpersonationSession(token);
      
      if (!session) {
        return res.status(401).send("Invalid or expired impersonation link. Please request a new one.");
      }
      
      // Invalidate the token immediately (single-use)
      await storage.invalidateImpersonationSession(token);
      
      // Set impersonation session
      req.session.impersonationCustomerUserId = session.customerUserId;
      req.session.impersonationStaffUserId = session.staffUserId;
      // Also set customerUserId so existing routes work
      req.session.customerUserId = session.customerUserId;
      
      // Redirect to customer dashboard
      res.redirect("/customer/dashboard");
    } catch (error) {
      console.error("Error exchanging impersonation token:", error);
      res.status(500).send("Failed to start impersonation session");
    }
  });

  // Customer Impersonation - Exit impersonation
  app.delete("/api/customer-impersonation", isStaffAuthenticated, async (req: any, res) => {
    try {
      // Clear impersonation session
      delete req.session.impersonationCustomerUserId;
      delete req.session.impersonationStaffUserId;
      delete req.session.customerUserId;
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error exiting impersonation:", error);
      res.status(500).json({ error: "Failed to exit impersonation" });
    }
  });

  // Staff Impersonation - Start (super_admin only)
  app.post("/api/staff/impersonate/staff/:userId", isStaffAuthenticated, async (req: any, res) => {
    try {
      // Determine the real user (in case already impersonating)
      const realUserId = req.session.realStaffUserId || req.session.userId;
      const realUser = await storage.getUser(realUserId);
      if (!realUser || realUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }

      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (targetUser.id === realUserId) {
        return res.status(400).json({ error: "Cannot impersonate yourself" });
      }

      // Swap session to target user, preserve real user ID
      req.session.realStaffUserId = realUserId;
      req.session.userId = targetUser.id;

      const { password: _, ...targetWithoutPassword } = targetUser;
      res.json({ success: true, impersonating: targetWithoutPassword });
    } catch (error) {
      console.error("Error starting staff impersonation:", error);
      res.status(500).json({ error: "Failed to start impersonation" });
    }
  });

  // Staff Impersonation - Exit
  app.delete("/api/staff/impersonate/staff", isStaffAuthenticated, async (req: any, res) => {
    try {
      if (!req.session.realStaffUserId) {
        return res.status(400).json({ error: "Not currently impersonating a staff member" });
      }
      req.session.userId = req.session.realStaffUserId;
      delete req.session.realStaffUserId;
      res.json({ success: true });
    } catch (error) {
      console.error("Error exiting staff impersonation:", error);
      res.status(500).json({ error: "Failed to exit impersonation" });
    }
  });

  app.get("/api/customer-auth/user", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const effectiveUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(effectiveUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }
      
      // Get customer info for logo
      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === customerUser.customerId);
      
      // Return without password hash, include impersonation flag and customer info
      const { passwordHash: _, ...user } = customerUser;
      const isImpersonating = !!(req.session as any).impersonationCustomerUserId;
      
      res.json({
        ...user,
        isImpersonating,
        customerName: customer?.name || null,
        customerLogoUrl: customer?.logoUrl || null,
        customerAddress: customer?.address || null,
        customerCreditAccount: customer?.creditAccount ?? true,
      });
    } catch (error) {
      console.error("Error fetching customer user:", error);
      res.status(500).json({ error: "Failed to fetch customer user" });
    }
  });

  // Utility function to obfuscate names server-side for demo portal
  function obfuscateText(text: string | null): string | null {
    if (!text) return text;
    
    const words = text.split(' ');
    return words.map(word => {
      if (word.length <= 1) return word;
      if (word.length === 2) {
        // Always mask 2-letter words like "JK"
        return word[0] + '*';
      }
      if (word.length <= 4) {
        // Short words: keep first, star middle, keep last
        return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
      }
      // Longer words: keep first, star most of middle, keep last 1-2
      const keepEnd = word.length > 6 ? 2 : 1;
      return word[0] + '*'.repeat(word.length - 1 - keepEnd) + word.slice(-keepEnd);
    }).join(' ');
  }

  // Demo Customer Portal - Public read-only access to obfuscated demo data (lead magnet)
  app.get("/api/demo/customer/jobs", async (req: any, res) => {
    try {
      // Redirect staff users if they're logged in
      if (req.session && req.session.userId) {
        return res.status(403).json({ error: "Staff users cannot access demo portal" });
      }

      // Hard-coded JK Prints customer ID (production database)
      const JK_PRINTS_CUSTOMER_ID = '170523f5-012a-4571-892c-02f166dbb463';
      
      // Get all non-sensitive jobs for JK Prints
      const jobs = await storage.getJobsByCustomerId(JK_PRINTS_CUSTOMER_ID);
      const visibleJobs = jobs.filter(j => j.status !== 'pending_customer_approval');
      
      // Get line items for each job and obfuscate all sensitive data
      const jobsWithLineItems = await Promise.all(
        visibleJobs.map(async (job) => {
          const lineItems = await storage.getJobLineItems(job.id);
          return {
            ...job,
            jobName: obfuscateText(job.jobName) || job.jobName,
            notes: obfuscateText(job.notes),
            poNumber: job.poNumber ? obfuscateText(job.poNumber) : null,
            lineItems: lineItems.map(item => ({
              ...item,
              description: obfuscateText(item.description),
            })),
          };
        })
      );
      
      res.json(jobsWithLineItems);
    } catch (error) {
      console.error("Error fetching demo jobs:", error);
      res.status(500).json({ error: "Failed to fetch demo jobs" });
    }
  });

  // Customer Portal - Jobs with Line Items
  app.get("/api/customer-portal/jobs", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById((req.session as any).customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }

      // Determine customer's pricing table
      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === customerUser.customerId);
      const pricingTable = customer?.pricingTable2026 ? "2026" : customer?.pricingTable2025 ? "2025" : null;
      
      // Get all jobs for this customer except those pending approval
      // pending_customer_approval jobs are shown in a separate "Pending Submissions" page
      const jobs = await storage.getJobsByCustomerId(customerUser.customerId);
      const visibleJobs = jobs.filter(j => j.status !== 'pending_customer_approval');
      
      // Get line items for each job and calculate estimated prices
      const jobsWithLineItems = await Promise.all(
        visibleJobs.map(async (job) => {
          const lineItems = await storage.getJobLineItems(job.id);

          // Calculate estimated price per line item (based on submitted qty/stitch count)
          let lineItemPrices: (number | "POA")[] = lineItems.map(() => "POA");
          if (pricingTable) {
            try {
              const priceResult = calculateJobPrice(
                lineItems.map(li => ({ quantity: li.quantity, stitchCount: li.stitchCount || 0, jobType: li.jobType || undefined })),
                pricingTable
              );
              lineItemPrices = priceResult.lineItemPrices.map(p => p.totalPrice);
            } catch {}
          }

          return {
            ...job,
            lineItems: lineItems.map((li, i) => ({
              ...li,
              estimatedPrice: lineItemPrices[i] ?? null,
            })),
            pricingTable,
            customerRequiresAdvancePayment: customer?.requiresAdvancePayment ?? false,
          };
        })
      );
      
      res.json(jobsWithLineItems);
    } catch (error) {
      console.error("Error fetching customer jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Customer Portal - Get distinct previous job names (for autocomplete on job submission)
  app.get("/api/customer-portal/jobs/previous-names", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Customer user not found" });
      const jobs = await storage.getJobsByCustomerId(customerUser.customerId);
      const completed = jobs.filter(j =>
        j.completed || j.invoiceStatus === "invoiced" || j.status === "completed"
      );
      const seen = new Set<string>();
      const names: { jobName: string; jobNumber: number | null; completedAt: string | null }[] = [];
      for (const job of completed.sort((a, b) => {
        const ad = (a as any).completedAt || (a as any).submittedAt;
        const bd = (b as any).completedAt || (b as any).submittedAt;
        return bd && ad ? new Date(bd).getTime() - new Date(ad).getTime() : 0;
      })) {
        const key = job.jobName.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          names.push({
            jobName: job.jobName.trim(),
            jobNumber: job.jobNumber ?? null,
            completedAt: (job as any).completedAt ?? (job as any).submittedAt ?? null,
          });
        }
      }
      res.json(names);
    } catch (error) {
      console.error("Error fetching previous job names:", error);
      res.status(500).json({ error: "Failed to fetch previous job names" });
    }
  });

  // Customer Portal - Get pending jobs (awaiting approval)
  app.get("/api/customer-portal/jobs/pending", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById((req.session as any).customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }
      
      const jobs = await storage.getJobsByCustomerId(customerUser.customerId);
      const pendingJobs = jobs.filter(j => j.status === 'pending_customer_approval');
      
      // Get files for each pending job
      const jobsWithDetails = await Promise.all(
        pendingJobs.map(async (job) => {
          const files = await storage.getJobFiles(job.id);
          const messages = await storage.getJobMessages(job.id);
          return {
            ...job,
            files,
            messages,
          };
        })
      );
      
      res.json(jobsWithDetails);
    } catch (error) {
      console.error("Error fetching pending jobs:", error);
      res.status(500).json({ error: "Failed to fetch pending jobs" });
    }
  });

  // Customer Portal - Get a single job by ID (for job detail page)
  app.get("/api/customer-portal/jobs/:jobId", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Customer user not found" });

      const job = await storage.getJob(req.params.jobId);
      if (!job || job.customerId !== customerUser.customerId) {
        return res.status(404).json({ error: "Job not found" });
      }

      const customer = await storage.getCustomer(job.customerId);
      res.json({
        ...job,
        customerRequiresAdvancePayment: customer?.requiresAdvancePayment ?? false,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Customer Portal - Submit new job
  app.post("/api/customer-portal/jobs", isCustomerAuthenticated, async (req: any, res) => {
    try {
      console.log('[JOB SUBMISSION] Starting job submission process');
      const customerUserId = (req.session as any).customerUserId;
      console.log('[JOB SUBMISSION] Customer User ID:', customerUserId);
      
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) {
        console.log('[JOB SUBMISSION] Customer user not found:', customerUserId);
        return res.status(404).json({ error: "Customer user not found" });
      }
      console.log('[JOB SUBMISSION] Customer user found:', customerUser.email);

      const data = customerJobSubmissionSchema.parse(req.body);
      console.log('[JOB SUBMISSION] Request data parsed:', data);
      
      // Get customer to use their address as default
      const customers = await storage.getCustomers();
      console.log('[JOB SUBMISSION] Fetched customers, count:', customers.length);
      const customer = customers.find(c => c.id === customerUser.customerId);
      if (!customer) {
        console.log('[JOB SUBMISSION] Customer not found for customerId:', customerUser.customerId);
        console.log('[JOB SUBMISSION] Available customer IDs:', customers.map(c => c.id));
        return res.status(404).json({ error: "Customer not found" });
      }
      console.log('[JOB SUBMISSION] Customer found:', customer.name);

      // Create job with pending status
      console.log('[JOB SUBMISSION] Creating job...');
      const job = await storage.createJob({
        customerId: customerUser.customerId,
        jobName: data.jobName,
        poNumber: data.poNumber || null,
        quantity: data.quantity ?? 0,
        goodsReceived: null,
        requiredDispatchDate: new Date(data.requiredDispatchDate) as any,
        machineId: null,
        notes: data.notes || null,
        status: 'pending_customer_approval',
        deliveryAddress: data.deliveryAddress || customer.address || null,
        submittedById: customerUserId,
        submittedAt: new Date() as any,
      });
      console.log('[JOB SUBMISSION] Job created successfully:', job.id);

      // Create automatic welcome message to open the chat thread
      try {
        await storage.createJobMessage({
          jobId: job.id,
          senderType: 'staff',
          senderId: 'system',
          message: 'Thank you for submitting your files. They are being reviewed by our team.',
          readByStaff: true,
          readByCustomer: false,
        } as any);
      } catch (msgError) {
        console.error('[JOB SUBMISSION] Failed to create opening chat message:', msgError);
      }

      // Send email notification to Chris only for now
      try {
        const allStaff = await storage.getStaff();
        // Only send to Chris for holding area submissions
        const chris = allStaff.find(s => s.name.toLowerCase() === 'chris' && s.email);
        const staffEmails = chris ? [chris.email!] : [];
        
        if (staffEmails.length > 0) {
          const dispatchDate = job.requiredDispatchDate ? new Date(job.requiredDispatchDate).toLocaleDateString('en-GB') : 'Not specified';
          await sendNewJobSubmissionEmail(staffEmails, {
            jobName: job.jobName,
            customerName: customer.name,
            quantity: job.quantity,
            poNumber: job.poNumber,
            requiredDispatchDate: dispatchDate,
            jobId: job.id,
          });
        }
      } catch (emailError) {
        console.error('Failed to send job submission notification email:', emailError);
        // Don't fail the request if email fails
      }

      // Send new logo setup notification if needed
      if (data.logoType === "new_logo") {
        try {
          await sendNewLogoSetupEmail({
            customerName: customer.name,
            jobName: job.jobName,
          });
        } catch (logoEmailError) {
          console.error('Failed to send new logo setup email:', logoEmailError);
        }
      }

      res.json(job);
    } catch (error) {
      console.error("Error creating job submission:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create job submission" });
      }
    }
  });

  // Customer Portal - Get upload URL for file (legacy signed-URL approach)
  app.post("/api/customer-portal/objects/upload", isCustomerAuthenticated, async (req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const { url, key } = await objectStorageService.getObjectEntityUploadURLWithKey();
      res.json({ url, key });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Customer Portal - Server-side file upload (avoids browser CORS issues with GCS)
  app.post(
    "/api/customer-portal/upload-file",
    isCustomerAuthenticated,
    express.raw({ type: "*/*", limit: "50mb" }),
    async (req: any, res) => {
      try {
        const { objectStorageClient, ObjectStorageService } = await import("./objectStorage");
        const { randomUUID } = await import("crypto");
        const objectStorageService = new ObjectStorageService();
        const privateObjectDir = objectStorageService.getPrivateObjectDir();

        const fileName = req.headers["x-file-name"]
          ? decodeURIComponent(req.headers["x-file-name"] as string)
          : "upload";
        const fileType = (req.headers["x-file-type"] as string) || "application/octet-stream";
        const fileSize = (req.body as Buffer).length;

        const objectId = randomUUID();
        const fullPath = `${privateObjectDir}/uploads/${objectId}`;
        // fullPath format: /bucketName/objectName
        const parts = fullPath.slice(1).split("/");
        const bucketName = parts[0];
        const objectName = parts.slice(1).join("/");

        const bucket = objectStorageClient.bucket(bucketName);
        const gcsFile = bucket.file(objectName);
        await gcsFile.save(req.body as Buffer, { contentType: fileType });

        const key = `/objects/uploads/${objectId}`;
        res.json({ key, fileName, fileSize, fileType });
      } catch (error: any) {
        console.error("Error uploading file:", error);
        res.status(500).json({ error: error?.message || "Failed to upload file" });
      }
    }
  );

  // Customer Portal - Add file to job after upload
  app.post("/api/customer-portal/jobs/:jobId/files", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById((req.session as any).customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }

      const job = await storage.getJob(req.params.jobId);
      if (!job || job.customerId !== customerUser.customerId) {
        return res.status(404).json({ error: "Job not found" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      // Accept both objectKey (new) and fileUrl (legacy) for the file path
      const rawFileUrl = req.body.objectKey || req.body.fileUrl;
      if (!rawFileUrl) {
        return res.status(400).json({ error: "Missing file URL or object key" });
      }
      const fileUrl = objectStorageService.normalizeObjectEntityPath(rawFileUrl);

      const fileData = insertJobFileSchema.parse({
        jobId: req.params.jobId,
        fileName: req.body.fileName,
        fileUrl: fileUrl,
        fileSize: req.body.fileSize,
        fileType: req.body.fileType,
        uploadedBy: 'customer',
        uploaderId: (req.session as any).customerUserId,
      });

      const file = await storage.createJobFile(fileData);
      
      // Set ACL policy for the file
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(fileUrl);
        const { setObjectAclPolicy } = await import("./objectAcl");
        const { ObjectAccessGroupType, ObjectPermission } = await import("./objectAcl");
        await setObjectAclPolicy(objectFile, {
          owner: (req.session as any).customerUserId,
          visibility: "private",
          aclRules: [{
            group: { type: ObjectAccessGroupType.CUSTOMER_COMPANY, id: customerUser.customerId },
            permission: ObjectPermission.READ,
          }],
        });
      } catch (aclError) {
        console.error("Error setting ACL policy:", aclError);
      }

      res.json(file);
    } catch (error) {
      console.error("Error adding file to job:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to add file to job" });
      }
    }
  });

  // Customer Portal - Send message on job
  app.post("/api/customer-portal/jobs/:jobId/messages", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById((req.session as any).customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }

      const job = await storage.getJob(req.params.jobId);
      if (!job || job.customerId !== customerUser.customerId) {
        return res.status(404).json({ error: "Job not found" });
      }

      const messageData = insertJobMessageSchema.parse({
        jobId: req.params.jobId,
        senderType: 'customer',
        senderId: (req.session as any).customerUserId,
        message: req.body.message,
        ...(req.body.imageUrl ? { imageUrl: req.body.imageUrl } : {}),
      });

      const message = await storage.createJobMessage(messageData);

      // Email staff who have notifications enabled (fire-and-forget).
      // Mirrors the notification logic on /messages/send so customers messaging
      // from the job detail page also alert staff.
      (async () => {
        try {
          const allCustomers = await storage.getCustomers();
          const customer = allCustomers.find(c => c.id === customerUser.customerId);
          const allStaff = await storage.getAllUsers();
          const staffEmailsToNotify = allStaff
            .filter(u => u.role !== 'customer' && u.active && u.emailNotificationsMessages && u.email)
            .map(u => u.email as string);
          if (staffEmailsToNotify.length > 0 && customer && shouldSendStaffNotification(`job:${job.id}`)) {
            const { sendCustomerMessageNotificationEmail } = await import('./emailService.js');
            await sendCustomerMessageNotificationEmail(staffEmailsToNotify, {
              customerName: customer.name,
              jobName: job.jobName,
              jobId: job.id,
              message: req.body.message,
            });
          }
        } catch (emailErr) {
          console.error("Failed to send staff message notification email (job detail route):", emailErr);
        }
      })();

      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  // Customer Portal - Get messages for job
  app.get("/api/customer-portal/jobs/:jobId/messages", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById((req.session as any).customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }

      const job = await storage.getJob(req.params.jobId);
      if (!job || job.customerId !== customerUser.customerId) {
        return res.status(404).json({ error: "Job not found" });
      }

      const allMessages = await storage.getJobMessages(req.params.jobId);
      // Filter out internal (staff-only) and soft-deleted messages from customer view
      const messages = allMessages.filter((m: any) => !m.isInternal && !m.deleted);
      
      // Mark messages as read by customer (only non-internal ones)
      await storage.markMessagesAsRead(req.params.jobId, 'customer');

      // Enrich with sender display name and profile image
      const allStaff = await storage.getStaff();
      const allUsers = await storage.getAllUsers();
      const enriched = await Promise.all(messages.map(async (msg: any) => {
        if (msg.senderType === 'staff') {
          const staffMember = allStaff.find((s: any) => s.id === msg.senderId);
          const linkedUser = staffMember ? allUsers.find((u: any) => u.id === staffMember.userId) : null;
          return { ...msg, imageUrl: normalizeImgUrl((msg as any).imageUrl), senderName: staffMember?.name || null, senderImageUrl: normalizeImgUrl(linkedUser?.profileImageUrl) };
        } else if (msg.senderType === 'customer') {
          const customerUser = await storage.getCustomerUserById(msg.senderId);
          const displayName = customerUser ? [customerUser.firstName, customerUser.lastName].filter(Boolean).join(' ') || customerUser.email : null;
          return { ...msg, imageUrl: normalizeImgUrl((msg as any).imageUrl), senderName: displayName, senderImageUrl: normalizeImgUrl((customerUser as any)?.profileImageUrl) };
        }
        return { ...msg, imageUrl: normalizeImgUrl((msg as any).imageUrl), senderName: null, senderImageUrl: null };
      }));
      
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Customer Portal - Get all conversations (all jobs with message summary)
  app.get("/api/customer-portal/conversations", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerId = req.session?.customerUserId
        ? (await storage.getCustomerUserById(req.session.customerUserId))?.customerId
        : req.session?.impersonationCustomerUserId
        ? (await storage.getCustomerUserById(req.session.impersonationCustomerUserId))?.customerId
        : null;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });
      // Always include archived so they appear in the archived section (not completely hidden)
      const conversations = await storage.getConversationsForCustomer(customerId, true);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Customer Portal - Archive a job conversation (hide from customer's Order Chats list)
  app.put("/api/customer-portal/jobs/:jobId/conversation/archive", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.customerUserId || req.session?.impersonationCustomerUserId;
      const customerUser = await storage.getCustomerUserById(userId);
      if (!customerUser) return res.status(401).json({ error: "Not authenticated" });
      const job = await storage.getJob(req.params.jobId);
      if (!job || job.customerId !== customerUser.customerId) {
        return res.status(404).json({ error: "Job not found" });
      }
      await storage.updateJob(req.params.jobId, { conversationArchivedByCustomer: true });
      res.json({ success: true });
    } catch (error) {
      console.error("Error archiving conversation:", error);
      res.status(500).json({ error: "Failed to archive conversation" });
    }
  });

  // Customer Portal - Unarchive a job conversation
  app.put("/api/customer-portal/jobs/:jobId/conversation/unarchive", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.customerUserId || req.session?.impersonationCustomerUserId;
      const customerUser = await storage.getCustomerUserById(userId);
      if (!customerUser) return res.status(401).json({ error: "Not authenticated" });
      const job = await storage.getJob(req.params.jobId);
      if (!job || job.customerId !== customerUser.customerId) {
        return res.status(404).json({ error: "Job not found" });
      }
      await storage.updateJob(req.params.jobId, { conversationArchivedByCustomer: false });
      res.json({ success: true });
    } catch (error) {
      console.error("Error unarchiving conversation:", error);
      res.status(500).json({ error: "Failed to unarchive conversation" });
    }
  });

  // Customer Portal - Get unread message count
  app.get("/api/customer-portal/messages/unread-count", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerId = req.session?.customerUserId
        ? (await storage.getCustomerUserById(req.session.customerUserId))?.customerId
        : req.session?.impersonationCustomerUserId
        ? (await storage.getCustomerUserById(req.session.impersonationCustomerUserId))?.customerId
        : null;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });
      const count = await storage.getUnreadCountForCustomer(customerId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Customer Portal - Send message on any job (production or pending)
  app.post("/api/customer-portal/jobs/:jobId/messages/send", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.customerUserId || req.session?.impersonationCustomerUserId;
      const customerUser = await storage.getCustomerUserById(userId);
      if (!customerUser) return res.status(404).json({ error: "Customer user not found" });

      const job = await storage.getJob(req.params.jobId);
      if (!job || job.customerId !== customerUser.customerId) {
        return res.status(404).json({ error: "Job not found" });
      }

      const messageText = (req.body.message || '').trim();
      const imageUrl = req.body.imageUrl || null;
      if (!messageText && !imageUrl) {
        return res.status(400).json({ error: "Message cannot be empty" });
      }

      const message = await storage.createJobMessage({
        jobId: req.params.jobId,
        senderType: 'customer',
        senderId: userId,
        message: messageText,
        ...(imageUrl ? { imageUrl } : {}),
      });

      // Auto-save any file/image attachments to job_files for permanent record-keeping
      (async () => {
        try {
          if (imageUrl) {
            await storage.createJobFile({
              jobId: req.params.jobId,
              fileName: 'Image attachment (from chat)',
              fileUrl: imageUrl,
              fileSize: 0,
              fileType: 'image',
              uploadedBy: 'customer',
              uploaderId: userId,
            });
          }
          if (messageText) {
            const fileRegex = /\[FILE:([^:]+):([^\]]+)\]/g;
            let match;
            while ((match = fileRegex.exec(messageText)) !== null) {
              const [, fileName, fileKey] = match;
              await storage.createJobFile({
                jobId: req.params.jobId,
                fileName,
                fileUrl: fileKey,
                fileSize: 0,
                fileType: 'application/octet-stream',
                uploadedBy: 'customer',
                uploaderId: userId,
              });
            }
          }
        } catch (e) { /* non-critical */ }
      })();

      // Email staff who have notifications enabled (fire-and-forget)
      (async () => {
        try {
          const allCustomers = await storage.getCustomers();
          const customer = allCustomers.find(c => c.id === customerUser.customerId);
          const allStaff = await storage.getAllUsers();
          const staffEmailsToNotify = allStaff
            .filter(u => u.role !== 'customer' && u.active && u.emailNotificationsMessages && u.email)
            .map(u => u.email as string);
          if (staffEmailsToNotify.length > 0 && customer && shouldSendStaffNotification(`job:${job.id}`)) {
            const { sendCustomerMessageNotificationEmail } = await import('./emailService.js');
            await sendCustomerMessageNotificationEmail(staffEmailsToNotify, {
              customerName: customer.name,
              jobName: job.jobName,
              jobId: job.id,
              message: req.body.message,
            });
          }
        } catch (emailErr) {
          console.error("Failed to send staff message notification email:", emailErr);
        }
      })();

      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Staff — update message notification preference
  app.patch("/api/staff/me/notification-settings", isStaffAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { emailNotificationsMessages } = req.body;
      if (typeof emailNotificationsMessages !== "boolean") {
        return res.status(400).json({ error: "emailNotificationsMessages must be a boolean" });
      }
      await storage.updateUser(userId, { emailNotificationsMessages });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating notification settings:", error);
      res.status(500).json({ error: "Failed to update notification settings" });
    }
  });

  // Admin - Update any user's email notification setting
  app.patch("/api/users/:userId/notification-settings", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { emailNotificationsMessages } = req.body;
      if (typeof emailNotificationsMessages !== "boolean") {
        return res.status(400).json({ error: "emailNotificationsMessages must be a boolean" });
      }
      await storage.updateUser(userId, { emailNotificationsMessages });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user notification settings:", error);
      res.status(500).json({ error: "Failed to update notification settings" });
    }
  });

  // Staff - Get all conversations with unread indicators
  app.get("/api/staff/conversations", isStaffAuthenticated, async (req, res) => {
    try {
      const includeArchived = req.query.includeArchived === "true";
      const conversations = await storage.getAllConversationsForStaff(includeArchived);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching staff conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Staff - Edit a job message
  app.patch("/api/staff/jobs/:jobId/messages/:messageId", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: "Message cannot be empty" });
      const job = await storage.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      await storage.updateJobMessage(req.params.messageId, message.trim());
      res.json({ success: true });
    } catch (error) {
      console.error("Error editing message:", error);
      res.status(500).json({ error: "Failed to edit message" });
    }
  });

  // Staff - Thumbs up a job message (toggle)
  app.post("/api/staff/jobs/:jobId/messages/:messageId/thumbs-up", isStaffAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      await storage.toggleJobMessageThumbsUp(req.params.messageId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error toggling thumbs up:", error);
      res.status(500).json({ error: "Failed to toggle thumbs up" });
    }
  });

  // Staff - Delete (unsend) a job message
  app.delete("/api/staff/jobs/:jobId/messages/:messageId", isStaffAuthenticated, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      await storage.deleteJobMessage(req.params.messageId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // Staff - Archive a job conversation
  app.put("/api/staff/jobs/:jobId/conversation/archive", isStaffAuthenticated, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      await storage.updateJob(req.params.jobId, { conversationArchivedByStaff: true } as any);
      res.json({ success: true });
    } catch (error) {
      console.error("Error archiving conversation:", error);
      res.status(500).json({ error: "Failed to archive conversation" });
    }
  });

  // Staff - Search a customer's job messages (live + archived)
  app.get("/api/staff/customers/:customerId/messages/search", isStaffAuthenticated, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q || q.length < 2) return res.json([]);
      const results = await storage.searchCustomerJobMessages(req.params.customerId, q);
      res.json(results);
    } catch (error) {
      console.error("Error searching customer messages:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  });

  // Staff - Unarchive a job conversation
  app.put("/api/staff/jobs/:jobId/conversation/unarchive", isStaffAuthenticated, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      await storage.updateJob(req.params.jobId, { conversationArchivedByStaff: false } as any);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unarchiving conversation:", error);
      res.status(500).json({ error: "Failed to unarchive conversation" });
    }
  });

  // Staff - Get unread message count
  app.get("/api/staff/messages/unread-count", isStaffAuthenticated, async (req, res) => {
    try {
      const count = await storage.getUnreadCountForStaff();
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Staff - Get pending customer job submissions
  app.get("/api/staff/jobs/pending", isStaffAuthenticated, async (req, res) => {
    try {
      const allJobs = await storage.getJobs();
      const pendingJobs = allJobs.filter(j => j.status === 'pending_customer_approval');
      const customers = await storage.getCustomers();
      const customerMap = new Map(customers.map(c => [c.id, c]));
      
      // Get files, messages, and customer name for each pending job
      const jobsWithDetails = await Promise.all(
        pendingJobs.map(async (job) => {
          const files = await storage.getJobFiles(job.id);
          const messages = await storage.getJobMessages(job.id);
          const customer = customerMap.get(job.customerId);
          let submitterEmail: string | null = null;
          if (job.submittedById) {
            try {
              const submitter = await storage.getCustomerUserById(job.submittedById);
              submitterEmail = submitter?.email || null;
            } catch {}
          }
          return {
            ...job,
            customerName: customer?.name || 'Unknown Customer',
            customerStripePaymentLink: customer?.stripePaymentLink || null,
            customerCreditAccount: customer?.creditAccount ?? true,
            customerAddress: customer?.address || null,
            submitterEmail,
            files,
            messages,
          };
        })
      );
      
      res.json(jobsWithDetails);
    } catch (error) {
      console.error("Error fetching pending jobs:", error);
      res.status(500).json({ error: "Failed to fetch pending jobs" });
    }
  });

  // Staff - Update staff notes on a pending job
  app.patch("/api/staff/jobs/:jobId/staff-notes", isStaffAuthenticated, async (req, res) => {
    try {
      const { staffNotes } = req.body;
      const job = await storage.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const updated = await storage.updateJob(req.params.jobId, { staffNotes: staffNotes ?? null });
      res.json(updated);
    } catch (error) {
      console.error("Error updating staff notes:", error);
      res.status(500).json({ error: "Failed to update staff notes" });
    }
  });

  // Staff - Approve job
  app.post("/api/staff/jobs/:jobId/approve", isStaffAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      console.log('[JOB APPROVE] Found job:', job.id, 'Name:', job.jobName, 'Current status:', job.status);

      // Get staff ID from userId (convert both to string for safe comparison)
      const allStaff = await storage.getStaff();
      const sessionUserId = String(req.session.userId);
      const staff = allStaff.find(s => s.userId && String(s.userId) === sessionUserId);
      console.log('[JOB APPROVE] Staff found:', staff?.id, staff?.name);

      // Update job status to production
      const updatedJob = await storage.updateJob(req.params.jobId, {
        status: 'production',
        approvedById: staff?.id || null,
        approvedAt: new Date() as any,
      });
      console.log('[JOB APPROVE] Job updated. New status:', updatedJob.status, 'Job ID:', updatedJob.id);

      res.json({ success: true });
    } catch (error) {
      console.error("Error approving job:", error);
      res.status(500).json({ error: "Failed to approve job" });
    }
  });

  // Staff - Send order acknowledgement email
  app.post("/api/jobs/:jobId/send-acknowledgement", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { customerEmail } = req.body;
      if (!customerEmail) {
        return res.status(400).json({ error: "customerEmail is required" });
      }
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === job.customerId);
      const jobLineItems = await storage.getJobLineItems(job.id);
      await sendJobApprovedEmail(customerEmail, {
        jobName: job.jobName,
        customerName: customer?.name || 'Customer',
        jobId: job.id,
        jobNumber: job.jobNumber,
        quantity: job.quantity,
        poNumber: job.poNumber,
        notes: job.notes,
        requiredDispatchDate: job.requiredDispatchDate ? new Date(job.requiredDispatchDate as any) : null,
        customerAddress: customer?.address || null,
        deliveryAddress: job.deliveryAddress || null,
        orderDate: job.submittedAt ? new Date(job.submittedAt as any) : new Date(),
        stripePaymentLink: customer?.stripePaymentLink || null,
        creditAccount: customer?.creditAccount ?? true,
        shippingMethod: job.shippingMethod || null,
        lineItems: jobLineItems.map(li => ({
          jobType: li.jobType || 'Embroidery',
          position: li.position || null,
          description: li.description || null,
          quantity: li.quantity,
        })),
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending acknowledgement email:", error);
      res.status(500).json({ error: "Failed to send acknowledgement email" });
    }
  });

  // Staff - Reject job
  app.post("/api/staff/jobs/:jobId/reject", isStaffAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Get staff ID from userId (convert both to string for safe comparison)
      const allStaff = await storage.getStaff();
      const sessionUserId = String(req.session.userId);
      const staff = allStaff.find(s => s.userId && String(s.userId) === sessionUserId);

      // Update job status and add rejection reason
      await storage.updateJob(req.params.jobId, {
        status: 'rejected',
        rejectedById: staff?.id || null,
        rejectedAt: new Date() as any,
        rejectionReason: req.body.reason || null,
      });

      // Optionally send a message to the customer
      if (req.body.message && staff) {
        await storage.createJobMessage({
          jobId: req.params.jobId,
          senderType: 'staff',
          senderId: staff.id,
          message: req.body.message,
        });
      }

      // Send email notification to customer
      try {
        if (job.submittedById) {
          const customerUser = await storage.getCustomerUserById(job.submittedById);
          if (customerUser && customerUser.email) {
            const customers = await storage.getCustomers();
            const customer = customers.find(c => c.id === job.customerId);
            await sendJobRejectedEmail(customerUser.email, {
              jobName: job.jobName,
              customerName: customer?.name || 'Customer',
              jobId: job.id,
              rejectionReason: req.body.reason || null,
              rejectionMessage: req.body.message || null,
            });
          }
        }
      } catch (emailError) {
        console.error('Failed to send job rejection notification email:', emailError);
        // Don't fail the request if email fails
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting job:", error);
      res.status(500).json({ error: "Failed to reject job" });
    }
  });

  // Staff - Send message to customer about a job
  app.post("/api/staff/jobs/:jobId/messages", isStaffAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Resolve sender: prefer a linked staff record, fall back to the user record itself
      const sessionUserId = String(req.session.userId);
      const allStaff = await storage.getStaff();
      const staffMember = allStaff.find(s => s.userId && String(s.userId) === sessionUserId);

      // Use staff.id if found, otherwise fall back to the userId (e.g. super_admin with no staff record)
      const senderId = staffMember ? staffMember.id : sessionUserId;
      let senderName = staffMember?.name || '';
      if (!senderName) {
        const allUsers = await storage.getAllUsers();
        const userRecord = allUsers.find(u => u.id === sessionUserId);
        senderName = [userRecord?.firstName, userRecord?.lastName].filter(Boolean).join(' ') || 'Staff';
      }

      const isInternal = !!req.body.isInternal;

      const message = await storage.createJobMessage({
        jobId: req.params.jobId,
        senderType: 'staff',
        senderId,
        message: req.body.message,
        ...(req.body.imageUrl ? { imageUrl: req.body.imageUrl } : {}),
        ...(isInternal ? { isInternal: true } : {}),
      });

      // Auto-save any file/image attachments to job_files for permanent record-keeping
      (async () => {
        try {
          if (req.body.imageUrl) {
            await storage.createJobFile({
              jobId: req.params.jobId,
              fileName: 'Image attachment (from chat)',
              fileUrl: req.body.imageUrl,
              fileSize: 0,
              fileType: 'image',
              uploadedBy: 'staff',
              uploaderId: senderId,
            });
          }
          if (req.body.message) {
            const fileRegex = /\[FILE:([^:]+):([^\]]+)\]/g;
            let match;
            while ((match = fileRegex.exec(req.body.message)) !== null) {
              const [, fileName, fileKey] = match;
              await storage.createJobFile({
                jobId: req.params.jobId,
                fileName,
                fileUrl: fileKey,
                fileSize: 0,
                fileType: 'application/octet-stream',
                uploadedBy: 'staff',
                uploaderId: senderId,
              });
            }
          }
        } catch (e) { /* non-critical */ }
      })();

      // Fire @mention notifications for any @handles in this message
      if (req.body.message) {
        const baseUrl = getBaseUrl();
        notifyMentionedStaff(
          req.body.message,
          senderName,
          sessionUserId,
          `${job.jobName}`,
          `${baseUrl}/messages?jobId=${job.id}`,
        );
      }

      // Send email notification to customer for every non-internal staff message
      if (!isInternal && job.customerId) {
        try {
          const customerUsers = await storage.getCustomerUsersByCustomerId(job.customerId);
          const emails = customerUsers
            .filter((u) => u.emailNotificationsMessages)
            .map((u) => u.email).filter(Boolean) as string[];
          if (emails.length) {
            const baseUrl = getBaseUrl();
            const portalUrl = `${baseUrl}/customer/job/${job.id}`;
            await sendNewChatEmail(emails, {
              staffName: senderName,
              subject: job.jobName,
              firstMessage: req.body.message,
              portalUrl,
              isJobChat: true,
              jobName: job.jobName,
            });
          }
        } catch (emailErr) {
          console.error('Failed to send job chat email notification:', emailErr);
        }
      }

      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Staff - Get messages for a job
  app.get("/api/staff/jobs/:jobId/messages", isStaffAuthenticated, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const messages = await storage.getJobMessages(req.params.jobId);
      
      // Mark messages as read by staff
      await storage.markMessagesAsRead(req.params.jobId, 'staff');
      
      // Enrich messages with sender names and profile images
      const allStaff = await storage.getStaff();
      const allUsers = await storage.getAllUsers();
      const enrichedMessages = await Promise.all(
        messages.map(async (msg) => {
          if (msg.senderType === 'staff' && msg.senderId) {
            const staffMember = allStaff.find(s => s.id === msg.senderId);
            const linkedUser = staffMember?.userId
              ? allUsers.find(u => u.id === staffMember.userId)
              : allUsers.find(u => u.id === msg.senderId);
            return {
              ...msg,
              imageUrl: normalizeImgUrl((msg as any).imageUrl),
              senderName: staffMember?.name || [linkedUser?.firstName, linkedUser?.lastName].filter(Boolean).join(' ') || null,
              senderImageUrl: normalizeImgUrl(linkedUser?.profileImageUrl),
            };
          } else if (msg.senderType === 'customer' && msg.senderId) {
            const customerUser = await storage.getCustomerUserById(msg.senderId);
            const name = [customerUser?.firstName, customerUser?.lastName]
              .filter(Boolean)
              .join(' ') || customerUser?.email || null;
            return { ...msg, imageUrl: normalizeImgUrl((msg as any).imageUrl), senderName: name, senderImageUrl: normalizeImgUrl((customerUser as any)?.profileImageUrl) };
          }
          return { ...msg, imageUrl: normalizeImgUrl((msg as any).imageUrl), senderName: null, senderImageUrl: null };
        })
      );

      res.json(enrichedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Staff - Get files for a job
  app.get("/api/jobs/:jobId/files", isStaffAuthenticated, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const files = await storage.getJobFiles(req.params.jobId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching job files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  // Staff - Download all files for a job as a ZIP
  app.get("/api/jobs/:jobId/files/download-all", isStaffAuthenticated, async (req, res) => {
    try {
      const archiver = (await import("archiver")).default;
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();

      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const files = await storage.getJobFiles(req.params.jobId);
      if (files.length === 0) {
        return res.status(404).json({ error: "No files to download" });
      }

      const safeJobName = (job.jobName || "files").replace(/[^a-zA-Z0-9\s\-_]/g, "").trim() || "files";

      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeJobName}.zip"`,
      });

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err) => {
        console.error("Archiver error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to create archive" });
        }
      });

      archive.pipe(res);

      for (const file of files) {
        try {
          // Stored fileUrls come in several formats: "/api/img/uploads/<id>"
          // (the served path), "/objects/uploads/<id>", or a full GCS URL.
          // getObjectEntityFile only accepts "/objects/..." paths, so normalise
          // every format down to that before resolving — otherwise non-/objects
          // files silently fail with "Object not found" and get skipped.
          let objectPath = objectStorageService.normalizeObjectEntityPath(file.fileUrl);
          objectPath = objectPath.replace(/^(\/api\/img)+/, "/objects");
          const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
          const stream = objectFile.createReadStream();
          archive.append(stream, { name: file.fileName });
        } catch (err) {
          console.error(`Skipping file ${file.fileName}:`, err);
        }
      }

      await archive.finalize();
    } catch (error) {
      console.error("Error creating ZIP download:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download files" });
      }
    }
  });

  // Staff - Upload a customer logo image directly
  app.post(
    "/api/staff/upload-logo",
    isStaffAuthenticated,
    express.raw({ type: "*/*", limit: "10mb" }),
    async (req: any, res) => {
      try {
        const { objectStorageClient, ObjectStorageService } = await import("./objectStorage");
        const { randomUUID } = await import("crypto");
        const objectStorageService = new ObjectStorageService();
        const privateObjectDir = objectStorageService.getPrivateObjectDir();

        const fileType = (req.headers["x-file-type"] as string) || "image/png";
        const objectId = randomUUID();
        const fullPath = `${privateObjectDir}/uploads/${objectId}`;
        const parts = fullPath.slice(1).split("/");
        const bucketName = parts[0];
        const objectName = parts.slice(1).join("/");

        const bucket = objectStorageClient.bucket(bucketName);
        const gcsFile = bucket.file(objectName);
        await gcsFile.save(req.body as Buffer, { contentType: fileType });

        const url = `/api/img/uploads/${objectId}`;
        res.json({ url });
      } catch (error: any) {
        console.error("Error uploading logo:", error);
        res.status(500).json({ error: error?.message || "Failed to upload logo" });
      }
    }
  );

  app.post("/api/staff/objects/upload", isStaffAuthenticated, async (req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const { url, key } = await objectStorageService.getObjectEntityUploadURLWithKey();
      res.json({ uploadURL: url, url, key });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Staff - Server-side file upload (works for all file types including DST, PDF)
  app.post(
    "/api/staff/upload-file",
    isStaffAuthenticated,
    express.raw({ type: "*/*", limit: "50mb" }),
    async (req: any, res) => {
      try {
        const { objectStorageClient, ObjectStorageService } = await import("./objectStorage");
        const { randomUUID } = await import("crypto");
        const objectStorageService = new ObjectStorageService();
        const privateObjectDir = objectStorageService.getPrivateObjectDir();

        const fileName = req.headers["x-file-name"]
          ? decodeURIComponent(req.headers["x-file-name"] as string)
          : "upload";
        const fileType = (req.headers["x-file-type"] as string) || "application/octet-stream";

        const objectId = randomUUID();
        const fullPath = `${privateObjectDir}/uploads/${objectId}`;
        const parts = fullPath.slice(1).split("/");
        const bucketName = parts[0];
        const objectName = parts.slice(1).join("/");

        const bucket = objectStorageClient.bucket(bucketName);
        const gcsFile = bucket.file(objectName);
        await gcsFile.save(req.body as Buffer, { contentType: fileType });

        const key = `/objects/uploads/${objectId}`;
        res.json({ key, fileName, fileType });
      } catch (error: any) {
        console.error("Error uploading staff file:", error);
        res.status(500).json({ error: error?.message || "Failed to upload file" });
      }
    }
  );

  // Staff - Get current user info
  app.get("/api/staff/me", isStaffAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const allStaff = await storage.getStaff();
      const staffMember = allStaff.find(s => s.userId === userId);
      res.json({ ...user, profileImageUrl: normalizeImgUrl(user.profileImageUrl), staffName: staffMember?.name || null, staffId: staffMember?.id || null });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Customer Portal - Get current user info
  app.get("/api/customer-portal/me", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).customerUserId;
      if (!customerUserId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getCustomerUserById(customerUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ ...user, profileImageUrl: normalizeImgUrl(user.profileImageUrl) });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Staff - Update own profile picture
  app.put("/api/staff/me/profile-picture", isStaffAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { profileImageUrl } = req.body;
      if (!profileImageUrl) return res.status(400).json({ error: "profileImageUrl required" });
      await storage.updateUserProfileImage(userId, profileImageUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating profile picture:", error);
      res.status(500).json({ error: "Failed to update profile picture" });
    }
  });

  // Customer Portal - Update own profile picture
  app.put("/api/customer-portal/me/profile-picture", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).customerUserId;
      if (!customerUserId) return res.status(401).json({ error: "Not authenticated" });
      const { profileImageUrl } = req.body;
      if (!profileImageUrl) return res.status(400).json({ error: "profileImageUrl required" });
      await storage.updateCustomerUserProfileImage(customerUserId, profileImageUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating profile picture:", error);
      res.status(500).json({ error: "Failed to update profile picture" });
    }
  });

  // Super Admin - Update any user's profile picture
  app.put("/api/users/:userId/profile-picture", isStaffAuthenticated, requireSuperAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { profileImageUrl } = req.body;
      if (!profileImageUrl) return res.status(400).json({ error: "profileImageUrl required" });
      await storage.updateUserProfileImage(userId, profileImageUrl);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user profile picture:", error);
      res.status(500).json({ error: "Failed to update profile picture" });
    }
  });

  // Staff - Add file to job after upload
  app.post("/api/jobs/:jobId/files", isStaffAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const rawFileUrl = req.body.objectKey || req.body.fileUrl;

      if (!rawFileUrl) {
        return res.status(400).json({ error: "Missing file URL or object key" });
      }

      const fileUrl = objectStorageService.normalizeObjectEntityPath(rawFileUrl);

      const fileData = insertJobFileSchema.parse({
        jobId: req.params.jobId,
        fileName: req.body.fileName,
        fileUrl: fileUrl,
        fileSize: req.body.fileSize,
        fileType: req.body.fileType,
        uploadedBy: 'staff' as const,
        uploaderId: (req.session as any).userId,
      });

      const file = await storage.createJobFile(fileData);
      res.json(file);
    } catch (error) {
      console.error("Error adding file to job:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to add file" });
      }
    }
  });

  // Staff - Delete file from job
  app.delete("/api/jobs/:jobId/files/:fileId", isStaffAuthenticated, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      await storage.deleteJobFile(req.params.fileId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Customer routes
  app.get("/api/customers", isStaffAuthenticated, async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === req.params.id);
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(data);
      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create customer" });
      }
    }
  });

  app.patch("/api/customers/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const data = updateCustomerSchema.parse(req.body);
      const customer = await storage.updateCustomer(req.params.id, data);
      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update customer" 
        });
      }
    }
  });

  app.delete("/api/customers/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteCustomer(req.params.id);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Cannot delete customer with existing jobs") {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to delete customer" });
      }
    }
  });

  app.get("/api/customer-users/all", isStaffAuthenticated, async (req, res) => {
    try {
      const all = await storage.getAllCustomerUsers();
      const safeUsers = all.map(({ passwordHash: _, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer users" });
    }
  });

  app.get("/api/customers/:customerId/users", isStaffAuthenticated, async (req, res) => {
    try {
      const customerUsers = await storage.getCustomerUsersByCustomerId(req.params.customerId);
      // Return without password hashes
      const safeUsers = customerUsers.map(({ passwordHash: _, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer users" });
    }
  });

  // Staff routes
  app.get("/api/staff", isStaffAuthenticated, async (req, res) => {
    try {
      const staff = await storage.getStaff();
      res.json(staff);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // Returns every person who can be @mentioned: staff records + users without a staff record (excluding demo role)
  app.get("/api/staff/mentionable", isStaffAuthenticated, async (req, res) => {
    try {
      const staffMembers = await storage.getStaff();
      const allUsers = await storage.getAllUsers();
      const linkedUserIds = new Set(staffMembers.map(s => s.userId).filter(Boolean));
      // Also deduplicate by email — a user account belonging to a staff member
      // (even without a userId link) should not appear twice in the list.
      const staffEmailSet = new Set(
        staffMembers.map(s => s.email?.toLowerCase()).filter(Boolean) as string[]
      );
      const userIdToEmail = new Map(allUsers.map(u => [u.id, u.email]));
      // Add emails resolved via userId link so those are also deduped
      staffMembers.forEach(s => {
        if (s.userId) {
          const email = userIdToEmail.get(s.userId);
          if (email) staffEmailSet.add(email.toLowerCase());
        }
      });
      const userOnlyPeople = allUsers
        .filter(u =>
          u.active &&
          u.role !== "demo" &&
          !linkedUserIds.has(u.id) &&
          !(u.email && staffEmailSet.has(u.email.toLowerCase()))
        )
        .map(u => ({
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          email: u.email ?? null,
        }));
      const staffPeople = staffMembers.map(s => ({
        id: s.id,
        name: s.name,
        email: s.email ?? (s.userId ? (userIdToEmail.get(s.userId) ?? null) : null),
      }));
      res.json([...staffPeople, ...userOnlyPeople]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch mentionable users" });
    }
  });

  app.get("/api/staff/by-user/:userId", isStaffAuthenticated, async (req, res) => {
    try {
      const staff = await storage.getStaff();
      const userStaff = staff.find(s => s.userId === req.params.userId);
      if (!userStaff) {
        return res.status(404).json({ error: "No staff member found for this user" });
      }
      res.json(userStaff);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff member" });
    }
  });

  app.post("/api/staff", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertStaffSchema.parse(req.body);
      const staffMember = await storage.createStaff(data);
      res.json(staffMember);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create staff member" });
      }
    }
  });

  app.patch("/api/staff/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const data = updateStaffSchema.parse(req.body);
      // Only super_admins may change the "can approve holidays" flag.
      if (data.canApproveHolidays !== undefined) {
        const actingUser = req.session.userId
          ? await storage.getUser(req.session.userId)
          : undefined;
        if (!actingUser || actingUser.role !== "super_admin") {
          delete data.canApproveHolidays;
        }
      }
      // Only holiday approvers (or super_admins) may change a staff member's holiday allowance.
      if (data.holidayAllowance !== undefined) {
        const { canApprove } = await getHolidayContext(req);
        if (!canApprove) {
          return res.status(403).json({ error: "You do not have permission to edit holiday allowances" });
        }
      }
      const staffMember = await storage.updateStaff(req.params.id, data);
      res.json(staffMember);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update staff member" 
        });
      }
    }
  });

  app.delete("/api/staff/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteStaff(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete staff member" 
      });
    }
  });

  // Job routes
  app.get("/api/jobs/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const job = await storage.getJob(id);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      const lineItems = await storage.getJobLineItems(id);
      const customer = await storage.getCustomer(job.customerId);
      res.json({
        ...job,
        lineItems,
        customerRequiresAdvancePayment: customer?.requiresAdvancePayment ?? false,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // ── Wall-mounted TV dashboard ───────────────────────────────────────────────
  // Public (token-secured) live data feed consumed by /dashboard-tv.
  app.get("/api/dashboard-tv/data", async (req, res) => {
    try {
      const provided = String(req.query.token ?? "");
      const stored = await storage.getAppSetting(TOKEN_KEY);
      if (!stored) {
        return res.status(403).json({ error: "Dashboard display link not configured" });
      }
      const a = Buffer.from(provided);
      const b = Buffer.from(stored);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: "Invalid display token" });
      }
      const data = await buildDashboardTvData();
      res.set("Cache-Control", "no-store");
      res.json(data);
    } catch (error) {
      console.error("[ERROR] Failed to build TV dashboard data:", error);
      res.status(500).json({ error: "Failed to build dashboard data" });
    }
  });

  // Public: short, easy-to-type link for TVs/Firesticks. Redirects to the full secure URL.
  app.get("/tv/:code", async (req, res) => {
    try {
      const code = String(req.params.code ?? "").toLowerCase();
      const slug = await storage.getAppSetting(SLUG_KEY);
      const token = await storage.getAppSetting(TOKEN_KEY);
      if (slug && token && code === slug) {
        return res.redirect(302, `/dashboard-tv?token=${token}`);
      }
      // Unknown code -> show the "link required" empty state
      return res.redirect(302, "/dashboard-tv");
    } catch (error) {
      console.error("[ERROR] TV short-link redirect failed:", error);
      return res.redirect(302, "/dashboard-tv");
    }
  });

  // Admin: read the display link + daily target (auto-generates a token on first use)
  app.get("/api/dashboard-tv/config", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      let token = await storage.getAppSetting(TOKEN_KEY);
      if (!token) {
        token = crypto.randomBytes(24).toString("hex");
        await storage.setAppSetting(TOKEN_KEY, token);
      }
      let slug = await storage.getAppSetting(SLUG_KEY);
      if (!slug) {
        slug = generateTvSlug();
        await storage.setAppSetting(SLUG_KEY, slug);
      }
      const targetRaw = await storage.getAppSetting(DAILY_TARGET_KEY);
      const dailyTarget = Math.max(1, parseInt(targetRaw ?? "", 10) || DEFAULT_DAILY_TARGET);
      res.json({ token, slug, dailyTarget, path: `/dashboard-tv?token=${token}`, shortPath: `/tv/${slug}` });
    } catch (error) {
      console.error("[ERROR] Failed to read TV dashboard config:", error);
      res.status(500).json({ error: "Failed to read config" });
    }
  });

  // Admin: update daily target and/or regenerate the display token
  app.post("/api/dashboard-tv/config", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const { dailyTarget, regenerateToken } = req.body ?? {};
      if (dailyTarget !== undefined) {
        const n = parseInt(String(dailyTarget), 10);
        if (!Number.isFinite(n) || n < 1) {
          return res.status(400).json({ error: "Daily target must be a positive number" });
        }
        await storage.setAppSetting(DAILY_TARGET_KEY, String(n));
      }
      if (regenerateToken === true) {
        await storage.setAppSetting(TOKEN_KEY, crypto.randomBytes(24).toString("hex"));
        await storage.setAppSetting(SLUG_KEY, generateTvSlug());
      }
      const token = await storage.getAppSetting(TOKEN_KEY);
      let slug = await storage.getAppSetting(SLUG_KEY);
      if (!slug) {
        slug = generateTvSlug();
        await storage.setAppSetting(SLUG_KEY, slug);
      }
      const targetRaw = await storage.getAppSetting(DAILY_TARGET_KEY);
      const target = Math.max(1, parseInt(targetRaw ?? "", 10) || DEFAULT_DAILY_TARGET);
      res.json({ token, slug, dailyTarget: target, path: `/dashboard-tv?token=${token}`, shortPath: `/tv/${slug}` });
    } catch (error) {
      console.error("[ERROR] Failed to update TV dashboard config:", error);
      res.status(500).json({ error: "Failed to update config" });
    }
  });

  app.get("/api/jobs", isStaffAuthenticated, async (req, res) => {
    try {
      const { machineId, customerId } = req.query;
      
      let jobs;
      if (machineId) {
        jobs = await storage.getJobsByMachine(parseInt(machineId as string));
      } else if (customerId) {
        jobs = await storage.getJobsByCustomerId(customerId as string);
      } else {
        jobs = await storage.getJobs();
      }
      
      // Log job statuses for debugging
      const statusCounts = jobs.reduce((acc, j) => {
        acc[j.status] = (acc[j.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('[API /api/jobs] Returning', jobs.length, 'jobs. Status breakdown:', statusCounts);
      
      // Pre-load all customers once to avoid N+1 queries
      const allCustomers = await storage.getCustomers();
      const customerMap = new Map(allCustomers.map(c => [c.id, c]));

      // Enrich each job with its line items and customer advance payment flag
      const jobsWithLineItems = await Promise.all(
        jobs.map(async (job) => {
          const customer = customerMap.get(job.customerId);
          return {
            ...job,
            lineItems: await storage.getJobLineItems(job.id),
            customerRequiresAdvancePayment: customer?.requiresAdvancePayment ?? false,
          };
        })
      );
      
      res.json(jobsWithLineItems);
    } catch (error) {
      console.error("[ERROR] Failed to fetch jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.post("/api/jobs", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertJobSchema.parse(req.body);
      const job = await storage.createJob(data);
      res.json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create job" });
      }
    }
  });

  app.patch("/api/jobs/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const data = updateJobSchema.parse(req.body);
      
      // Extract consolidatedJobIds and existingShipmentId before filtering
      const consolidatedJobIds = data.consolidatedJobIds || [];
      const existingShipmentId = (req.body as any).existingShipmentId;
      
      // Remove undefined keys and consolidatedJobIds (not a database field) from updates
      const updates = Object.fromEntries(
        Object.entries(data).filter(([key, value]) => value !== undefined && key !== 'consolidatedJobIds')
      );
      
      // Handle consolidated shipments
      if (updates.shippingMethod === "consolidated") {
        if (existingShipmentId) {
          // Joining an existing consolidated shipment
          updates.consolidatedShipmentId = existingShipmentId;
          updates.shippingCost = null; // No cost when joining existing shipment
        } else if (consolidatedJobIds.length > 0) {
          // Creating a new consolidated shipment with other jobs
          // Generate a unique shipment ID for this consolidated shipment
          const { randomUUID } = await import('crypto');
          const consolidatedShipmentId = randomUUID();
          
          // Add the shipment ID to the current job
          updates.consolidatedShipmentId = consolidatedShipmentId;
          
          // Calculate shipping cost only for the primary job
          if (updates.packageType && updates.packageCount) {
            const shippingCost = calculateShippingCost(
              updates.packageType as "boxes" | "bags",
              updates.packageCount as number
            );
            updates.shippingCost = typeof shippingCost.cost === "number" 
              ? shippingCost.cost.toString() 
              : shippingCost.cost;
          }
          
          // Update all consolidated jobs with the same shipment details
          // (but without shipping cost - only the primary job has the cost)
          for (const consolidatedJobId of consolidatedJobIds) {
            await storage.updateJob(consolidatedJobId, {
              consolidatedShipmentId,
              shippingMethod: updates.shippingMethod as string,
              dhlTrackingNumber: (updates.dhlTrackingNumber as string | null)?.trim() ?? null,
              packageType: updates.packageType as string,
              packageCount: updates.packageCount as number,
              shippingCost: null, // Don't duplicate shipping cost on consolidated jobs
              completed: true, // Mark as completed
              invoiceStatus: "ready", // Ready for invoicing
              conversationArchivedByStaff: true, // Auto-archive chat when job moves to invoicing
            } as any);
          }
        } else {
          // Creating a single-job consolidated shipment (for future consolidation).
          // Assign a shipment ID now so the NEXT completed job can immediately
          // "Join Existing Consolidated Shipment" instead of having to bundle this one.
          const { randomUUID } = await import('crypto');
          updates.consolidatedShipmentId = randomUUID();

          // Calculate shipping cost
          if (updates.packageType && updates.packageCount) {
            const shippingCost = calculateShippingCost(
              updates.packageType as "boxes" | "bags",
              updates.packageCount as number
            );
            updates.shippingCost = typeof shippingCost.cost === "number" 
              ? shippingCost.cost.toString() 
              : shippingCost.cost;
          }
        }
      } else {
        // For non-consolidated shipments, calculate shipping cost if applicable
        if (updates.packageType && updates.packageCount) {
          const shippingCost = calculateShippingCost(
            updates.packageType as "boxes" | "bags",
            updates.packageCount as number
          );
          updates.shippingCost = typeof shippingCost.cost === "number" 
            ? shippingCost.cost.toString() 
            : shippingCost.cost;
        }
      }
      
      const job = await storage.updateJob(id, updates);
      res.json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error("PATCH /api/jobs/:id error:", error);
        res.status(500).json({ error: "Failed to update job" });
      }
    }
  });

  // Mark advance payment as received for a job
  app.post("/api/jobs/:id/mark-payment-received", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const job = await storage.getJob(id);
      if (!job) return res.status(404).json({ error: "Job not found" });

      const userId = req.session?.userId;
      await storage.updateJob(id, {
        paymentReceived: true,
        paymentReceivedAt: new Date(),
        paymentReceivedById: userId || null,
      } as any);

      // Trigger auto-scheduling for all unscheduled line items now that payment is received
      const lineItems = await storage.getJobLineItems(id);
      for (const item of lineItems) {
        if (item.machineId && !item.completed) {
          await autoScheduleLineItem(item.id);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("mark-payment-received error:", error);
      res.status(500).json({ error: "Failed to mark payment received" });
    }
  });

  app.delete("/api/jobs/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteJob(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // Super-admin-only single job deletion (used by Deadline Alerts to clear stale jobs)
  app.delete("/api/admin/jobs/:id", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteJob(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // Job line item routes
  app.get("/api/job-line-items", isStaffAuthenticated, async (req, res) => {
    try {
      const lineItems = await storage.getAllJobLineItems();
      console.log(`GET /api/job-line-items: Returning ${lineItems.length} line items`, 
        lineItems.map(li => ({ id: li.id, jobId: li.jobId, qty: li.quantity, stitches: li.stitchCount }))
      );
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch line items" });
    }
  });

  app.get("/api/jobs/:jobId/line-items", isStaffAuthenticated, async (req, res) => {
    try {
      const { jobId } = req.params;
      const lineItems = await storage.getJobLineItems(jobId);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch line items" });
    }
  });

  app.post("/api/jobs/:jobId/line-items", isStaffAuthenticated, async (req, res) => {
    try {
      const { jobId } = req.params;
      const data = insertJobLineItemSchema.parse({ ...req.body, jobId });

      // Print jobs always run on the dedicated "Print" machine (operator Mollie)
      const isPrintItem = isPrintJobType(data.jobType);
      if (isPrintItem) {
        data.machineId = PRINT_MACHINE_ID;
      }

      // Default the operator from the machine's default operator when none was
      // chosen. For Print items the operator is always forced to the Print
      // machine's default operator (Mollie), overriding any incoming value.
      if (data.machineId && (isPrintItem || !data.operatorId)) {
        const machine = await storage.getMachine(data.machineId);
        if (machine?.defaultOperatorId) {
          data.operatorId = machine.defaultOperatorId;
        }
      }

      const lineItem = await storage.createJobLineItem(data);
      
      // Recalculate job's total actual production time
      await recalculateJobProductionTime(jobId);
      
      // Auto-schedule if machine is assigned
      if (lineItem.machineId) {
        const result = await autoScheduleLineItem(lineItem.id);
        if (!result.success) {
          console.log(`Auto-scheduling skipped for line item ${lineItem.id}: ${result.error}`);
        }
      }

      // Notify Chris when a Print line item is added
      if ((lineItem.jobType || "").toLowerCase() === "print") {
        (async () => {
          try {
            const job = await storage.getJob(jobId);
            if (!job) return;
            const customers = await storage.getCustomers();
            const customer = customers.find(c => c.id === job.customerId);
            await sendNewPrintJobEmail({
              customerName: customer?.name || "Unknown customer",
              jobName: job.jobName,
              jobId: job.id,
            });
          } catch (e) {
            console.error("Failed to send new print job email:", e);
          }
        })();
      }

      res.json(lineItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create line item" });
      }
    }
  });

  app.patch("/api/job-line-items/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const data = updateJobLineItemSchema.parse(req.body);
      
      // If marking as completed, enforce embroidery-specific requirements
      if (data.completed === true) {
        // Load existing line item to check job type
        const existingLineItem = await storage.getJobLineItem(req.params.id);
        if (!existingLineItem) {
          return res.status(404).json({ error: "Line item not found" });
        }
        
        // For embroidery jobs, require machine, staff, and actual production time
        if (existingLineItem.jobType === "Embroidery" || existingLineItem.jobType === "Embroidery Initials/Name") {
          const machineId = data.machineId !== undefined ? data.machineId : existingLineItem.machineId;
          const completedById = data.completedById !== undefined ? data.completedById : existingLineItem.completedById;
          const actualProductionTimeMinutes = data.actualProductionTimeMinutes !== undefined 
            ? data.actualProductionTimeMinutes 
            : existingLineItem.actualProductionTimeMinutes;
          
          const missingFields = [];
          if (!machineId) missingFields.push("Machine");
          if (!completedById) missingFields.push("Completed By (staff member)");
          if (actualProductionTimeMinutes === null || actualProductionTimeMinutes === undefined) {
            missingFields.push("Production Time (minutes)");
          }
          
          if (missingFields.length > 0) {
            return res.status(400).json({ 
              error: `To complete this embroidery job, please fill in: ${missingFields.join(", ")}. These fields are marked with red asterisks (*) in the line item section.`
            });
          }
        }
      }
      
      // Get existing line item to check if machine is newly assigned
      const existingBeforeUpdate = await storage.getJobLineItem(req.params.id);
      const previousMachineId = existingBeforeUpdate?.machineId;

      // Print jobs always run on the dedicated "Print" machine (operator Mollie).
      // Use the incoming job type when present, otherwise the saved one.
      const isPrintItem = isPrintJobType(data.jobType ?? existingBeforeUpdate?.jobType);
      if (isPrintItem) {
        data.machineId = PRINT_MACHINE_ID;
      }

      // Default the operator from the machine's default operator when a machine
      // is assigned/changed but no operator was provided (parity with create).
      // For Print items the operator is always forced to Mollie, overriding any
      // incoming value.
      if (data.machineId && (isPrintItem || !data.operatorId)) {
        const machine = await storage.getMachine(data.machineId);
        if (machine?.defaultOperatorId) {
          data.operatorId = machine.defaultOperatorId;
        }
      }

      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      const lineItem = await storage.updateJobLineItem(req.params.id, updates);
      
      // Recalculate job's total actual production time from all completed line items
      await recalculateJobProductionTime(lineItem.jobId);
      
      // Keep the schedule in sync with the line item's machine assignment.
      // Newly assigned  -> auto-book a slot.
      // Changed machine -> drop the stale schedule rows (which still point at the
      //                    OLD machine and would otherwise keep the job stuck on
      //                    the wrong machine in the Machine Schedule board) and
      //                    re-book onto the new machine.
      // Machine removed -> drop the schedule rows so it leaves the board.
      const machineChanged = lineItem.machineId !== previousMachineId;
      if (machineChanged && !lineItem.completed) {
        if (previousMachineId) {
          const staleSchedules = (await storage.getJobSchedules()).filter(
            s => s.lineItemId === lineItem.id,
          );
          for (const s of staleSchedules) {
            await storage.deleteJobSchedule(s.id);
          }
        }
        if (lineItem.machineId) {
          const result = await autoScheduleLineItem(lineItem.id);
          if (!result.success) {
            console.log(`Auto-scheduling skipped for line item ${lineItem.id}: ${result.error}`);
          }
        }
      }
      
      // Check if all line items in the job are now completed
      const allLineItems = await storage.getJobLineItems(lineItem.jobId);
      const allCompleted = allLineItems.length > 0 && allLineItems.every(item => item.completed);
      const anyIncomplete = allLineItems.some(item => !item.completed);
      
      const job = await storage.getJob(lineItem.jobId);
      // Only update if not part of a consolidated shipment (those are handled separately)
      if (job && job.shippingMethod !== "consolidated") {
        if (allCompleted && job.invoiceStatus === "pending") {
          // If all line items are completed and job is pending, mark as ready for invoicing
          // Don't overwrite jobs that have already been sent/paid
          await storage.updateJob(lineItem.jobId, {
            completed: true,
            invoiceStatus: "ready",
            conversationArchivedByStaff: true, // Auto-archive chat when job moves to invoicing
          } as any);

          // Push the job to the customer's Drive Calculations sheet so the
          // job name lands there verbatim. This eliminates the fuzzy
          // name-matching mismatches in the Drive Verification panel.
          // Fire-and-forget — failures (no folder, no sheet, network) must
          // never block the completion flow.
          (async () => {
            try {
              const customer = await storage.getCustomer(job.customerId);
              if (!customer) return;
              const totalQty = allLineItems.reduce((s, li) => s + (li.quantity || 0), 0);
              const biggest = allLineItems.reduce<typeof allLineItems[number] | null>(
                (b, li) => (!b || (li.quantity || 0) > (b.quantity || 0)) ? li : b, null
              );
              const today = new Date();
              const dd = String(today.getDate()).padStart(2, "0");
              const mm = String(today.getMonth() + 1).padStart(2, "0");
              const yyyy = today.getFullYear();
              const { appendJobRowToCustomerSheet } = await import("./googleService.js");
              const pushed = await appendJobRowToCustomerSheet(customer.name, {
                jobName: job.jobName,
                quantity: totalQty || undefined,
                stitches: biggest?.stitchCount || undefined,
                dateCompleted: `${dd}/${mm}/${yyyy}`,
              });
              if (pushed) {
                console.log(`[Drive] Appended job "${job.jobName}" to ${customer.name} Calculations sheet`);
              }
            } catch (err) {
              console.error("[Drive] Failed to push job to customer sheet:", err);
            }
          })();
        } else if (anyIncomplete && job.invoiceStatus === "ready") {
          // If any line item is incomplete and job is only at 'ready' status (not yet invoiced),
          // reset job completion status. Don't downgrade jobs that have been sent/paid.
          await storage.updateJob(lineItem.jobId, {
            completed: false,
            invoiceStatus: "pending"
          });
        }
      }
      
      res.json(lineItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update line item" 
        });
      }
    }
  });

  app.delete("/api/job-line-items/:id", isStaffAuthenticated, async (req, res) => {
    try {
      // Get the line item before deleting to know which job to recalculate
      const lineItem = await storage.getJobLineItem(req.params.id);
      if (!lineItem) {
        return res.status(404).json({ error: "Line item not found" });
      }
      
      await storage.deleteJobLineItem(req.params.id);
      
      // Recalculate job's total actual production time
      await recalculateJobProductionTime(lineItem.jobId);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete line item" });
    }
  });

  // Production entries (partial completion tracking)
  app.get("/api/production-entries", isStaffAuthenticated, async (req, res) => {
    try {
      const { lineItemId, staffId, startDate, endDate } = req.query;
      const entries = await storage.getProductionEntries(
        lineItemId as string | undefined,
        staffId as string | undefined,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch production entries" });
    }
  });

  app.get("/api/line-items/:lineItemId/production-entries", isStaffAuthenticated, async (req, res) => {
    try {
      const entries = await storage.getProductionEntriesByLineItem(req.params.lineItemId);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch production entries" });
    }
  });

  app.get("/api/line-items/:lineItemId/progress", isStaffAuthenticated, async (req, res) => {
    try {
      const progress = await storage.getLineItemProgress(req.params.lineItemId);
      res.json(progress);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch line item progress" });
    }
  });

  app.post("/api/production-entries", isStaffAuthenticated, async (req, res) => {
    try {
      const { insertProductionEntrySchema } = await import("@shared/schema");
      const data = insertProductionEntrySchema.parse(req.body);
      const entry = await storage.createProductionEntry(data);
      res.json(entry);
    } catch (error) {
      console.error("Error creating production entry:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create production entry" });
      }
    }
  });

  app.delete("/api/production-entries/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteProductionEntry(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete production entry" });
    }
  });

  // Job error tracking routes
  app.get("/api/jobs/:jobId/errors", isStaffAuthenticated, async (req, res) => {
    try {
      const errors = await storage.getJobErrors(req.params.jobId);
      res.json(errors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job errors" });
    }
  });

  app.get("/api/job-errors/unresolved", isStaffAuthenticated, async (req, res) => {
    try {
      const errors = await storage.getUnresolvedJobErrors();
      res.json(errors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unresolved job errors" });
    }
  });

  app.get("/api/job-errors/all", isStaffAuthenticated, async (req, res) => {
    try {
      const errors = await storage.getAllJobErrors();
      res.json(errors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch all job errors" });
    }
  });

  app.post("/api/jobs/:jobId/errors", isStaffAuthenticated, async (req: any, res) => {
    try {
      const data = insertJobErrorSchema.parse({
        ...req.body,
        jobId: req.params.jobId,
        reportedById: req.session.userId
      });
      const error = await storage.createJobError(data);
      res.json(error);
    } catch (error) {
      console.error("Error creating job error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create job error" });
      }
    }
  });

  app.patch("/api/job-errors/:id", isStaffAuthenticated, async (req: any, res) => {
    try {
      const data = updateJobErrorSchema.parse(req.body);
      
      // If resolving, set resolved by and resolved at
      const updates: any = { ...data };
      if (data.resolved === true) {
        updates.resolvedById = req.session.userId;
        updates.resolvedAt = new Date();
      }
      
      const error = await storage.updateJobError(req.params.id, updates);
      res.json(error);
    } catch (error) {
      console.error("Error updating job error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update job error" });
      }
    }
  });

  app.delete("/api/job-errors/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteJobError(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job error" });
    }
  });

  // Customer documents routes (staff management)
  app.get("/api/customer-documents", isStaffAuthenticated, async (req, res) => {
    try {
      const documents = await storage.getCustomerDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer documents" });
    }
  });

  app.post("/api/customer-documents", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { insertCustomerDocumentSchema } = await import("@shared/schema");
      const data = insertCustomerDocumentSchema.parse({
        ...req.body,
        createdById: req.session.userId
      });
      const document = await storage.createCustomerDocument(data);
      res.json(document);
    } catch (error) {
      console.error("Error creating customer document:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create customer document" });
      }
    }
  });

  app.patch("/api/customer-documents/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const { insertCustomerDocumentSchema } = await import("@shared/schema");
      const updateSchema = insertCustomerDocumentSchema.partial().omit({ createdById: true });
      const data = updateSchema.parse(req.body);
      const document = await storage.updateCustomerDocument(req.params.id, data);
      res.json(document);
    } catch (error) {
      console.error("Error updating customer document:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update customer document" });
      }
    }
  });

  app.delete("/api/customer-documents/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteCustomerDocument(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete customer document" });
    }
  });

  // Customer documents routes (customer portal - read only)
  app.get("/api/customer-portal/documents", isCustomerAuthenticated, async (req, res) => {
    try {
      const documents = await storage.getActiveCustomerDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // Staff shift routes
  app.get("/api/staff-shifts", isStaffAuthenticated, async (req, res) => {
    try {
      const { staffId, startDate, endDate } = req.query;
      const shifts = await storage.getStaffShifts(
        staffId as string | undefined,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(shifts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff shifts" });
    }
  });

  app.post("/api/staff-shifts", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertStaffShiftSchema.parse(req.body);
      const shift = await storage.createStaffShift(data);
      res.json(shift);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create staff shift" });
      }
    }
  });

  app.patch("/api/staff-shifts/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const data = updateStaffShiftSchema.parse(req.body);
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      const shift = await storage.updateStaffShift(req.params.id, updates);
      res.json(shift);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update staff shift" 
        });
      }
    }
  });

  app.delete("/api/staff-shifts/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteStaffShift(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete staff shift" 
      });
    }
  });

  // Machine schedule block routes
  app.get("/api/machine-schedule-blocks", isStaffAuthenticated, async (req, res) => {
    try {
      const { machineId, startDate, endDate } = req.query;
      const blocks = await storage.getMachineScheduleBlocks(
        machineId ? parseInt(machineId as string) : undefined,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(blocks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch machine schedule blocks" });
    }
  });

  app.post("/api/machine-schedule-blocks", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertMachineScheduleBlockSchema.parse(req.body);
      const block = await storage.createMachineScheduleBlock(data);
      res.json(block);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create machine schedule block" });
      }
    }
  });

  app.patch("/api/machine-schedule-blocks/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const data = updateMachineScheduleBlockSchema.parse(req.body);
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      const block = await storage.updateMachineScheduleBlock(req.params.id, updates);
      res.json(block);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update machine schedule block" 
        });
      }
    }
  });

  app.delete("/api/machine-schedule-blocks/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteMachineScheduleBlock(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete machine schedule block" 
      });
    }
  });

  // Job schedule routes
  app.get("/api/job-schedules", isStaffAuthenticated, async (req, res) => {
    try {
      const { jobId, machineId, staffId, date, startDate, endDate } = req.query;
      
      let effectiveStartDate: Date | undefined;
      let effectiveEndDate: Date | undefined;
      
      if (date) {
        const selectedDate = new Date(date as string);
        effectiveStartDate = new Date(selectedDate.setHours(0, 0, 0, 0));
        effectiveEndDate = new Date(selectedDate.setHours(23, 59, 59, 999));
      } else {
        effectiveStartDate = startDate ? new Date(startDate as string) : undefined;
        effectiveEndDate = endDate ? new Date(endDate as string) : undefined;
      }
      
      const schedules = await storage.getJobSchedules(
        jobId as string | undefined,
        machineId ? parseInt(machineId as string) : undefined,
        staffId as string | undefined,
        effectiveStartDate,
        effectiveEndDate
      );
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job schedules" });
    }
  });

  app.post("/api/job-schedules", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertJobScheduleSchema.parse(req.body);
      const schedule = await storage.createJobSchedule(data);
      res.json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create job schedule" });
      }
    }
  });

  app.patch("/api/job-schedules/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const data = updateJobScheduleSchema.parse(req.body);
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      const schedule = await storage.updateJobSchedule(req.params.id, updates);
      res.json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update job schedule" 
        });
      }
    }
  });

  app.delete("/api/job-schedules/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteJobSchedule(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete job schedule" 
      });
    }
  });

  // Get available time slots for scheduling a line item
  app.get("/api/scheduling/available-slots", isStaffAuthenticated, async (req, res) => {
    try {
      const { lineItemId, machineId, staffId, startDate, endDate } = req.query;

      if (!lineItemId || !machineId || !staffId) {
        return res.status(400).json({ 
          error: "Missing required parameters: lineItemId, machineId, staffId" 
        });
      }

      // Get the line item to calculate production time
      const lineItem = await storage.getJobLineItem(lineItemId as string);
      if (!lineItem) {
        return res.status(404).json({ error: "Line item not found" });
      }

      // Import scheduling utilities
      const { findAvailableSlots, calculateJobDuration, minutesToTime } = await import("@shared/scheduling");
      
      // Calculate production duration from line item data
      const duration = calculateJobDuration(
        lineItem.quantity, 
        lineItem.stitchCount, 
        parseInt(machineId as string)
      );
      
      if (duration === 0) {
        return res.status(400).json({ error: "Invalid line item parameters for scheduling" });
      }

      // Get all scheduling data
      const machineBlocks = await storage.getMachineScheduleBlocks(
        parseInt(machineId as string),
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      const staffShifts = await storage.getStaffShifts(
        staffId as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      const jobSchedules = await storage.getJobSchedules(
        undefined,
        parseInt(machineId as string),
        staffId as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      // Get ALL staff allocations for this staff member (not filtered by machine)
      // This is necessary to correctly determine if staff is allocated to a DIFFERENT machine
      const staffMachineAllocations = await storage.getStaffMachineAllocations(
        staffId as string,
        undefined, // Don't filter by machine - need all allocations to check restrictions
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      // Get staff holidays and bank holidays
      const staffHolidays = await storage.getStaffHolidays(
        staffId as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      const bankHolidays = await storage.getBankHolidays(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      // Get available slots for each date in the range
      const start = startDate ? new Date(startDate as string) : new Date();
      const end = endDate ? new Date(endDate as string) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days default
      
      const availableSlots = [];
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        const dateSlots = findAvailableSlots(
          currentDate,
          parseInt(machineId as string),
          staffId as string,
          machineBlocks,
          staffShifts,
          jobSchedules,
          staffMachineAllocations,
          staffHolidays,
          bankHolidays
        );

        // Filter slots that can fit the duration and format them
        for (const slot of dateSlots) {
          const slotDuration = slot.endTime - slot.startTime;
          if (slotDuration >= duration) {
            availableSlots.push({
              date: currentDate.toISOString().split('T')[0],
              startTime: slot.startTime,
              endTime: slot.startTime + duration,
              startTimeFormatted: minutesToTime(slot.startTime),
              endTimeFormatted: minutesToTime(slot.startTime + duration),
              durationMinutes: duration,
              availableMinutes: slotDuration
            });
          }
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      res.json({
        lineItemId,
        machineId: parseInt(machineId as string),
        staffId,
        durationMinutes: duration,
        availableSlots
      });
    } catch (error) {
      console.error("Error fetching available slots:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch available slots" 
      });
    }
  });

  // Auto-schedule all unscheduled jobs
  app.post("/api/scheduling/auto-schedule", isStaffAuthenticated, async (req, res) => {
    // Single-flight lock: prevents two overlapping runs (e.g. the Machine Schedule
    // board auto-filling while a staff member clicks "Auto-Schedule All") from
    // double-booking the same line item, since schedules are computed from a snapshot.
    if (autoScheduleInProgress) {
      return res.json({
        success: true,
        scheduledCount: 0,
        failedCount: 0,
        message: "Auto-scheduling already in progress",
        scheduled: [],
        failed: [],
      });
    }
    autoScheduleInProgress = true;
    try {
      const { findAvailableSlots, calculateJobDuration, minutesToTime } = await import("@shared/scheduling");
      
      // Get all jobs and line items
      const allJobs = await storage.getJobs();
      const allLineItems = await storage.getAllJobLineItems();
      const existingSchedules = await storage.getJobSchedules();
      const staff = await storage.getStaff();
      const customersForSchedule = await storage.getCustomers();
      const customerMapForSchedule = new Map(customersForSchedule.map(c => [c.id, c]));
      
      // Find line items that have machine assignments but no schedules
      const scheduledLineItemIds = new Set(existingSchedules.map(s => s.lineItemId).filter(Boolean));
      const unscheduledLineItems = allLineItems.filter(li => 
        li.machineId && // Has machine assigned
        !li.completed && // Not completed
        li.jobType?.toLowerCase() === 'embroidery' && // Only embroidery jobs need scheduling (case-insensitive)
        !scheduledLineItemIds.has(li.id) // Not already scheduled
      );
      
      if (unscheduledLineItems.length === 0) {
        return res.json({
          success: true,
          message: "All embroidery jobs with machine assignments are already scheduled",
          scheduledCount: 0,
          failedCount: 0
        });
      }
      
      // Get all scheduling data once
      const machineBlocks = await storage.getMachineScheduleBlocks();
      const staffShifts = await storage.getStaffShifts();
      const staffMachineAllocations = await storage.getStaffMachineAllocations();
      const staffHolidays = await storage.getStaffHolidays();
      const bankHolidays = await storage.getBankHolidays();
      const allMachines = await storage.getMachines();

      // Staff explicitly allocated to a machine on a given day (specific-date or
      // recurring day-of-week match). This is the machine+operator combination
      // the user configures via Staff Allocations, and it decides who runs each
      // job on that machine that day.
      const allocatedStaffOnDate = (machineId: number, date: Date): string[] => {
        const ids: string[] = [];
        const seen = new Set<string>();
        for (const a of staffMachineAllocations) {
          if (a.machineId !== machineId) continue;
          const ad = new Date(a.date);
          const matches =
            ad.toDateString() === date.toDateString() ||
            (a.isRecurring && a.recurringDaysOfWeek?.includes(date.getDay()));
          if (!matches || seen.has(a.staffId)) continue;
          seen.add(a.staffId);
          ids.push(a.staffId);
        }
        return ids;
      };
      
      // Sort line items by required dispatch date (earliest first)
      // Jobs without dispatch dates go last, overdue jobs go first (most urgent)
      const now = new Date();
      const sortedLineItems = [...unscheduledLineItems].sort((a, b) => {
        const jobA = allJobs.find(j => j.id === a.jobId);
        const jobB = allJobs.find(j => j.id === b.jobId);
        
        const dateA = jobA?.requiredDispatchDate ? new Date(jobA.requiredDispatchDate) : null;
        const dateB = jobB?.requiredDispatchDate ? new Date(jobB.requiredDispatchDate) : null;
        
        // Jobs with no date go last
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        
        // Sort by date - earliest first (including overdue which are most urgent)
        return dateA.getTime() - dateB.getTime();
      });
      
      const scheduledItems: any[] = [];
      const failedItems: any[] = [];
      let currentSchedules = [...existingSchedules];
      
      // Try to schedule each line item
      for (const lineItem of sortedLineItems) {
        const job = allJobs.find(j => j.id === lineItem.jobId);
        if (!job) continue;

        // Skip jobs that are no longer active production work
        if (job.completed || job.status === 'completed') continue;
        if (job.invoiceStatus === 'invoiced' || job.invoiceStatus === 'ready' || job.invoicedAt) continue;

        // Skip jobs awaiting advance payment — they aren't released to production yet
        const custForJob = job.customerId ? customerMapForSchedule.get(job.customerId) : null;
        if (custForJob?.requiresAdvancePayment && !job.paymentReceived) continue;

        // Only schedule jobs that have actually entered the Production Queue.
        // Mirrors the Dashboard "active jobs" gate: a job must be past customer
        // approval, have a required dispatch date, have goods received, and have
        // every line item's logo approved. Jobs still awaiting line items / dates /
        // approvals must not be auto-booked onto a machine.
        if (job.status === 'pending_customer_approval') continue;
        if (!job.requiredDispatchDate || !job.goodsReceived) continue;
        const jobLineItems = allLineItems.filter(li => li.jobId === job.id);
        const allLogosApproved = jobLineItems.length > 0 && jobLineItems.every(li => li.logoApproved);
        if (!allLogosApproved) continue;
        
        const duration = calculateJobDuration(lineItem.quantity, lineItem.stitchCount, lineItem.machineId!);
        if (duration === 0) {
          failedItems.push({ 
            lineItemId: lineItem.id, 
            jobName: job.jobName,
            reason: "Missing stitch count - cannot calculate production time" 
          });
          continue;
        }
        
        // Determine scheduling window
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        
        let endDate: Date;
        let isOverdue = false;
        
        if (job.requiredDispatchDate) {
          const dispatchDate = new Date(job.requiredDispatchDate);
          if (dispatchDate < startDate) {
            // Job is overdue - schedule ASAP, search up to 30 days ahead
            isOverdue = true;
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 30);
          } else {
            // Normal case - schedule before dispatch date
            endDate = new Date(dispatchDate);
          }
        } else {
          // No dispatch date - schedule within next 30 days
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 30);
        }
        
        let bestSlot: any = null;
        let bestStaffId: string | null = null;
        
        // Determine which staff to consider for this machine
        // If allocations exist, only use staff who have allocations for this machine
        // Otherwise, use all staff (legacy behavior for systems without allocations)
        const hasAllocationsInSystem = staffMachineAllocations.length > 0;
        
        let candidateStaff = staff;
        if (hasAllocationsInSystem) {
          // Get staff IDs who have allocations for this specific machine
          const staffWithMachineAllocations = new Set(
            staffMachineAllocations
              .filter(a => a.machineId === lineItem.machineId)
              .map(a => a.staffId)
          );
          candidateStaff = staff.filter(s => staffWithMachineAllocations.has(s.id));
          
          if (candidateStaff.length === 0) {
            failedItems.push({ 
              lineItemId: lineItem.id, 
              jobName: job.jobName,
              reason: `No staff allocated to machine ${lineItem.machineId}` 
            });
            continue;
          }
        }

        const machineForItem = allMachines.find(m => m.id === lineItem.machineId);
        const defaultOperator = machineForItem?.defaultOperatorId
          ? staff.find(s => s.id === machineForItem.defaultOperatorId)
          : undefined;

        // Walk forward day by day and take the earliest day where an eligible
        // operator has a free slot. The operator is whoever is allocated to this
        // machine that day (the machine+staff combination set up in Staff
        // Allocations), so a job's operator always matches who is actually on the
        // machine. When nobody is allocated that day we fall back to the machine's
        // default operator, then to any candidate staff (legacy behaviour for
        // set-ups without allocations).
        const cursor = new Date(startDate);
        while (cursor <= endDate && !bestSlot) {
          const allocatedIds = allocatedStaffOnDate(lineItem.machineId!, cursor);
          let dayStaff: typeof staff;
          if (allocatedIds.length > 0) {
            const allocated = candidateStaff.filter(s => allocatedIds.includes(s.id));
            // Prefer the default operator first, but only if they are allocated today.
            dayStaff = defaultOperator && allocatedIds.includes(defaultOperator.id)
              ? [defaultOperator, ...allocated.filter(s => s.id !== defaultOperator.id)]
              : allocated;
          } else if (defaultOperator) {
            dayStaff = [defaultOperator];
          } else {
            dayStaff = candidateStaff;
          }

          let daySlot: any = null;
          let daySlotStaffId: string | null = null;
          for (const staffMember of dayStaff) {
            const dateSlots = findAvailableSlots(
              cursor,
              lineItem.machineId!,
              staffMember.id,
              machineBlocks,
              staffShifts,
              currentSchedules,
              staffMachineAllocations,
              staffHolidays,
              bankHolidays
            );
            for (const s of dateSlots) {
              if (s.endTime - s.startTime >= duration) {
                // Earliest start time on this day wins; ties keep the first
                // (higher-priority) operator we already found.
                if (!daySlot || s.startTime < daySlot.startTime) {
                  daySlot = {
                    date: new Date(cursor),
                    startTime: s.startTime,
                    endTime: s.startTime + duration
                  };
                  daySlotStaffId = staffMember.id;
                }
                break;
              }
            }
          }

          if (daySlot) {
            bestSlot = daySlot;
            bestStaffId = daySlotStaffId;
          }
          cursor.setDate(cursor.getDate() + 1);
        }
        
        // Create schedule if we found a slot
        if (bestSlot && bestStaffId) {
          try {
            const newSchedule = await storage.createJobSchedule({
              jobId: job.id,
              lineItemId: lineItem.id,
              machineId: lineItem.machineId!,
              staffId: bestStaffId,
              scheduledDate: bestSlot.date,
              startTime: bestSlot.startTime,
              endTime: bestSlot.endTime,
              status: 'scheduled'
            });
            
            scheduledItems.push({
              lineItemId: lineItem.id,
              jobName: job.jobName,
              date: bestSlot.date.toISOString().split('T')[0],
              startTime: minutesToTime(bestSlot.startTime),
              endTime: minutesToTime(bestSlot.endTime)
            });
            
            // CRITICAL: Add to current schedules so next iteration sees it as occupied
            currentSchedules.push(newSchedule);
          } catch (error) {
            console.error(`Failed to create schedule for line item ${lineItem.id}:`, error);
            failedItems.push({ 
              lineItemId: lineItem.id, 
              jobName: job.jobName,
              reason: error instanceof Error ? error.message : "Failed to create schedule" 
            });
          }
        } else {
          let reason = "No available time slot found";
          if (isOverdue) {
            reason += " (job is overdue - scheduled ASAP)";
          } else if (!job.requiredDispatchDate) {
            reason += " within 30 days";
          } else {
            reason += " before dispatch date";
          }
          failedItems.push({ 
            lineItemId: lineItem.id, 
            jobName: job.jobName,
            reason 
          });
        }
      }

      res.json({
        success: true,
        scheduledCount: scheduledItems.length,
        failedCount: failedItems.length,
        scheduled: scheduledItems,
        failed: failedItems
      });
    } catch (error) {
      console.error("Auto-scheduling error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to auto-schedule jobs" 
      });
    } finally {
      autoScheduleInProgress = false;
    }
  });

  // Machine Sheet — per-machine list of scheduled jobs + operator for the next N days
  // Used by the printable "pill view" handouts on the main screen.
  app.get("/api/scheduling/machine-sheet", isStaffAuthenticated, async (req, res) => {
    try {
      // `days=all` shows every scheduled job from today onward (no upper bound);
      // otherwise show a bounded window of 1-30 calendar days (default 5).
      const showAll = (req.query.days as string) === "all";
      const days = showAll ? null : Math.min(Math.max(parseInt(req.query.days as string) || 5, 1), 30);

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      // Inclusive window: today plus the following (days - 1) dates = exactly `days` calendar days.
      // When showing all, leave endDate undefined so every future schedule is returned.
      let endDate: Date | undefined;
      if (!showAll && days) {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + (days - 1));
        endDate.setHours(23, 59, 59, 999);
      }

      const [allMachines, allStaff, schedules, allLineItems, allJobs, customers, allocations] = await Promise.all([
        storage.getMachines(),
        storage.getStaff(),
        storage.getJobSchedules(undefined, undefined, undefined, startDate, endDate),
        storage.getAllJobLineItems(),
        storage.getJobs(),
        storage.getCustomers(),
        storage.getStaffMachineAllocations(),
      ]);

      const staffById = new Map(allStaff.map(s => [s.id, s]));
      const lineItemById = new Map(allLineItems.map(li => [li.id, li]));
      const jobById = new Map(allJobs.map(j => [j.id, j]));
      const customerById = new Map(customers.map(c => [c.id, c]));

      // Build the list of calendar days in the window (local time, matching the
      // yyyy-MM-dd keys the frontend derives from each job's date).
      const ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      // When showing all, the window runs from today to the last day that has a
      // scheduled job (min 1 day); otherwise it's the fixed `days` window.
      let numDays = days ?? 1;
      if (showAll) {
        let maxTime = startDate.getTime();
        for (const s of schedules) {
          const t = new Date(s.scheduledDate).setHours(0, 0, 0, 0);
          if (t > maxTime) maxTime = t;
        }
        numDays = Math.max(1, Math.round((maxTime - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      }
      const windowDays: { key: string; date: Date }[] = [];
      for (let i = 0; i < numDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        windowDays.push({ key: ymd(d), date: d });
      }

      // Who is allocated to a given machine on a given date — uses the same
      // matching rules as the scheduler (specific-date match OR recurring
      // day-of-week match). Returns de-duplicated operator names.
      const operatorsForMachineOnDate = (machineId: number, date: Date): string[] => {
        const seen = new Set<string>();
        const names: string[] = [];
        for (const a of allocations) {
          if (a.machineId !== machineId) continue;
          const ad = new Date(a.date);
          const matches =
            ad.toDateString() === date.toDateString() ||
            (a.isRecurring && a.recurringDaysOfWeek?.includes(date.getDay()));
          if (!matches) continue;
          if (seen.has(a.staffId)) continue;
          seen.add(a.staffId);
          names.push(staffById.get(a.staffId)?.name ?? "Unknown");
        }
        return names;
      };

      const machinesOut = allMachines
        .filter(m => m.isActive)
        .map(machine => {
          const operator = machine.defaultOperatorId ? staffById.get(machine.defaultOperatorId) : undefined;

          // Per-day operators from the Staff Allocations table; falls back to the
          // machine's default operator on days with no specific allocation.
          const operatorsByDate: Record<string, string[]> = {};
          for (const { key, date } of windowDays) {
            const allocated = operatorsForMachineOnDate(machine.id, date);
            if (allocated.length > 0) {
              operatorsByDate[key] = allocated;
            } else if (operator) {
              operatorsByDate[key] = [operator.name];
            }
          }

          const jobsForMachine = schedules
            .filter(s => s.machineId === machine.id)
            .map(s => {
              const lineItem = s.lineItemId ? lineItemById.get(s.lineItemId) : undefined;
              const job = jobById.get(s.jobId);
              const customer = job ? customerById.get(job.customerId) : undefined;
              const sched = staffById.get(s.staffId);
              return {
                scheduleId: s.id,
                date: s.scheduledDate,
                dateKey: ymd(new Date(s.scheduledDate)),
                startTime: s.startTime,
                endTime: s.endTime,
                operatorId: s.staffId,
                operatorName: sched?.name ?? "Unassigned",
                jobId: s.jobId,
                jobNumber: job?.jobNumber ?? null,
                jobName: job?.jobName ?? "",
                customerName: customer?.name ?? "",
                requiredDispatchDate: job?.requiredDispatchDate ?? null,
                description: lineItem?.description ?? null,
                position: lineItem?.position ?? null,
                quantity: lineItem?.quantity ?? null,
                stitchCount: lineItem?.stitchCount ?? null,
              };
            })
            .sort((a, b) => {
              const da = new Date(a.date).getTime();
              const db = new Date(b.date).getTime();
              if (da !== db) return da - db;
              return a.startTime - b.startTime;
            });

          return {
            machineId: machine.id,
            machineName: machine.name,
            defaultOperatorId: machine.defaultOperatorId ?? null,
            defaultOperatorName: operator?.name ?? null,
            operatorsByDate,
            jobs: jobsForMachine,
          };
        });

      const lastDay = windowDays[windowDays.length - 1]?.date ?? startDate;
      res.json({
        days: numDays,
        showAll,
        startDate: startDate.toISOString(),
        endDate: (endDate ?? lastDay).toISOString(),
        dateKeys: windowDays.map(d => d.key),
        machines: machinesOut,
      });
    } catch (error) {
      console.error("Machine sheet error:", error);
      res.status(500).json({ error: "Failed to build machine sheet" });
    }
  });

  // Staff sheet — the Machine Schedule board pivoted by staff member instead of
  // machine. Each staff member lists every job scheduled to them (across all
  // machines), grouped by day, with the machine each job runs on. This is the
  // exact "flip" of /machine-sheet: machine <-> staff swap roles everywhere.
  app.get("/api/scheduling/staff-sheet", isStaffAuthenticated, async (req, res) => {
    try {
      const showAll = (req.query.days as string) === "all";
      const days = showAll ? null : Math.min(Math.max(parseInt(req.query.days as string) || 5, 1), 30);

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      let endDate: Date | undefined;
      if (!showAll && days) {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + (days - 1));
        endDate.setHours(23, 59, 59, 999);
      }

      const [allMachines, allStaff, schedules, allLineItems, allJobs, customers, allocations] = await Promise.all([
        storage.getMachines(),
        storage.getStaff(),
        storage.getJobSchedules(undefined, undefined, undefined, startDate, endDate),
        storage.getAllJobLineItems(),
        storage.getJobs(),
        storage.getCustomers(),
        storage.getStaffMachineAllocations(),
      ]);

      const machineById = new Map(allMachines.map(m => [m.id, m]));
      const staffById = new Map(allStaff.map(s => [s.id, s]));
      const lineItemById = new Map(allLineItems.map(li => [li.id, li]));
      const jobById = new Map(allJobs.map(j => [j.id, j]));
      const customerById = new Map(customers.map(c => [c.id, c]));

      const ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      let numDays = days ?? 1;
      if (showAll) {
        let maxTime = startDate.getTime();
        for (const s of schedules) {
          const t = new Date(s.scheduledDate).setHours(0, 0, 0, 0);
          if (t > maxTime) maxTime = t;
        }
        numDays = Math.max(1, Math.round((maxTime - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      }
      const windowDays: { key: string; date: Date }[] = [];
      for (let i = 0; i < numDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        windowDays.push({ key: ymd(d), date: d });
      }

      // Which machines a staff member is allocated to on a given date (inverse of
      // the machine-sheet's operatorsForMachineOnDate — same matching rules).
      const machinesForStaffOnDate = (staffId: string, date: Date): string[] => {
        const seen = new Set<number>();
        const names: string[] = [];
        for (const a of allocations) {
          if (a.staffId !== staffId) continue;
          const ad = new Date(a.date);
          const matches =
            ad.toDateString() === date.toDateString() ||
            (a.isRecurring && a.recurringDaysOfWeek?.includes(date.getDay()));
          if (!matches || seen.has(a.machineId)) continue;
          seen.add(a.machineId);
          names.push(machineById.get(a.machineId)?.name ?? "Unknown");
        }
        return names;
      };

      // Only show staff who are relevant to production in this window: anyone with
      // a scheduled job or a machine allocation. Avoids cluttering with office
      // staff who never run a machine.
      const relevantStaffIds = new Set<string>();
      for (const s of schedules) {
        if (s.staffId) relevantStaffIds.add(s.staffId);
      }
      for (const { date } of windowDays) {
        for (const a of allocations) {
          const ad = new Date(a.date);
          const matches =
            ad.toDateString() === date.toDateString() ||
            (a.isRecurring && a.recurringDaysOfWeek?.includes(date.getDay()));
          if (matches) relevantStaffIds.add(a.staffId);
        }
      }

      const staffOut = allStaff
        .filter(s => relevantStaffIds.has(s.id))
        .map(member => {
          const machinesByDate: Record<string, string[]> = {};
          for (const { key, date } of windowDays) {
            const allocated = machinesForStaffOnDate(member.id, date);
            if (allocated.length > 0) machinesByDate[key] = allocated;
          }

          const jobsForStaff = schedules
            .filter(s => s.staffId === member.id)
            .map(s => {
              const lineItem = s.lineItemId ? lineItemById.get(s.lineItemId) : undefined;
              const job = jobById.get(s.jobId);
              const customer = job ? customerById.get(job.customerId) : undefined;
              const machine = machineById.get(s.machineId);
              return {
                scheduleId: s.id,
                date: s.scheduledDate,
                dateKey: ymd(new Date(s.scheduledDate)),
                startTime: s.startTime,
                endTime: s.endTime,
                machineId: s.machineId,
                machineName: machine?.name ?? "Unknown machine",
                jobId: s.jobId,
                jobNumber: job?.jobNumber ?? null,
                jobName: job?.jobName ?? "",
                customerName: customer?.name ?? "",
                requiredDispatchDate: job?.requiredDispatchDate ?? null,
                description: lineItem?.description ?? null,
                position: lineItem?.position ?? null,
                quantity: lineItem?.quantity ?? null,
                stitchCount: lineItem?.stitchCount ?? null,
              };
            })
            .sort((a, b) => {
              const da = new Date(a.date).getTime();
              const db = new Date(b.date).getTime();
              if (da !== db) return da - db;
              return a.startTime - b.startTime;
            });

          return {
            staffId: member.id,
            staffName: member.name,
            machinesByDate,
            jobs: jobsForStaff,
          };
        })
        // Show busiest staff first, but keep allocated-but-idle staff visible too.
        .sort((a, b) => b.jobs.length - a.jobs.length || a.staffName.localeCompare(b.staffName));

      const lastDay = windowDays[windowDays.length - 1]?.date ?? startDate;
      res.json({
        days: numDays,
        showAll,
        startDate: startDate.toISOString(),
        endDate: (endDate ?? lastDay).toISOString(),
        dateKeys: windowDays.map(d => d.key),
        staff: staffOut,
      });
    } catch (error) {
      console.error("Staff sheet error:", error);
      res.status(500).json({ error: "Failed to build staff sheet" });
    }
  });

  // Schedule Health — categorise every active embroidery line item by deadline risk
  app.get("/api/scheduling/health", isStaffAuthenticated, async (req, res) => {
    try {
      const allJobs = await storage.getJobs();
      const allLineItems = await storage.getAllJobLineItems();
      const existingSchedules = await storage.getJobSchedules();
      const customers = await storage.getCustomers();
      const allMachines = await storage.getMachines();

      const jobMap = new Map(allJobs.map(j => [j.id, j]));
      const customerMap = new Map(customers.map(c => [c.id, c]));
      const machineMap = new Map(allMachines.map(m => [m.id, m]));

      // lineItemId -> most recent non-cancelled schedule
      const scheduleByLineItem = new Map<string, typeof existingSchedules[0]>();
      for (const s of existingSchedules) {
        if (s.lineItemId && s.status !== 'cancelled') {
          scheduleByLineItem.set(s.lineItemId, s);
        }
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const items: any[] = [];

      for (const lineItem of allLineItems) {
        if (lineItem.completed) continue;
        const jobTypeLc = (lineItem.jobType || '').toLowerCase();
        if (!jobTypeLc.includes('embroidery')) continue;

        const job = jobMap.get(lineItem.jobId);
        if (!job || job.completed || job.status === 'completed') continue;

        const customer = job.customerId ? customerMap.get(job.customerId) : null;

        // Skip jobs that have already been invoiced (or are queued ready to
        // invoice) — production is finished, so they're not deadline risks.
        if (job.invoiceStatus === 'invoiced' || job.invoiceStatus === 'ready' || job.invoicedAt) continue;

        // Skip jobs awaiting advance payment — the customer must pay before the
        // job is released to production, so it shouldn't appear as a risk yet.
        if (customer?.requiresAdvancePayment && !job.paymentReceived) continue;

        const dispatchDate = job.requiredDispatchDate ? new Date(job.requiredDispatchDate) : null;
        if (dispatchDate) dispatchDate.setHours(0, 0, 0, 0);

        let daysUntilDispatch: number | null = null;
        if (dispatchDate) {
          daysUntilDispatch = Math.floor((dispatchDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }

        const liMachine = lineItem.machineId ? machineMap.get(lineItem.machineId) : null;
        const liHeads = liMachine?.heads ?? 6;
        const liSpm = liMachine?.stitchesPerMinute ?? 750;
        const liChangeover = liMachine?.changeoverTimeMinutes ?? 3;
        const liMultiplier = (liMachine as any)?.schedulingMultiplier ?? 1;
        const estimatedMinutes = (lineItem.stitchCount && lineItem.quantity)
          ? Math.ceil((Math.ceil(lineItem.quantity / liHeads) * ((lineItem.stitchCount / liSpm) + liChangeover) * liMultiplier) / 10) * 10
          : null;

        const schedule = lineItem.machineId ? scheduleByLineItem.get(lineItem.id) : undefined;

        let status: string;
        let daysLate: number | null = null;
        let scheduledDateStr: string | null = null;

        if (schedule) {
          const scheduledDate = new Date(schedule.scheduledDate);
          scheduledDate.setHours(0, 0, 0, 0);
          scheduledDateStr = scheduledDate.toISOString().split('T')[0];

          if (dispatchDate) {
            const daysAfter = Math.floor((scheduledDate.getTime() - dispatchDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysAfter > 0) {
              status = 'will_miss';
              daysLate = daysAfter;
            } else if (daysAfter >= -1) {
              status = 'at_risk';
            } else {
              status = 'on_track';
            }
          } else {
            status = 'on_track';
          }
        } else {
          if (!lineItem.machineId) {
            // No machine assigned — extra urgency signal
            if (dispatchDate && daysUntilDispatch !== null && daysUntilDispatch <= 3) {
              status = 'unscheduled_urgent';
            } else if (dispatchDate && daysUntilDispatch !== null && daysUntilDispatch <= 7) {
              status = 'at_risk';
            } else {
              status = 'unscheduled';
            }
          } else {
            // Machine assigned but not yet scheduled
            if (dispatchDate && daysUntilDispatch !== null && daysUntilDispatch <= 3) {
              status = 'unscheduled_urgent';
            } else if (dispatchDate && daysUntilDispatch !== null && daysUntilDispatch <= 7) {
              status = 'at_risk';
            } else {
              status = 'unscheduled';
            }
          }
        }

        items.push({
          lineItemId: lineItem.id,
          jobId: job.id,
          jobName: job.jobName,
          customerName: customer?.name || 'Unknown',
          position: lineItem.position,
          quantity: lineItem.quantity,
          stitchCount: lineItem.stitchCount,
          estimatedMinutes,
          machineId: lineItem.machineId,
          dispatchDate: dispatchDate ? dispatchDate.toISOString().split('T')[0] : null,
          scheduledDate: scheduledDateStr,
          status,
          daysUntilDispatch,
          daysLate,
        });
      }

      const statusOrder: Record<string, number> = {
        will_miss: 0,
        unscheduled_urgent: 1,
        at_risk: 2,
        on_track: 3,
        unscheduled: 4,
      };

      items.sort((a, b) => {
        const orderDiff = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
        if (orderDiff !== 0) return orderDiff;
        if (a.daysUntilDispatch !== null && b.daysUntilDispatch !== null) {
          return a.daysUntilDispatch - b.daysUntilDispatch;
        }
        return 0;
      });

      const summary = {
        willMiss: items.filter(i => i.status === 'will_miss').length,
        unscheduledUrgent: items.filter(i => i.status === 'unscheduled_urgent').length,
        atRisk: items.filter(i => i.status === 'at_risk').length,
        onTrack: items.filter(i => i.status === 'on_track').length,
        unscheduled: items.filter(i => i.status === 'unscheduled').length,
      };

      res.json({ summary, items });
    } catch (error) {
      console.error("Schedule health error:", error);
      res.status(500).json({ error: "Failed to calculate schedule health" });
    }
  });

  // Production Accuracy — compare estimated vs actual times for completed embroidery jobs
  app.get("/api/scheduling/accuracy", isStaffAuthenticated, async (req, res) => {
    try {
      const allLineItems = await storage.getAllJobLineItems();
      const allJobs = await storage.getJobs();
      const machines = await storage.getMachines();

      const jobMap = new Map(allJobs.map(j => [j.id, j]));
      const machineMap = new Map(machines.map(m => [m.id, m]));

      const fromDateParam = req.query.fromDate as string | undefined;
      const toDateParam = req.query.toDate as string | undefined;
      const fromDate = fromDateParam ? new Date(fromDateParam) : null;
      const toDate = toDateParam ? new Date(toDateParam) : null;

      const completedItems = allLineItems.filter(li => {
        if (!li.completed) return false;
        if (li.actualProductionTimeMinutes === null || li.actualProductionTimeMinutes === undefined) return false;
        if (li.stitchCount <= 0 || li.quantity <= 0 || li.machineId === null) return false;
        if (fromDate && li.completedAt && new Date(li.completedAt) < fromDate) return false;
        if (toDate && li.completedAt && new Date(li.completedAt) > toDate) return false;
        return true;
      });

      const items = completedItems.map(li => {
        const job = jobMap.get(li.jobId);
        const machine = li.machineId ? machineMap.get(li.machineId) : null;

        const heads = (machine as any)?.heads || 6;
        const spm = (machine as any)?.stitchesPerMinute || 750;
        const changeover = (machine as any)?.changeoverTimeMinutes || 3;
        const multiplier = (machine as any)?.schedulingMultiplier ?? 1;

        const runs = Math.ceil(li.quantity / heads);
        const estimatedMinutes = Math.ceil((runs * ((li.stitchCount / spm) + changeover) * multiplier) / 10) * 10;
        const actualMinutes = li.actualProductionTimeMinutes!;
        const variance = actualMinutes - estimatedMinutes;
        const ratio = estimatedMinutes > 0 ? actualMinutes / estimatedMinutes : null;

        return {
          lineItemId: li.id,
          jobName: job?.jobName || 'Unknown',
          machineId: li.machineId,
          machineName: machine ? (machine as any).name : `Machine ${li.machineId}`,
          quantity: li.quantity,
          stitchCount: li.stitchCount,
          estimatedMinutes,
          actualMinutes,
          variance,
          ratio,
          completedAt: li.completedAt,
        };
      }).sort((a, b) => {
        if (a.completedAt && b.completedAt) {
          return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
        }
        return 0;
      });

      // Per-machine aggregates
      const byMachineAcc: Record<number, { count: number; totalRatio: number; totalVariance: number; name: string }> = {};
      for (const item of items) {
        if (!item.machineId || item.ratio === null) continue;
        if (!byMachineAcc[item.machineId]) {
          byMachineAcc[item.machineId] = { count: 0, totalRatio: 0, totalVariance: 0, name: item.machineName };
        }
        byMachineAcc[item.machineId].count++;
        byMachineAcc[item.machineId].totalRatio += item.ratio;
        byMachineAcc[item.machineId].totalVariance += item.variance;
      }

      const machineStats = Object.entries(byMachineAcc).map(([mid, s]) => ({
        machineId: parseInt(mid),
        name: s.name,
        count: s.count,
        avgRatio: s.totalRatio / s.count,
        avgVarianceMinutes: Math.round(s.totalVariance / s.count),
      })).sort((a, b) => b.count - a.count);

      const validItems = items.filter(i => i.ratio !== null);
      const overallRatioSum = validItems.reduce((sum, i) => sum + (i.ratio || 0), 0);
      const overallCount = validItems.length;

      res.json({
        overall: {
          count: overallCount,
          avgRatio: overallCount > 0 ? overallRatioSum / overallCount : null,
          avgAccuracyPercent: overallCount > 0 ? Math.round((overallRatioSum / overallCount) * 100) : null,
        },
        byMachine: machineStats,
        items: items.slice(0, 50),
      });
    } catch (error) {
      console.error("Schedule accuracy error:", error);
      res.status(500).json({ error: "Failed to calculate schedule accuracy" });
    }
  });

  // Calibration — current per-machine multipliers + recent history
  app.get("/api/scheduling/calibration", isStaffAuthenticated, async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { machines, machineCalibrationHistory } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      const allMachines = await db.select().from(machines);
      const history = await db.select().from(machineCalibrationHistory).orderBy(desc(machineCalibrationHistory.runAt)).limit(50);
      res.json({
        machines: allMachines.map(m => ({
          id: m.id,
          name: m.name,
          isActive: m.isActive,
          schedulingMultiplier: m.schedulingMultiplier ?? 1,
          calibrationStartedAt: m.calibrationStartedAt,
          lastRecalibratedAt: m.lastRecalibratedAt,
        })),
        history,
      });
    } catch (error) {
      console.error("Calibration fetch error:", error);
      res.status(500).json({ error: "Failed to fetch calibration" });
    }
  });

  // Calibration — manually trigger a recalibration now
  app.post("/api/scheduling/recalibrate", isStaffAuthenticated, async (_req, res) => {
    try {
      const { recalibrateMachines } = await import("./calibration");
      const results = await recalibrateMachines("manual");
      res.json({ success: true, results });
    } catch (error) {
      console.error("Manual recalibration error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to recalibrate" });
    }
  });

  // Schedule suggestion route
  app.post("/api/suggest-schedule", isStaffAuthenticated, async (req, res) => {
    try {
      const { machineId, quantity, stitchCount, requiredDispatchDate } = req.body;
      
      if (!machineId || !quantity || !stitchCount || !requiredDispatchDate) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Import scheduling utilities
      const { findEarliestSlot, calculateJobDuration } = await import("@shared/scheduling");
      
      // Calculate job duration
      const duration = calculateJobDuration(quantity, stitchCount, machineId);
      
      if (duration === 0) {
        return res.status(400).json({ error: "Invalid job parameters" });
      }
      
      // Get all scheduling data
      const staffMembers = await storage.getStaff();
      const shifts = await storage.getStaffShifts();
      const blocks = await storage.getMachineScheduleBlocks();
      const schedules = await storage.getJobSchedules();
      
      // Search from today until the dispatch date
      const startDate = new Date();
      const endDate = new Date(requiredDispatchDate);
      
      // Try to find earliest slot across all staff members
      let earliestSuggestion = null;
      
      for (const staffMember of staffMembers) {
        const suggestion = findEarliestSlot(
          startDate,
          endDate,
          machineId,
          staffMember.id,
          duration,
          blocks,
          shifts,
          schedules
        );
        
        if (suggestion) {
          if (!earliestSuggestion || 
              suggestion.date < earliestSuggestion.date ||
              (suggestion.date.getTime() === earliestSuggestion.date.getTime() && 
               suggestion.startTime < earliestSuggestion.startTime)) {
            earliestSuggestion = suggestion;
          }
        }
      }
      
      if (!earliestSuggestion) {
        return res.json({ 
          available: false, 
          message: "No available time slot found before dispatch date" 
        });
      }
      
      // Get staff member name
      const staffMember = staffMembers.find(s => s.id === earliestSuggestion.staffId);
      
      res.json({
        available: true,
        suggestion: {
          date: earliestSuggestion.date,
          startTime: earliestSuggestion.startTime,
          endTime: earliestSuggestion.endTime,
          machineId: earliestSuggestion.machineId,
          staffId: earliestSuggestion.staffId,
          staffName: staffMember?.name || "Unknown",
          duration
        }
      });
    } catch (error) {
      console.error("Error suggesting schedule:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to suggest schedule" 
      });
    }
  });

  // Machine suggestions endpoint - suggests best machines based on availability
  app.get("/api/scheduling/machine-suggestions", isStaffAuthenticated, async (req, res) => {
    try {
      const { lineItemId, quantity, stitchCount, dispatchDate, jobType } = req.query;
      
      // Can work with either a lineItemId or direct parameters
      let jobQuantity: number;
      let jobStitchCount: number;
      let targetDate: Date;
      let lineItemJobType: string;
      
      if (lineItemId) {
        const lineItem = await storage.getJobLineItem(lineItemId as string);
        if (!lineItem) {
          return res.status(404).json({ error: "Line item not found" });
        }
        const job = await storage.getJob(lineItem.jobId);
        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }
        
        jobQuantity = lineItem.quantity;
        jobStitchCount = lineItem.stitchCount || 0;
        targetDate = job.requiredDispatchDate ? new Date(job.requiredDispatchDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        lineItemJobType = lineItem.jobType || 'Embroidery';
      } else {
        if (!quantity || !stitchCount) {
          return res.status(400).json({ error: "Must provide lineItemId or quantity and stitchCount" });
        }
        jobQuantity = parseInt(quantity as string);
        jobStitchCount = parseInt(stitchCount as string);
        targetDate = dispatchDate ? new Date(dispatchDate as string) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        lineItemJobType = (jobType as string) || 'Embroidery';
      }
      
      // Only embroidery jobs need machine scheduling
      if (!lineItemJobType.toLowerCase().includes('embroidery')) {
        return res.json({
          suggestions: [],
          message: "Only embroidery jobs require machine scheduling"
        });
      }
      
      if (!jobStitchCount || jobStitchCount <= 0) {
        return res.status(400).json({ error: "Stitch count is required for scheduling" });
      }
      
      const { findAvailableSlots, minutesToTime } = await import("@shared/scheduling");
      
      // Get all scheduling data
      const staffMembers = await storage.getStaff();
      const staffShifts = await storage.getStaffShifts();
      const machineBlocks = await storage.getMachineScheduleBlocks();
      const jobSchedules = await storage.getJobSchedules();
      const staffMachineAllocations = await storage.getStaffMachineAllocations();
      const staffHolidays = await storage.getStaffHolidays();
      const bankHolidays = await storage.getBankHolidays();
      
      // Use LIVE DB machines — filters out offline machines automatically
      const allMachines = await storage.getMachines();
      const activeMachines = allMachines.filter(m => m.isActive);
      
      // Calculate production duration using the machine's actual DB specs
      const calcDurationFromSpecs = (qty: number, stitches: number, heads: number, spm: number, changeover: number): number => {
        if (!stitches || !qty) return 0;
        const runs = Math.ceil(qty / heads);
        const timePerRun = (stitches / spm) + changeover;
        const total = runs * timePerRun;
        return Math.ceil(total / 10) * 10;
      };
      
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = targetDate > startDate ? targetDate : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const suggestions: any[] = [];
      
      for (const machine of activeMachines) {
        const machineId = machine.id;
        const heads = machine.heads;
        const spm = machine.stitchesPerMinute;
        const changeover = machine.changeoverTimeMinutes;
        const multiplier = (machine as any).schedulingMultiplier ?? 1;
        const runs = Math.ceil(jobQuantity / heads);
        const rawUnroundedMinutes = (jobStitchCount && jobQuantity)
          ? runs * ((jobStitchCount / spm) + changeover)
          : 0;
        const duration = Math.ceil((rawUnroundedMinutes * multiplier) / 10) * 10;
        
        if (duration === 0) continue;
        
        // Find candidate staff for this machine
        const hasAllocationsInSystem = staffMachineAllocations.length > 0;
        let candidateStaff = staffMembers;
        
        if (hasAllocationsInSystem) {
          const staffWithMachineAllocations = new Set(
            staffMachineAllocations
              .filter(a => a.machineId === machineId)
              .map(a => a.staffId)
          );
          candidateStaff = staffMembers.filter(s => staffWithMachineAllocations.has(s.id));
        }
        
        let bestSlot: any = null;
        let bestStaffId: string | null = null;
        let bestStaffName: string | null = null;
        
        // Find earliest available slot across all candidate staff
        for (const staffMember of candidateStaff) {
          const currentDate = new Date(startDate);
          
          while (currentDate <= endDate) {
            const dateSlots = findAvailableSlots(
              currentDate,
              machineId,
              staffMember.id,
              machineBlocks,
              staffShifts,
              jobSchedules,
              staffMachineAllocations,
              staffHolidays,
              bankHolidays
            );
            
            for (const slot of dateSlots) {
              const slotDuration = slot.endTime - slot.startTime;
              if (slotDuration >= duration) {
                const proposedSlot = {
                  date: new Date(currentDate),
                  startTime: slot.startTime,
                  endTime: slot.startTime + duration,
                  availableMinutes: slotDuration
                };
                
                if (!bestSlot || proposedSlot.date < bestSlot.date ||
                    (proposedSlot.date.getTime() === bestSlot.date.getTime() && proposedSlot.startTime < bestSlot.startTime)) {
                  bestSlot = proposedSlot;
                  bestStaffId = staffMember.id;
                  bestStaffName = staffMember.name;
                }
                break;
              }
            }
            
            if (bestSlot) break;
            currentDate.setDate(currentDate.getDate() + 1);
          }
          
          if (bestSlot && bestSlot.date.toDateString() === startDate.toDateString()) break;
        }
        
        if (bestSlot) {
          const canMeetDeadline = bestSlot.date <= targetDate;
          const daysUntilAvailable = Math.ceil((bestSlot.date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
          
          suggestions.push({
            machineId,
            machineName: machine.name,
            heads: machine.heads,
            estimatedDuration: duration,
            estimatedRuns: runs,
            earliestDate: bestSlot.date.toISOString().split('T')[0],
            startTime: bestSlot.startTime,
            endTime: bestSlot.endTime,
            startTimeFormatted: minutesToTime(bestSlot.startTime),
            endTimeFormatted: minutesToTime(bestSlot.endTime),
            staffId: bestStaffId,
            staffName: bestStaffName,
            canMeetDeadline,
            daysUntilAvailable,
            score: canMeetDeadline ? (100 - daysUntilAvailable) : (0 - daysUntilAvailable)
          });
        }
      }
      
      // Sort by score (best options first)
      suggestions.sort((a, b) => b.score - a.score);
      
      res.json({
        targetDate: targetDate.toISOString().split('T')[0],
        quantity: jobQuantity,
        stitchCount: jobStitchCount,
        suggestions
      });
    } catch (error) {
      console.error("Error getting machine suggestions:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get machine suggestions" 
      });
    }
  });

  // Earliest realistic dispatch date for a given quantity (+ optional stitch count).
  // Used by the customer submission form and the internal job form to warn when
  // a chosen due date is earlier than what current capacity can support.
  // Public-ish: any authenticated user (staff OR customer) can hit this — it
  // returns only a date, no scheduling internals.
  app.get("/api/scheduling/earliest-dispatch", async (req: any, res) => {
    try {
      const isStaff = !!(req.session as any)?.userId;
      const isCustomer = !!(req.session as any)?.customerUserId;
      if (!isStaff && !isCustomer) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const quantity = parseInt(req.query.quantity as string);
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: "quantity required" });
      }
      const stitchCount = req.query.stitchCount
        ? parseInt(req.query.stitchCount as string)
        : 8000; // sensible default for a typical embroidered logo

      const { getCandidateMachineIds } = await import("@shared/machines");
      const { findAvailableSlots } = await import("@shared/scheduling");

      const candidateIds = getCandidateMachineIds(quantity);
      if (candidateIds.length === 0) {
        return res.json({ earliestDate: null });
      }

      const [
        allMachines,
        staffMembers,
        staffShifts,
        machineBlocks,
        jobSchedules,
        staffMachineAllocations,
        staffHolidays,
        bankHolidays,
      ] = await Promise.all([
        storage.getMachines(),
        storage.getStaff(),
        storage.getStaffShifts(),
        storage.getMachineScheduleBlocks(),
        storage.getJobSchedules(),
        storage.getStaffMachineAllocations(),
        storage.getStaffHolidays(),
        storage.getBankHolidays(),
      ]);

      const machines = allMachines.filter(
        (m) => m.isActive && candidateIds.includes(m.id)
      );
      if (machines.length === 0) {
        return res.json({ earliestDate: null });
      }

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const horizon = new Date(startDate);
      horizon.setDate(horizon.getDate() + 60);

      // For each candidate machine, walk forward day-by-day and accumulate
      // the per-day machine-with-operator capacity (max single-staff available
      // minutes — conservative; avoids double-counting overlapping shifts).
      // findAvailableSlots already applies per-date staff/machine allocation
      // rules, so we iterate ALL active staff and trust it to filter.
      let earliestCompletion: Date | null = null;
      let earliestMachineId: number | null = null;

      for (const machine of machines) {
        const runs = Math.ceil(quantity / machine.heads);
        const rawMin = runs * (stitchCount / machine.stitchesPerMinute + machine.changeoverTimeMinutes);
        const multiplier = (machine as any).schedulingMultiplier ?? 1;
        const duration = Math.ceil((rawMin * multiplier) / 10) * 10;
        if (duration === 0) continue;

        let remaining = duration;
        const current = new Date(startDate);
        let completion: Date | null = null;

        while (current <= horizon && remaining > 0) {
          let dayCapacity = 0;
          for (const staffMember of staffMembers) {
            const slots = findAvailableSlots(
              current,
              machine.id,
              staffMember.id,
              machineBlocks,
              staffShifts,
              jobSchedules,
              staffMachineAllocations,
              staffHolidays,
              bankHolidays
            );
            const totalMin = slots.reduce((s, sl) => s + (sl.endTime - sl.startTime), 0);
            if (totalMin > dayCapacity) dayCapacity = totalMin;
          }
          if (dayCapacity > 0) {
            remaining -= dayCapacity;
            if (remaining <= 0) {
              completion = new Date(current);
              break;
            }
          }
          current.setDate(current.getDate() + 1);
        }

        if (completion && (!earliestCompletion || completion < earliestCompletion)) {
          earliestCompletion = completion;
          earliestMachineId = machine.id;
        }
      }

      // Add 1 working day after production completion for finishing/dispatch
      const earliestDispatch = earliestCompletion ? new Date(earliestCompletion) : null;
      if (earliestDispatch) {
        let added = 0;
        while (added < 1) {
          earliestDispatch.setDate(earliestDispatch.getDate() + 1);
          const dow = earliestDispatch.getDay();
          const ymd = earliestDispatch.toISOString().split("T")[0];
          const isBank = bankHolidays.some((bh: any) => {
            const bhDate = new Date(bh.date).toISOString().split("T")[0];
            return bhDate === ymd;
          });
          if (dow !== 0 && dow !== 6 && !isBank) added++;
        }
      }

      const earliestDateStr = earliestDispatch ? earliestDispatch.toISOString().split("T")[0] : null;

      // Customers only get the date. Staff get richer detail for debugging.
      if (isCustomer && !isStaff) {
        return res.json({ earliestDate: earliestDateStr });
      }
      res.json({
        earliestDate: earliestDateStr,
        productionCompleteDate: earliestCompletion ? earliestCompletion.toISOString().split("T")[0] : null,
        machineId: earliestMachineId,
        quantity,
        assumedStitchCount: stitchCount,
      });
    } catch (error) {
      console.error("Error computing earliest dispatch:", error);
      res.status(500).json({ error: "Failed to compute earliest dispatch" });
    }
  });

  // Staff machine allocation routes
  app.get("/api/staff-machine-allocations", isStaffAuthenticated, async (req, res) => {
    try {
      const { staffId, machineId, startDate, endDate } = req.query;
      const allocations = await storage.getStaffMachineAllocations(
        staffId as string | undefined,
        machineId ? parseInt(machineId as string) : undefined,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(allocations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff machine allocations" });
    }
  });

  app.post("/api/staff-machine-allocations", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertStaffMachineAllocationSchema.parse(req.body);
      const allocation = await storage.createStaffMachineAllocation(data);
      res.json(allocation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create staff machine allocation" });
      }
    }
  });

  app.patch("/api/staff-machine-allocations/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const data = updateStaffMachineAllocationSchema.parse(req.body);
      const allocation = await storage.updateStaffMachineAllocation(req.params.id, data);
      res.json(allocation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update staff machine allocation" 
        });
      }
    }
  });

  app.delete("/api/staff-machine-allocations/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteStaffMachineAllocation(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete staff machine allocation" });
    }
  });

  // Staff holidays routes
  app.get("/api/staff-holidays", isStaffAuthenticated, async (req, res) => {
    try {
      const { staffId, startDate, endDate } = req.query;
      const holidays = await storage.getStaffHolidays(
        staffId as string | undefined,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(holidays);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff holidays" });
    }
  });

  // Manager-entered holidays: approvers only (super_admin or canApproveHolidays).
  app.post("/api/staff-holidays", isStaffAuthenticated, async (req, res) => {
    try {
      const { canApprove } = await getHolidayContext(req);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to manage staff holidays" });
      }
      const data = insertStaffHolidaySchema.parse(req.body);
      const holiday = await storage.createStaffHoliday(data);
      res.json(holiday);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create staff holiday" });
      }
    }
  });

  app.patch("/api/staff-holidays/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const { canApprove } = await getHolidayContext(req);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to manage staff holidays" });
      }
      const data = updateStaffHolidaySchema.parse(req.body);
      const holiday = await storage.updateStaffHoliday(req.params.id, data);
      res.json(holiday);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update staff holiday" 
        });
      }
    }
  });

  app.delete("/api/staff-holidays/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const { canApprove } = await getHolidayContext(req);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to manage staff holidays" });
      }
      await storage.deleteStaffHoliday(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete staff holiday" });
    }
  });

  // ---- Holiday request / approval / allowance workflow ----

  // Resolve the staff record + approver permission for the current session user.
  async function getHolidayContext(req: any): Promise<{
    user: any;
    staff: any | undefined;
    canApprove: boolean;
  }> {
    const user = await storage.getUser(req.session.userId);
    const staffRecord = await storage.getStaffByUserId(req.session.userId);
    const canApprove =
      !!user &&
      (user.role === "super_admin" || (!!staffRecord && staffRecord.canApproveHolidays === true));
    return { user, staff: staffRecord, canApprove };
  }

  // Build an allowance summary for a single staff member for the given calendar year.
  async function buildAllowanceSummary(
    staffMember: any,
    year: number,
    bankHolidays: any[]
  ) {
    const { countHolidayDays } = await import("@shared/scheduling");
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const holidays = await storage.getStaffHolidays(staffMember.id, yearStart, yearEnd);

    let usedDays = 0;
    let pendingDays = 0;
    for (const h of holidays) {
      if (h.holidayType !== "holiday") continue;
      // Clamp the holiday to the calendar year before counting.
      const origStart = new Date(h.startDate);
      const origEnd = new Date(h.endDate);
      const start = origStart < yearStart ? yearStart : origStart;
      const end = origEnd > yearEnd ? yearEnd : origEnd;
      // Only keep half-day flags when the real boundary day falls inside this year.
      const halfStart = h.halfDayStart && origStart >= yearStart;
      const halfEnd = h.halfDayEnd && origEnd <= yearEnd;
      const days = countHolidayDays(start, end, halfStart, halfEnd, bankHolidays);
      if (h.status === "approved") usedDays += days;
      else if (h.status === "pending") pendingDays += days;
    }

    const allowance = staffMember.holidayAllowance ?? 23;
    return {
      staffId: staffMember.id,
      staffName: staffMember.name,
      allowance,
      used: usedDays,
      pending: pendingDays,
      remaining: Math.round((allowance - usedDays) * 2) / 2,
    };
  }

  // Submit a holiday request for the logged-in staff member (always pending).
  app.post("/api/staff-holidays/request", isStaffAuthenticated, async (req, res) => {
    try {
      const { staff: staffRecord } = await getHolidayContext(req);
      if (!staffRecord) {
        return res.status(403).json({ error: "No staff profile linked to your account" });
      }
      const data = insertStaffHolidaySchema.parse({
        ...req.body,
        staffId: staffRecord.id,
        status: "pending",
      });
      const holiday = await storage.createStaffHoliday({ ...data, status: "pending" });
      res.json(holiday);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to submit holiday request" });
      }
    }
  });

  // Approve a holiday request (approver only).
  app.post("/api/staff-holidays/:id/approve", isStaffAuthenticated, async (req, res) => {
    try {
      const { canApprove } = await getHolidayContext(req);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to approve holidays" });
      }
      const holiday = await storage.updateStaffHoliday(req.params.id, {
        status: "approved",
        reviewedById: req.session.userId,
        reviewedAt: new Date(),
        reviewNotes: typeof req.body?.reviewNotes === "string" ? req.body.reviewNotes : undefined,
      });
      res.json(holiday);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to approve holiday",
      });
    }
  });

  // Decline a holiday request (approver only).
  app.post("/api/staff-holidays/:id/decline", isStaffAuthenticated, async (req, res) => {
    try {
      const { canApprove } = await getHolidayContext(req);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to decline holidays" });
      }
      const holiday = await storage.updateStaffHoliday(req.params.id, {
        status: "declined",
        reviewedById: req.session.userId,
        reviewedAt: new Date(),
        reviewNotes: typeof req.body?.reviewNotes === "string" ? req.body.reviewNotes : undefined,
      });
      res.json(holiday);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to decline holiday",
      });
    }
  });

  // List all holiday requests with staff name + day counts (approver only).
  app.get("/api/staff-holidays/requests", isStaffAuthenticated, async (req, res) => {
    try {
      const { canApprove } = await getHolidayContext(req);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to view holiday requests" });
      }
      const { countHolidayDays } = await import("@shared/scheduling");
      const statusFilter = (req.query.status as string | undefined) || undefined;
      const allHolidays = await storage.getStaffHolidays();
      const allStaff = await storage.getStaff();
      const bankHolidays = await storage.getBankHolidays();
      const staffById = new Map(allStaff.map((s) => [s.id, s]));

      const result = allHolidays
        .filter((h) => (statusFilter ? h.status === statusFilter : true))
        .map((h) => ({
          ...h,
          staffName: staffById.get(h.staffId)?.name ?? "Unknown",
          days: countHolidayDays(h.startDate, h.endDate, h.halfDayStart, h.halfDayEnd, bankHolidays),
        }))
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch holiday requests" });
    }
  });

  // Own holidays + allowance summary for the logged-in staff member.
  app.get("/api/staff-holidays/me", isStaffAuthenticated, async (req, res) => {
    try {
      const { staff: staffRecord, canApprove } = await getHolidayContext(req);
      const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
      // Approvers (e.g. super_admins) may not have a linked staff record; still
      // return canApprove so they can reach the approver tabs.
      if (!staffRecord) {
        return res.json({ staff: null, canApprove, summary: null, holidays: [], year });
      }
      const { countHolidayDays } = await import("@shared/scheduling");
      const bankHolidays = await storage.getBankHolidays();
      const summary = await buildAllowanceSummary(staffRecord, year, bankHolidays);

      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
      const holidays = (await storage.getStaffHolidays(staffRecord.id, yearStart, yearEnd))
        .map((h) => ({
          ...h,
          days: countHolidayDays(h.startDate, h.endDate, h.halfDayStart, h.halfDayEnd, bankHolidays),
        }))
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

      res.json({ staff: staffRecord, canApprove, summary, holidays, year });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch your holidays" });
    }
  });

  // Per-staff allowance overview (approver only).
  app.get("/api/staff-holidays/allowances", isStaffAuthenticated, async (req, res) => {
    try {
      const { canApprove } = await getHolidayContext(req);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to view allowances" });
      }
      const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
      const allStaff = await storage.getStaff();
      const bankHolidays = await storage.getBankHolidays();
      const summaries = await Promise.all(
        allStaff.map((s) => buildAllowanceSummary(s, year, bankHolidays))
      );
      summaries.sort((a, b) => a.staffName.localeCompare(b.staffName));
      res.json({ year, allowances: summaries });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch allowances" });
    }
  });

  // Bank holidays routes
  app.get("/api/bank-holidays", isStaffAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const holidays = await storage.getBankHolidays(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(holidays);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bank holidays" });
    }
  });

  app.post("/api/bank-holidays", isStaffAuthenticated, async (req, res) => {
    try {
      const data = insertBankHolidaySchema.parse(req.body);
      const holiday = await storage.createBankHoliday(data);
      res.json(holiday);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create bank holiday" });
      }
    }
  });

  app.patch("/api/bank-holidays/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const data = updateBankHolidaySchema.parse(req.body);
      const holiday = await storage.updateBankHoliday(req.params.id, data);
      res.json(holiday);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to update bank holiday" 
        });
      }
    }
  });

  app.delete("/api/bank-holidays/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteBankHoliday(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bank holiday" });
    }
  });

  // Xero integration routes
  app.get("/api/xero/status", isStaffAuthenticated, async (req, res) => {
    res.json({ 
      configured: xeroService.isConfigured(),
      message: xeroService.isConfigured() 
        ? "Xero integration is configured" 
        : "Xero credentials not set. Please configure XERO_CLIENT_ID, XERO_CLIENT_SECRET, and XERO_TENANT_ID environment variables."
    });
  });

  // Xero bank account code (where Stripe-collected deposits land in Xero).
  // Required for the deposit-payment feature to post Payments against invoices.
  app.get("/api/xero/bank-account-code", isStaffAuthenticated, async (_req, res) => {
    try {
      const code = (await storage.getAppSetting("xero_bank_account_code")) || process.env.XERO_BANK_ACCOUNT_CODE || null;
      res.json({ code });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to read setting" });
    }
  });
  // Lists all bank-type accounts from your Xero chart of accounts so staff
  // can identify the correct code for the deposit clearing account.
  app.get("/api/xero/bank-accounts", isStaffAuthenticated, async (_req, res) => {
    try {
      if (!xeroService.isConfigured() || !xeroService.isConnected()) {
        return res.status(400).json({ error: "Xero is not connected" });
      }
      const token = await (xeroService as any).getAccessToken();
      const tenantId = (xeroService as any).getTenantId();
      const apiUrl = (xeroService as any).apiUrl;
      const r = await fetch(`${apiUrl}/Accounts?where=${encodeURIComponent('Type=="BANK"')}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "xero-tenant-id": tenantId,
          "Accept": "application/json",
        },
      });
      if (!r.ok) {
        return res.status(r.status).json({ error: await r.text() });
      }
      const data = await r.json();
      const accounts = (data.Accounts || []).map((a: any) => ({
        code: a.Code,
        name: a.Name,
        status: a.Status,
        bankAccountNumber: a.BankAccountNumber,
        accountID: a.AccountID,
      }));
      res.json({ accounts });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to fetch bank accounts" });
    }
  });

  app.patch("/api/xero/bank-account-code", isStaffAuthenticated, async (req, res) => {
    try {
      const { code } = req.body;
      if (typeof code !== "string" || !code.trim()) {
        return res.status(400).json({ error: "code is required" });
      }
      await storage.setAppSetting("xero_bank_account_code", code.trim());
      res.json({ success: true, code: code.trim() });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to save setting" });
    }
  });

  app.post("/api/xero/invoice/:jobId", isStaffAuthenticated, async (req, res) => {
    try {
      const { jobId } = req.params;
      const { manualPrices } = req.body; // Optional manual prices: { lineItemId: unitPrice }

      if (!xeroService.isConfigured()) {
        return res.status(400).json({ 
          error: "Xero is not configured. Please set up Xero credentials." 
        });
      }

      const jobs = await storage.getJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const customer = await storage.getCustomers().then(customers => 
        customers.find(c => c.id === job.customerId)
      );

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // Determine pricing table
      const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;

      // Get line items and calculate pricing
      const jobLineItems = await storage.getJobLineItems(job.id);
      const priceResult = pricingTable ? calculateJobPrice(jobLineItems, pricingTable) : { totalPrice: 0, lineItemPrices: jobLineItems.map(() => ({ unitPrice: 0, totalPrice: 0 })) };

      const isPOA = priceResult.totalPrice === "POA";
      
      // If POA and no manual prices provided, reject
      if (isPOA && !manualPrices) {
        return res.status(400).json({ error: "Manual prices required for POA items" });
      }

      // Build line items with pricing and stitch count
      const lineItemsWithPricing = jobLineItems.map((lineItem, index) => {
        let unitPrice: number;
        
        // Use manual price if provided for this line item, otherwise use calculated price
        if (manualPrices && manualPrices[lineItem.id] !== undefined) {
          unitPrice = parseFloat(manualPrices[lineItem.id]);
        } else {
          const lineItemPrice = priceResult.lineItemPrices[index];
          unitPrice = typeof lineItemPrice === 'number' ? lineItemPrice : lineItemPrice.unitPrice as number;
        }
        
        // Determine item code based on job type (case-insensitive)
        const jobTypeLower = lineItem.jobType?.toLowerCase() || '';
        let itemCode = "Emb"; // Default to embroidery
        let description = lineItem.description || '';
        
        if (jobTypeLower === "print") {
          itemCode = "Print DTF";
          // Add print size to description for Print jobs (job name added by xero.ts)
          const printSize = CODE_TO_PRINT_SIZE[lineItem.stitchCount as keyof typeof CODE_TO_PRINT_SIZE];
          if (printSize) {
            description = description ? `${description}, ${printSize} Print` : `${printSize} Print`;
          }
        } else if (jobTypeLower === "bagging") {
          itemCode = "BAG";
        } else if (jobTypeLower === "other") {
          itemCode = "OTHER";
        }
        
        return {
          jobName: job.jobName,
          poNumber: job.poNumber,
          description,
          quantity: lineItem.quantity,
          unitPrice,
          stitchCount: lineItem.stitchCount,
          itemCode,
        };
      });

      // Add approved logo setups for this customer
      const approvedLogoSetups = await storage.getLogoSetups();
      const customerLogoSetups = approvedLogoSetups.filter(
        setup => setup.customerId === job.customerId && setup.approved && setup.approvedAt
      );
      
      for (const setup of customerLogoSetups) {
        lineItemsWithPricing.push({
          jobName: "Logo Set-Up",
          poNumber: null,
          description: `Logo Set-Up - ${setup.jobName}`,
          quantity: 1,
          unitPrice: 12, // £12 per approved logo setup
          stitchCount: 0,
          itemCode: "EMB Set-Up",
        });
      }

      const invoice = await xeroService.createInvoice(job, customer, lineItemsWithPricing);

      // Persist the Xero contact ID so future portal lookups are instant
      const xeroContactId = invoice.Invoices?.[0]?.Contact?.ContactID;
      if (xeroContactId && customer.xeroContactId !== xeroContactId) {
        await storage.updateCustomer(customer.id, { xeroContactId });
      }

      // Calculate and save the invoice total and mark job as invoiced
      const invoiceTotal = lineItemsWithPricing.reduce((sum, item) => sum + (item.quantity || 0) * item.unitPrice, 0);
      const invoiceTotalIncVat = invoiceTotal * 1.2;
      const invoiceId = invoice.Invoices?.[0]?.InvoiceID || "unknown";
      const invoiceNumber = invoice.Invoices?.[0]?.InvoiceNumber || null;
      await storage.updateJob(job.id, {
        invoiceStatus: "invoiced",
        invoicedAt: new Date(),
        invoiceReference: invoiceNumber || invoiceId,
        invoiceTotal,
      });

      // Mark logo setups as invoiced (keep for history rather than deleting)
      for (const setup of customerLogoSetups) {
        await storage.updateLogoSetup(setup.id, { invoicedAt: new Date(), invoiceReference: invoiceNumber || invoiceId });
      }

      // Apply any deposit already paid by the customer as a Xero Payment
      // against this invoice, so the customer-facing invoice shows the
      // correct Amount Due (gross balance).
      let xeroPayment: { success: boolean; amountApplied?: number; error?: string } | null = null;
      const depositPaid = job.depositAmountPaid || 0;
      if (depositPaid > 0 && invoiceId !== "unknown") {
        const amountToApply = Math.min(depositPaid, invoiceTotalIncVat);
        const result = await xeroService.recordPayment(
          invoiceId,
          amountToApply,
          new Date(),
          `Deposit — ${invoiceNumber || invoiceId}`,
        );
        xeroPayment = { success: result.success, amountApplied: result.success ? amountToApply : undefined, error: result.error };
        if (result.success) {
          await storage.updateJob(job.id, { depositAmountPaid: Math.max(0, depositPaid - amountToApply) } as any);
        }
      }

      // Auto-charge saved card for non-credit-account customers — for the
      // outstanding balance only (gross invoice total minus deposit applied).
      // If a deposit was paid but the Xero Payment post failed, we still
      // charge only the gross balance (deposit is on file even if Xero is
      // out of sync) and flag the response so staff can reconcile.
      let stripeCharge = null;
      if (!customer.creditAccount && customer.stripeCustomerId) {
        const appliedDeposit = xeroPayment?.amountApplied || 0;
        const hasDeposit = depositPaid > 0;
        const balanceIncVat = Math.max(0, invoiceTotalIncVat - depositPaid);
        const chargeAmount = hasDeposit ? balanceIncVat : invoiceTotal; // preserve legacy ex-VAT charge only when no deposit ever existed
        if (chargeAmount > 0.01) {
          stripeCharge = await chargeCustomerCard(
            customer.stripeCustomerId,
            chargeAmount,
            `Invoice ${invoiceNumber || invoiceId}${hasDeposit ? " balance" : ""} — ${customer.name}`,
            invoiceNumber || invoiceId,
          );
        } else {
          stripeCharge = { success: true, amountCharged: 0, paymentIntentId: undefined };
        }
        if (hasDeposit && appliedDeposit === 0) {
          (stripeCharge as any).reconciliationRequired = true;
          (stripeCharge as any).reconciliationNote = `Deposit of £${depositPaid.toFixed(2)} was NOT applied in Xero (recordPayment failed: ${xeroPayment?.error || "unknown"}). Apply the payment in Xero manually so Amount Due is correct.`;
        }
      }
      
      res.json({ ...invoice, stripeCharge, xeroPayment });
    } catch (error) {
      console.error("Xero invoice creation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create invoice in Xero" 
      });
    }
  });

  app.post("/api/xero/consolidated-invoice", isStaffAuthenticated, async (req, res) => {
    try {
      const { jobIds, customerId, manualPrices, manualShippingCosts, logoSetupsOnly } = req.body; // Optional manual prices: { lineItemId: unitPrice }, optional manual shipping: { jobId: shippingCost }

      // For logo-setups-only invoices, jobIds can be empty
      if (!logoSetupsOnly && (!Array.isArray(jobIds) || jobIds.length === 0)) {
        return res.status(400).json({ error: "jobIds must be a non-empty array" });
      }
      
      // Validate manual shipping costs if provided
      if (manualShippingCosts) {
        for (const [jobId, cost] of Object.entries(manualShippingCosts)) {
          const numCost = Number(cost);
          if (isNaN(numCost) || numCost < 0) {
            return res.status(400).json({ error: `Invalid manual shipping cost for job ${jobId}` });
          }
        }
      }

      // Fetch all jobs and customer
      const allJobs = await storage.getJobs();
      let selectedJobs = logoSetupsOnly ? [] : allJobs.filter(j => (jobIds || []).includes(j.id));

      if (!logoSetupsOnly && selectedJobs.length !== (jobIds || []).length) {
        return res.status(404).json({ error: "One or more jobs not found" });
      }

      // Sort jobs to match Google Drive Calculations sheet order (so Xero invoice lines
      // align with the Drive verification panel). Falls back to completion date order
      // if Drive data is unavailable or a job name doesn't match any sheet row.
      {
        let driveOrderMap: Map<string, number> | null = null;
        try {
          const { getCustomerDriveRows } = await import("./googleService.js");
          const driveData = await getCustomerDriveRows(customer.name);
          if (driveData && driveData.rows.length > 0) {
            driveOrderMap = new Map(
              driveData.rows.map((row, i) => [row.name.toLowerCase().trim(), i])
            );
          }
        } catch {
          // Drive lookup failed — fall back to date order silently
        }

        selectedJobs.sort((a, b) => {
          const nameA = (a.jobName || "").toLowerCase().trim();
          const nameB = (b.jobName || "").toLowerCase().trim();
          const posA = driveOrderMap?.has(nameA) ? driveOrderMap.get(nameA)! : Number.MAX_SAFE_INTEGER;
          const posB = driveOrderMap?.has(nameB) ? driveOrderMap.get(nameB)! : Number.MAX_SAFE_INTEGER;
          if (posA !== posB) return posA - posB;
          // Tie-break (or no Drive match): sort by completion date
          const dateA = a.goodsReceived ? new Date(a.goodsReceived).getTime() : 0;
          const dateB = b.goodsReceived ? new Date(b.goodsReceived).getTime() : 0;
          return dateA - dateB;
        });
      }

      // CRITICAL: Verify all selected jobs belong to the specified customer
      if (!logoSetupsOnly) {
        const jobsFromWrongCustomer = selectedJobs.filter(j => j.customerId !== customerId);
        if (jobsFromWrongCustomer.length > 0) {
          return res.status(400).json({ 
            error: "All selected jobs must belong to the same customer" 
          });
        }

        // Verify all selected jobs are in 'ready' status
        const jobsNotReady = selectedJobs.filter(j => j.invoiceStatus !== 'ready');
        if (jobsNotReady.length > 0) {
          return res.status(400).json({ 
            error: "All selected jobs must be in 'ready' status for invoicing" 
          });
        }
      }

      const customer = await storage.getCustomers().then(customers => 
        customers.find(c => c.id === customerId)
      );

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // Determine pricing table (use null for zero pricing if none configured)
      const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;

      // Get line items and calculate pricing for each job
      // Build line items in order: job items, then carriage for that job, repeat
      const lineItemsWithPricing: Array<{ jobName: string; poNumber: string | null; description: string; quantity: number; unitPrice: number; stitchCount: number; itemCode: string }> = [];
      // Track per-job invoice subtotals so we can save them to the DB
      const jobInvoiceTotals: Record<number, number> = {};
      let hasPOA = false;
      let hasTBA = false;

      // Pre-compute the last index where each shipmentId appears
      const shipmentLastIndex = new Map<string, number>();
      for (let i = 0; i < selectedJobs.length; i++) {
        const shipmentKey = selectedJobs[i].consolidatedShipmentId || `single-${selectedJobs[i].id}`;
        shipmentLastIndex.set(shipmentKey, i);
      }

      // For each tracking number, determine which shipmentKey processes last so we only
      // emit ONE carriage line per physical delivery even when multiple consolidated
      // groups share the same tracking number.
      const trackingLastShipmentKey = new Map<string, string>();
      for (const [sk, lastIdx] of shipmentLastIndex.entries()) {
        const skJobs = selectedJobs.filter(j => (j.consolidatedShipmentId || `single-${j.id}`) === sk);
        const tn = skJobs.find(j => j.dhlTrackingNumber)?.dhlTrackingNumber;
        if (tn) {
          const existingSk = trackingLastShipmentKey.get(tn);
          if (!existingSk || shipmentLastIndex.get(existingSk)! < lastIdx) {
            trackingLastShipmentKey.set(tn, sk);
          }
        }
      }

      // Accumulate jobs by shipment key
      const shipmentJobsMap = new Map<string, Job[]>();
      
      for (let i = 0; i < selectedJobs.length; i++) {
        const job = selectedJobs[i];
        const shipmentKey = job.consolidatedShipmentId || `single-${job.id}`;
        
        // Add job to shipment accumulator
        if (!shipmentJobsMap.has(shipmentKey)) {
          shipmentJobsMap.set(shipmentKey, []);
        }
        shipmentJobsMap.get(shipmentKey)!.push(job);
        
        // Add this job's line items
        const jobLineItems = await storage.getJobLineItems(job.id);
        
        let priceResult;
        try {
          priceResult = pricingTable ? calculateJobPrice(jobLineItems, pricingTable) : { totalPrice: 0, lineItemPrices: jobLineItems.map(() => ({ unitPrice: 0, totalPrice: 0 })) };
          if (priceResult.totalPrice === "POA") {
            hasPOA = true;
          }
        } catch (error) {
          console.log(`Price calculation failed for job ${job.id}, treating as POA:`, error instanceof Error ? error.message : error);
          hasPOA = true;
          priceResult = null;
        }

        jobLineItems.forEach((lineItem, index) => {
          let unitPrice: number;
          
          if (manualPrices && manualPrices[lineItem.id] !== undefined) {
            unitPrice = parseFloat(manualPrices[lineItem.id]);
          } else if (priceResult) {
            const lineItemPrice = priceResult.lineItemPrices[index];
            unitPrice = typeof lineItemPrice === 'number' ? lineItemPrice : lineItemPrice.unitPrice as number;
          } else {
            unitPrice = 0;
          }
          
          // Accumulate per-job invoice total
          jobInvoiceTotals[job.id] = (jobInvoiceTotals[job.id] || 0) + (lineItem.quantity || 0) * unitPrice;

          const jobTypeLower = lineItem.jobType?.toLowerCase() || '';
          let itemCode = "Emb";
          let description = lineItem.description || '';
          
          if (jobTypeLower === "print") {
            itemCode = "Print DTF";
            // Add print size to description for Print jobs (job name added by xero.ts)
            const printSize = CODE_TO_PRINT_SIZE[lineItem.stitchCount as keyof typeof CODE_TO_PRINT_SIZE];
            if (printSize) {
              description = description ? `${description}, ${printSize} Print` : `${printSize} Print`;
            }
          } else if (jobTypeLower === "bagging") {
            itemCode = "BAG";
          } else if (jobTypeLower === "other") {
            itemCode = "OTHER";
          }
          
          lineItemsWithPricing.push({
            jobName: job.jobName,
            poNumber: job.poNumber,
            description,
            quantity: lineItem.quantity,
            unitPrice,
            stitchCount: lineItem.stitchCount,
            itemCode,
          });
        });

        if (job.shippingCost === "TBA") {
          // A TBA job is covered if ANY job in the same tracking-number group
          // (or consolidated group, or itself if standalone) has a manual cost.
          let groupHasCost = false;
          if (manualShippingCosts) {
            if (job.dhlTrackingNumber) {
              groupHasCost = selectedJobs.some(
                j => j.shippingCost === "TBA" && j.dhlTrackingNumber === job.dhlTrackingNumber && !!manualShippingCosts[j.id]
              );
            } else if (job.consolidatedShipmentId) {
              groupHasCost = selectedJobs.some(
                j => j.shippingCost === "TBA" && j.consolidatedShipmentId === job.consolidatedShipmentId && !!manualShippingCosts[j.id]
              );
            } else {
              groupHasCost = !!manualShippingCosts[job.id];
            }
          }
          if (!groupHasCost) {
            hasTBA = true;
          }
        }
        
        // If this is the last occurrence of this shipmentKey, emit carriage
        if (shipmentLastIndex.get(shipmentKey) === i) {
          const shipmentJobs = shipmentJobsMap.get(shipmentKey)!;

          // Find the tracking number for this group
          const carriageTrackingNumber = shipmentJobs.find(j => j.dhlTrackingNumber)?.dhlTrackingNumber;

          // Only emit carriage if this is the designated group for this tracking number.
          // This prevents duplicate carriage lines when multiple consolidated groups
          // share the same tracking number (same physical delivery).
          const isDesignatedEmitter = !carriageTrackingNumber || trackingLastShipmentKey.get(carriageTrackingNumber) === shipmentKey;

          if (isDesignatedEmitter) {
            // All jobs in this physical delivery
            const allDeliveryJobs = carriageTrackingNumber
              ? selectedJobs.filter(j => j.dhlTrackingNumber === carriageTrackingNumber)
              : shipmentJobs;

            // Compute shipping cost using MAX across all delivery jobs.
            // Same physical delivery — avoid double-counting duplicated costs.
            let totalShippingCost = 0;
            let shippingMethod = '';
            let hasShipping = false;

            for (const shipmentJob of allDeliveryJobs) {
              let shippingCost: number | null = null;

              if (shipmentJob.shippingCost === "TBA") {
                if (manualShippingCosts && manualShippingCosts[shipmentJob.id]) {
                  shippingCost = Number(manualShippingCosts[shipmentJob.id]);
                }
              } else if (shipmentJob.shippingCost) {
                shippingCost = parseFloat(shipmentJob.shippingCost);
              }

              if (shippingCost !== null && !isNaN(shippingCost) && shippingCost > 0) {
                // MAX — same physical delivery, cost is not per-job
                totalShippingCost = Math.max(totalShippingCost, shippingCost);
                hasShipping = true;
                if (!shippingMethod) shippingMethod = shipmentJob.shippingMethod || '';
              }
            }

            if (hasShipping && totalShippingCost > 0) {
              const isConsolidated = allDeliveryJobs.length > 1;

              const jobDetails = allDeliveryJobs.map(j =>
                j.poNumber ? `${j.jobName} (PO: ${j.poNumber})` : j.jobName
              ).join(', ');

              let packageInfo = '';
              {
                const packageCounts: { [key: string]: number } = {};
                for (const shipmentJob of allDeliveryJobs) {
                  if (shipmentJob.packageCount && shipmentJob.packageType) {
                    const normalizedType = shipmentJob.packageType.toLowerCase();
                    packageCounts[normalizedType] = Math.max(packageCounts[normalizedType] || 0, shipmentJob.packageCount);
                  }
                }

                if (Object.keys(packageCounts).length > 0) {
                  const pluralMap: { [key: string]: string } = {
                    'box': 'boxes', 'boxes': 'boxes',
                    'bag': 'bags', 'bags': 'bags',
                    'pallet': 'pallets', 'pallets': 'pallets',
                    'package': 'packages', 'packages': 'packages',
                  };
                  const singularMap: { [key: string]: string } = {
                    'boxes': 'box', 'bags': 'bag', 'pallets': 'pallet', 'packages': 'package',
                  };
                  const packageParts = Object.entries(packageCounts).map(([type, count]) => {
                    const singular = singularMap[type] || type;
                    const plural = pluralMap[type] || pluralMap[singular] || type + 's';
                    return `${count} ${count > 1 ? plural : singular}`;
                  });
                  packageInfo = ` (${packageParts.join(', ')})`;
                }
              }

              // Attribute shipping cost to the primary (first) job in the shipment
              jobInvoiceTotals[shipmentJobs[0].id] = (jobInvoiceTotals[shipmentJobs[0].id] || 0) + totalShippingCost;

              lineItemsWithPricing.push({
                jobName: isConsolidated ? `${allDeliveryJobs.length} jobs` : shipmentJobs[0].jobName,
                poNumber: shipmentJobs[0].poNumber,
                description: `Shipping${isConsolidated ? ' (Consolidated)' : ''} - ${
                  shippingMethod === 'customer_collection'
                    ? 'Customer Collection'
                    : shippingMethod === 'consolidated'
                      ? 'Consolidated Back to Customer'
                      : 'Direct Delivery'
                }${packageInfo} - ${jobDetails}`,
                quantity: 1,
                unitPrice: totalShippingCost,
                stitchCount: 0,
                itemCode: "CARRIAGE",
              });
            }
          }

          // Clear from map to prevent reprocessing
          shipmentJobsMap.delete(shipmentKey);
        }
      }
      
      // If we have POA items and no manual prices provided, reject
      if (hasPOA && !manualPrices) {
        return res.status(400).json({ error: "Manual prices required for POA items" });
      }

      // If we have TBA shipping costs and no manual shipping costs provided, reject
      if (hasTBA) {
        return res.status(400).json({ error: "Manual shipping costs required for TBA shipping. Please enter shipping costs for all orders with TBA shipping." });
      }

      // Add approved logo setups for this customer at the end
      const approvedLogoSetups = await storage.getLogoSetups();
      const customerLogoSetups = approvedLogoSetups.filter(
        setup => setup.customerId === customerId && setup.approved && setup.approvedAt
      );
      
      // For logo-only invoices, verify there are logo setups to invoice
      if (logoSetupsOnly && customerLogoSetups.length === 0) {
        return res.status(400).json({ error: "No approved logo setups found for this customer" });
      }
      
      // Attribute logo setup costs to the first job (or stand-alone if logo-only invoice)
      const logoSetupTotal = customerLogoSetups.length * 12;
      if (logoSetupTotal > 0 && selectedJobs.length > 0) {
        jobInvoiceTotals[selectedJobs[0].id] = (jobInvoiceTotals[selectedJobs[0].id] || 0) + logoSetupTotal;
      }

      for (const setup of customerLogoSetups) {
        lineItemsWithPricing.push({
          jobName: "Logo Set-Up",
          poNumber: null,
          description: `Logo Set-Up - ${setup.jobName}`,
          quantity: 1,
          unitPrice: 12, // £12 per approved logo setup
          stitchCount: 0,
          itemCode: "EMB Set-Up",
        });
      }

      // Create consolidated invoice in Xero
      const invoiceResponse = await xeroService.createConsolidatedInvoice(
        selectedJobs,
        customer,
        lineItemsWithPricing
      );

      // Extract invoice ID from Xero response
      const invoiceId = invoiceResponse.Invoices?.[0]?.InvoiceID || "unknown";
      const invoiceNumber = invoiceResponse.Invoices?.[0]?.InvoiceNumber || null;

      // Persist the Xero contact ID so portal lookups are instant in future
      const xeroContactIdFromInvoice = invoiceResponse.Invoices?.[0]?.Contact?.ContactID;
      if (xeroContactIdFromInvoice && customer.xeroContactId !== xeroContactIdFromInvoice) {
        await storage.updateCustomer(customer.id, { xeroContactId: xeroContactIdFromInvoice });
      }

      // Mark logo setups as invoiced (keep for history rather than deleting)
      for (const setup of customerLogoSetups) {
        await storage.updateLogoSetup(setup.id, { invoicedAt: new Date(), invoiceReference: invoiceNumber || invoiceId });
      }

      // Update all jobs with invoice status and their calculated totals
      const now = new Date();
      for (const job of selectedJobs) {
        await storage.updateJob(job.id, {
          invoiceStatus: "invoiced",
          invoicedAt: now,
          invoiceReference: invoiceNumber || invoiceId,
          invoiceTotal: jobInvoiceTotals[job.id] || 0,
        });
      }

      // Calculate overall invoice total for Stripe charge
      const consolidatedTotal = lineItemsWithPricing.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
      const consolidatedTotalIncVat = consolidatedTotal * 1.2;

      // Apply any deposits already paid by the customer (summed across the
      // selected jobs) as a single Xero Payment against the new invoice.
      let xeroPayment: { success: boolean; amountApplied?: number; error?: string } | null = null;
      const totalDeposit = selectedJobs.reduce((sum, j) => sum + (j.depositAmountPaid || 0), 0);
      if (totalDeposit > 0 && invoiceId !== "unknown") {
        const amountToApply = Math.min(totalDeposit, consolidatedTotalIncVat);
        const result = await xeroService.recordPayment(
          invoiceId,
          amountToApply,
          new Date(),
          `Deposits — ${invoiceNumber || invoiceId}`,
        );
        xeroPayment = { success: result.success, amountApplied: result.success ? amountToApply : undefined, error: result.error };
        if (result.success) {
          // Proportionally clear deposits from each job
          let remaining = amountToApply;
          for (const j of selectedJobs) {
            const jd = j.depositAmountPaid || 0;
            if (jd <= 0 || remaining <= 0) continue;
            const consume = Math.min(jd, remaining);
            await storage.updateJob(j.id, { depositAmountPaid: jd - consume } as any);
            remaining -= consume;
          }
        }
      }

      // Auto-charge saved card for non-credit-account customers — for the
      // outstanding gross balance only when a deposit exists (regardless of
      // whether the Xero Payment post succeeded). Failed Xero post is
      // surfaced as reconciliationRequired so staff can fix it manually.
      let stripeCharge = null;
      if (!customer.creditAccount && customer.stripeCustomerId && consolidatedTotal > 0) {
        const appliedDeposit = xeroPayment?.amountApplied || 0;
        const hasDeposit = totalDeposit > 0;
        const balanceIncVat = Math.max(0, consolidatedTotalIncVat - totalDeposit);
        const chargeAmount = hasDeposit ? balanceIncVat : consolidatedTotal; // preserve legacy ex-VAT charge only when no deposit ever existed
        if (chargeAmount > 0.01) {
          stripeCharge = await chargeCustomerCard(
            customer.stripeCustomerId,
            chargeAmount,
            `Invoice ${invoiceNumber || invoiceId}${hasDeposit ? " balance" : ""} — ${customer.name}`,
            invoiceNumber || invoiceId,
          );
        } else {
          stripeCharge = { success: true, amountCharged: 0, paymentIntentId: undefined };
        }
        if (hasDeposit && appliedDeposit === 0) {
          (stripeCharge as any).reconciliationRequired = true;
          (stripeCharge as any).reconciliationNote = `Deposits totalling £${totalDeposit.toFixed(2)} were NOT applied in Xero (recordPayment failed: ${xeroPayment?.error || "unknown"}). Apply the payment in Xero manually so Amount Due is correct.`;
        }
      }

      res.json({
        success: true,
        invoiceId,
        invoiceNumber,
        jobsInvoiced: selectedJobs.length,
        logoSetupsInvoiced: customerLogoSetups.length,
        stripeCharge,
        xeroPayment,
      });
    } catch (error) {
      console.error("Consolidated invoice creation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create consolidated invoice" 
      });
    }
  });

  // Logo Setup routes
  app.get("/api/logo-setups", isStaffAuthenticated, async (req, res) => {
    try {
      const logoSetups = await storage.getLogoSetups();
      res.json(logoSetups);
    } catch (error) {
      console.error("Error fetching logo setups:", error);
      res.status(500).json({ error: "Failed to fetch logo setups" });
    }
  });

  app.get("/api/logo-setups/completed", isStaffAuthenticated, async (req, res) => {
    try {
      const completed = await storage.getCompletedLogoSetups();
      res.json(completed);
    } catch (error) {
      console.error("Error fetching completed logo setups:", error);
      res.status(500).json({ error: "Failed to fetch completed logo setups" });
    }
  });

  app.post("/api/logo-setups", isStaffAuthenticated, async (req, res) => {
    try {
      const parsed = insertLogoSetupSchema.parse(req.body);
      const logoSetup = await storage.createLogoSetup(parsed);
      res.status(201).json(logoSetup);
    } catch (error) {
      console.error("Error creating logo setup:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create logo setup" });
    }
  });

  app.patch("/api/logo-setups/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const parsed = updateLogoSetupSchema.parse(req.body);
      
      // Automatically set approvedAt when approved is set to true
      const updateData = {
        ...parsed,
        approvedAt: parsed.approved === true ? new Date() : parsed.approvedAt,
      };
      
      const logoSetup = await storage.updateLogoSetup(req.params.id, updateData);
      res.json(logoSetup);
    } catch (error) {
      console.error("Error updating logo setup:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update logo setup" });
    }
  });

  app.delete("/api/logo-setups/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteLogoSetup(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting logo setup:", error);
      res.status(500).json({ error: "Failed to delete logo setup" });
    }
  });

  // Xero OAuth routes
  app.get("/api/xero/auth/status", isStaffAuthenticated, async (req, res) => {
    res.json({
      configured: xeroService.isConfigured(),
      connected: xeroService.isConnected(),
    });
  });

  app.get("/api/xero/auth/connect", isStaffAuthenticated, async (req, res) => {
    try {
      if (!xeroService.isConfigured()) {
        return res.status(400).json({ error: "Xero is not configured. Please contact your administrator." });
      }

      // Determine redirect URI based on environment
      // In production (REPLIT_DEPLOYMENT=1), use the actual domain from request headers
      // In development, use REPLIT_DEV_DOMAIN if available
      const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
      let redirectUri: string;
      
      if (isProduction) {
        // Production: Use request headers to get the production domain
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        redirectUri = `${protocol}://${host}/api/xero/auth/callback`;
        console.log("Production mode - using domain from request:", host);
      } else {
        // Development: Use REPLIT_DEV_DOMAIN if available, otherwise fall back to request headers
        const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
        if (replitDevDomain) {
          redirectUri = `https://${replitDevDomain}/api/xero/auth/callback`;
          console.log("Development mode - using REPLIT_DEV_DOMAIN:", replitDevDomain);
        } else {
          const protocol = req.headers['x-forwarded-proto'] || req.protocol;
          const host = req.headers.host;
          redirectUri = `${protocol}://${host}/api/xero/auth/callback`;
          console.log("Development mode - using domain from request:", host);
        }
      }
      
      console.log("Xero OAuth redirect URI:", redirectUri);
      const { authUrl, state } = xeroService.getAuthorizationUrl(redirectUri);
      
      // Store state in session to survive server restarts
      (req.session as any).xeroOAuthState = state;
      
      // Explicitly save the session before responding to ensure it's persisted
      req.session.save((err) => {
        if (err) {
          console.error("Failed to save session:", err);
          return res.status(500).json({ error: "Session error. Please try again." });
        }
        console.log("Session saved with state:", state);
        res.json({ authUrl, state });
      });
    } catch (error) {
      console.error("Error generating Xero auth URL:", error);
      res.status(500).json({ error: "Unable to initiate connection. Please try again." });
    }
  });

  app.get("/api/xero/auth/callback", isStaffAuthenticated, async (req, res) => {
    try {
      const { code, state } = req.query;

      console.log("=== XERO CALLBACK ===");
      console.log("Code:", code ? "present" : "missing");
      console.log("State:", state);
      console.log("Session state:", (req.session as any)?.xeroOAuthState);

      if (!code || typeof code !== 'string') {
        console.log("Missing code - redirecting to error");
        return res.redirect("/?xero=error&reason=missing_code");
      }

      if (!state || typeof state !== 'string') {
        console.log("Missing state - redirecting to error");
        return res.redirect("/?xero=error&reason=missing_state");
      }

      // Validate state from session to prevent CSRF attacks
      const sessionState = (req.session as any)?.xeroOAuthState;
      if (!sessionState || sessionState !== state) {
        console.log("Invalid state - session mismatch - redirecting to error");
        return res.redirect("/?xero=error&reason=invalid_state");
      }

      // Clear the state from session after validation
      delete (req.session as any).xeroOAuthState;

      // Determine redirect URI based on environment (must match the one used in /connect)
      const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
      let redirectUri: string;
      
      if (isProduction) {
        // Production: Use request headers to get the production domain
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        redirectUri = `${protocol}://${host}/api/xero/auth/callback`;
      } else {
        // Development: Use REPLIT_DEV_DOMAIN if available, otherwise fall back to request headers
        const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
        if (replitDevDomain) {
          redirectUri = `https://${replitDevDomain}/api/xero/auth/callback`;
        } else {
          const protocol = req.headers['x-forwarded-proto'] || req.protocol;
          const host = req.headers.host;
          redirectUri = `${protocol}://${host}/api/xero/auth/callback`;
        }
      }

      console.log("Redirect URI:", redirectUri);
      console.log("Environment:", isProduction ? "Production" : "Development");
      console.log("Exchanging code for tokens...");

      await xeroService.exchangeCodeForTokens(code, redirectUri);

      console.log("Successfully exchanged tokens - redirecting to success");
      // Redirect to invoicing queue page with success message
      res.redirect("/?xero=connected");
    } catch (error) {
      console.error("Xero OAuth callback error:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      res.redirect("/?xero=error");
    }
  });

  app.post("/api/xero/auth/disconnect", isStaffAuthenticated, async (req, res) => {
    try {
      xeroService.disconnect();
      res.json({ success: true, message: "Disconnected from Xero" });
    } catch (error) {
      console.error("Error disconnecting from Xero:", error);
      res.status(500).json({ error: "Failed to disconnect from Xero" });
    }
  });

  // ─── Direct Conversations ─────────────────────────────────────────────────

  // Staff: list all direct conversations enriched with customer name + latest message + unread
  app.get("/api/staff/direct-conversations", isStaffAuthenticated, async (_req, res) => {
    try {
      const convos = await storage.getConversations();
      const customers = await storage.getCustomers();
      const allUsers = await storage.getAllUsers();
      const custMap = new Map(customers.map(c => [c.id, c]));
      const userMap = new Map(allUsers.map(u => [String(u.id), u]));
      const enriched = await Promise.all(convos.map(async (c) => {
        const msgs = await storage.getConversationMessages(c.id);
        const unread = msgs.filter(m => m.senderType === "customer" && !m.readByStaff).length;
        const latest = msgs[msgs.length - 1] ?? null;
        let recipientName = "Unknown";
        let recipientType: "customer" | "staff" = "customer";
        if (c.staffRecipientId) {
          recipientName = userMap.get(c.staffRecipientId)?.name ?? "Staff Member";
          recipientType = "staff";
        } else if (c.customerId) {
          recipientName = custMap.get(c.customerId)?.name ?? "Unknown";
        }
        return { ...c, customerName: recipientName, recipientName, recipientType, unreadCount: unread, latestMessage: latest };
      }));
      res.json(enriched);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Staff: list all users (active) for messaging
  app.get("/api/staff/messaging-users", isStaffAuthenticated, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const active = allUsers.filter(u => u.active !== false);
      res.json(active.map(u => ({
        id: String(u.id),
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
        email: u.email,
        role: u.role,
      })));
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Staff: get messages for a direct conversation (marks as read by staff)
  app.get("/api/staff/direct-conversations/:id/messages", isStaffAuthenticated, async (req, res) => {
    try {
      const msgs = await storage.getConversationMessages(req.params.id);
      await storage.markConversationMessagesReadByStaff(req.params.id);
      const allStaff = await storage.getStaff();
      const allUsers = await storage.getAllUsers();
      const enriched = await Promise.all(msgs.map(async (msg) => {
        if (msg.senderType === 'staff' && msg.senderId) {
          const staffMember = allStaff.find(s => s.id === msg.senderId);
          const linkedUser = staffMember?.userId
            ? allUsers.find(u => u.id === staffMember.userId)
            : allUsers.find(u => u.id === msg.senderId);
          return {
            ...msg,
            imageUrl: normalizeImgUrl((msg as any).imageUrl),
            senderName: staffMember?.name || [linkedUser?.firstName, linkedUser?.lastName].filter(Boolean).join(' ') || null,
            senderImageUrl: normalizeImgUrl(linkedUser?.profileImageUrl),
          };
        } else if (msg.senderType === 'customer' && msg.senderId) {
          const customerUser = await storage.getCustomerUserById(msg.senderId);
          const name = [customerUser?.firstName, customerUser?.lastName].filter(Boolean).join(' ') || null;
          return { ...msg, imageUrl: normalizeImgUrl((msg as any).imageUrl), senderName: name, senderImageUrl: normalizeImgUrl((customerUser as any)?.profileImageUrl) };
        }
        return { ...msg, imageUrl: normalizeImgUrl((msg as any).imageUrl), senderName: null, senderImageUrl: null };
      }));
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Staff: reply in a direct conversation
  app.post("/api/staff/direct-conversations/:id/messages", isStaffAuthenticated, async (req: any, res) => {
    try {
      const convo = await storage.getConversation(req.params.id);
      if (!convo) return res.status(404).json({ error: "Conversation not found" });
      const sessionUserId = String(req.session.userId);
      const allStaff = await storage.getStaff();
      const staffMember = allStaff.find((s: any) => s.userId && String(s.userId) === sessionUserId);
      let senderName = staffMember?.name || '';
      if (!senderName) {
        const allUsers = await storage.getAllUsers();
        const userRecord = allUsers.find(u => u.id === sessionUserId);
        senderName = [userRecord?.firstName, userRecord?.lastName].filter(Boolean).join(' ') || 'Staff';
      }
      const msg = await storage.createConversationMessage({
        conversationId: req.params.id,
        senderType: "staff",
        senderId: String(req.session.userId),
        message: req.body.message,
        ...(req.body.imageUrl ? { imageUrl: req.body.imageUrl } : {}),
      });

      // Fire @mention notifications for any @handles in this message
      if (req.body.message) {
        const baseUrl = getBaseUrl();
        notifyMentionedStaff(
          req.body.message,
          senderName,
          sessionUserId,
          convo.subject || 'Direct Message',
          `${baseUrl}/messages?conversationId=${req.params.id}`,
        );
      }

      // Email notification to customer (fire-and-forget)
      if (convo.customerId) {
        (async () => {
          try {
            const customerUsers = await storage.getCustomerUsersByCustomerId(convo.customerId!);
            const emails = customerUsers
              .filter((u: any) => u.emailNotificationsMessages)
              .map((u: any) => u.email).filter(Boolean) as string[];
            if (emails.length) {
              const baseUrl = getBaseUrl();
              await sendNewChatEmail(emails, {
                staffName: senderName,
                subject: convo.subject,
                firstMessage: req.body.message,
                portalUrl: `${baseUrl}/customer/messages`,
                isJobChat: false,
              });
            }
          } catch (emailErr) {
            console.error('Failed to send customer direct reply notification:', emailErr);
          }
        })();
      }
      res.json(msg);
    } catch (e) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Staff: create a new direct conversation (with a customer or a staff member)
  app.post("/api/staff/direct-conversations", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { message, ...rest } = req.body;
      const trimmedSubject = typeof rest.subject === "string" ? rest.subject.trim() : rest.subject;
      const data = insertConversationSchema.parse({ ...rest, subject: trimmedSubject });
      // Dedupe: reuse an existing open conversation with the same (subject + recipient) for this customer
      let convo: any = null;
      if (data.customerId) {
        const existingConvos = await storage.getConversationsByCustomer(data.customerId);
        const normalized = String(trimmedSubject || "").toLowerCase();
        const incomingRecipient = (data as any).staffRecipientId ?? null;
        convo = existingConvos.find((c: any) =>
          c.status === "open"
          && String(c.subject || "").trim().toLowerCase() === normalized
          && (c.staffRecipientId ?? null) === incomingRecipient
        ) ?? null;
      }
      if (!convo) {
        convo = await storage.createConversation(data as any);
      }
      if (message) {
        await storage.createConversationMessage({
          conversationId: convo.id,
          senderType: "staff",
          senderId: String(req.session.userId),
          message,
        });
      }

      // Email notification to customer when staff starts a conversation with them
      if (message && convo.customerId) {
        try {
          const sessionUserId = String(req.session.userId);
          const allStaff = await storage.getStaff();
          const staffMember = allStaff.find(s => s.userId && String(s.userId) === sessionUserId);
          let senderName = staffMember?.name || '';
          if (!senderName) {
            const allUsers = await storage.getAllUsers();
            const userRecord = allUsers.find(u => u.id === sessionUserId);
            senderName = [userRecord?.firstName, userRecord?.lastName].filter(Boolean).join(' ') || 'Staff';
          }

          const customerUsers = await storage.getCustomerUsersByCustomerId(convo.customerId);
          const emails = customerUsers
            .filter((u) => u.emailNotificationsMessages)
            .map((u) => u.email).filter(Boolean) as string[];
          if (emails.length) {
            const baseUrl = getBaseUrl();
            await sendNewChatEmail(emails, {
              staffName: senderName,
              subject: convo.subject,
              firstMessage: message,
              portalUrl: `${baseUrl}/customer/messages`,
              isJobChat: false,
            });
          }
        } catch (emailErr) {
          console.error('Failed to send new conversation email notification:', emailErr);
        }
      }

      res.json(convo);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Staff: delete a direct conversation message (unsend)
  app.delete("/api/staff/direct-conversations/:id/messages/:messageId", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteConversationMessage(req.params.messageId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // Staff: archive / update a conversation
  app.patch("/api/staff/direct-conversations/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const convo = await storage.updateConversation(req.params.id, req.body);
      res.json(convo);
    } catch (e) {
      res.status(500).json({ error: "Failed to update conversation" });
    }
  });

  // Staff: unread count (direct conversations)
  app.get("/api/staff/direct-conversations/unread-count", isStaffAuthenticated, async (_req, res) => {
    try {
      const count = await storage.getUnreadConversationCountForStaff();
      res.json({ count });
    } catch (e) {
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  // Customer: list their direct conversations
  app.get("/api/customer-portal/direct-conversations", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const convos = await storage.getConversationsByCustomer(customerUser.customerId);
      const visible = convos.filter((c: any) => c.status !== "deleted");
      const enriched = await Promise.all(visible.map(async (c) => {
        const msgs = await storage.getConversationMessages(c.id);
        const unread = msgs.filter(m => m.senderType === "staff" && !m.readByCustomer).length;
        const latest = msgs[msgs.length - 1] ?? null;
        return { ...c, unreadCount: unread, latestMessage: latest };
      }));
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Customer: list active staff members (for "Send to" picker)
  app.get("/api/customer-portal/staff-members", isCustomerAuthenticated, async (_req, res) => {
    try {
      const allStaff = await storage.getStaff();
      const allUsers = await storage.getAllUsers();
      const active = allStaff.filter((s: any) => s.isActive !== false);
      const result = active.map((s: any) => {
        const user = s.userId ? allUsers.find((u: any) => u.id === s.userId) : null;
        const firstName = s.name ? s.name.split(" ")[0] : (user?.firstName || "Staff");
        return {
          id: s.id,
          firstName,
          fullName: s.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Staff",
          profileImageUrl: normalizeImgUrl(user?.profileImageUrl),
        };
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch staff members" });
    }
  });

  // Customer: start a new direct conversation
  app.post("/api/customer-portal/direct-conversations", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const trimmedSubject = typeof req.body.subject === "string" ? req.body.subject.trim() : req.body.subject;
      const data = insertConversationSchema.parse({ ...req.body, subject: trimmedSubject, customerId: customerUser.customerId });
      // Dedupe: reuse an existing open conversation with the same (subject + recipient) for this customer
      const existingConvos = await storage.getConversationsByCustomer(customerUser.customerId);
      const normalized = String(trimmedSubject || "").toLowerCase();
      const incomingRecipient = (data as any).staffRecipientId ?? null;
      const existing = existingConvos.find((c: any) =>
        c.status === "open"
        && String(c.subject || "").trim().toLowerCase() === normalized
        && (c.staffRecipientId ?? null) === incomingRecipient
      );
      const convo = existing ?? await storage.createConversation(data);
      if (req.body.message) {
        await storage.createConversationMessage({
          conversationId: convo.id,
          senderType: "customer",
          senderId: customerUserId,
          message: req.body.message,
        });
        // Notify staff (fire-and-forget)
        (async () => {
          try {
            const allCustomers = await storage.getCustomers();
            const customer = allCustomers.find(c => c.id === customerUser.customerId);
            const allUsers = await storage.getAllUsers();
            const staffEmailsToNotify = allUsers
              .filter((u: any) => u.role !== 'customer' && u.active && u.emailNotificationsMessages && u.email)
              .map((u: any) => u.email as string);
            if (staffEmailsToNotify.length > 0 && customer && shouldSendStaffNotification(`convo:${convo.id}`)) {
              await sendCustomerDirectMessageNotificationEmail(staffEmailsToNotify, {
                customerName: customer.name,
                subject: convo.subject,
                message: req.body.message,
              });
            }
          } catch (emailErr) {
            console.error("Failed to send staff direct message notification:", emailErr);
          }
        })();
      }
      res.json(convo);
    } catch (e) {
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Customer: get messages for a conversation (marks as read, enriched with sender info)
  app.get("/api/customer-portal/direct-conversations/:id/messages", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const convo = await storage.getConversation(req.params.id);
      if (!convo || convo.customerId !== customerUser.customerId) {
        console.error(`[DirectMsg] Access denied: convo=${req.params.id} convoCustomerId=${convo?.customerId} userCustomerId=${customerUser.customerId}`);
        return res.status(404).json({ error: "Not found" });
      }
      const msgs = await storage.getConversationMessages(req.params.id);
      await storage.markConversationMessagesReadByCustomer(req.params.id);
      const allStaff = await storage.getStaff();
      const allUsers = await storage.getAllUsers();
      const enriched = await Promise.all(msgs.map(async (m: any) => {
        try {
          if (m.senderType === "staff" && m.senderId) {
            const staffMember = allStaff.find((s: any) => s.id === m.senderId);
            const linkedUser = staffMember?.userId
              ? allUsers.find((u: any) => u.id === staffMember.userId)
              : allUsers.find((u: any) => String(u.id) === String(m.senderId));
            return {
              ...m,
              imageUrl: normalizeImgUrl(m.imageUrl),
              senderName: staffMember?.name || [linkedUser?.firstName, linkedUser?.lastName].filter(Boolean).join(" ") || null,
              senderImageUrl: normalizeImgUrl(linkedUser?.profileImageUrl),
            };
          }
          if (m.senderType === "customer" && m.senderId) {
            let cu: any = null;
            try { cu = await storage.getCustomerUserById(m.senderId); } catch { cu = null; }
            return {
              ...m,
              imageUrl: normalizeImgUrl(m.imageUrl),
              senderName: [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null,
              senderImageUrl: normalizeImgUrl(cu?.profileImageUrl),
            };
          }
          return { ...m, imageUrl: normalizeImgUrl(m.imageUrl), senderName: null, senderImageUrl: null };
        } catch (innerErr: any) {
          console.error(`[DirectMsg] enrich error msg=${m?.id}:`, innerErr?.message);
          return { ...m, imageUrl: normalizeImgUrl(m?.imageUrl), senderName: null, senderImageUrl: null };
        }
      }));
      res.json(enriched);
    } catch (e: any) {
      console.error(`[DirectMsg] Failed to fetch messages convo=${req.params.id}:`, e?.message, e?.stack);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Customer: archive a direct conversation
  app.put("/api/customer-portal/direct-conversations/:id/archive", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const convo = await storage.getConversation(req.params.id);
      if (!convo || convo.customerId !== customerUser.customerId) return res.status(403).json({ error: "Forbidden" });
      await storage.updateConversation(req.params.id, { status: "archived" });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to archive conversation" });
    }
  });

  // Customer: delete a direct conversation (soft-delete via status)
  app.delete("/api/customer-portal/direct-conversations/:id", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const convo = await storage.getConversation(req.params.id);
      if (!convo || convo.customerId !== customerUser.customerId) return res.status(403).json({ error: "Forbidden" });
      await storage.updateConversation(req.params.id, { status: "deleted" });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Customer: send a message in a direct conversation
  app.post("/api/customer-portal/direct-conversations/:id/messages", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = (req.session as any).impersonationCustomerUserId || (req.session as any).customerUserId;
      const customerUser = await storage.getCustomerUserById(customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const convo = await storage.getConversation(req.params.id);
      if (!convo || convo.customerId !== customerUser.customerId) {
        console.error(`[DirectMsg] Send denied: convo=${req.params.id} convoCustomerId=${convo?.customerId} userCustomerId=${customerUser.customerId}`);
        return res.status(404).json({ error: "Not found" });
      }
      const msg = await storage.createConversationMessage({
        conversationId: req.params.id,
        senderType: "customer",
        senderId: customerUserId,
        message: req.body.message || '',
        ...(req.body.imageUrl ? { imageUrl: req.body.imageUrl } : {}),
      });
      // Notify staff (fire-and-forget)
      (async () => {
        try {
          const allCustomers = await storage.getCustomers();
          const customer = allCustomers.find(c => c.id === customerUser.customerId);
          const allUsers = await storage.getAllUsers();
          const staffEmailsToNotify = allUsers
            .filter((u: any) => u.role !== 'customer' && u.active && u.emailNotificationsMessages && u.email)
            .map((u: any) => u.email as string);
          if (staffEmailsToNotify.length > 0 && customer && shouldSendStaffNotification(`convo:${req.params.id}`)) {
            await sendCustomerDirectMessageNotificationEmail(staffEmailsToNotify, {
              customerName: customer.name,
              subject: convo.subject,
              message: req.body.message,
            });
          }
        } catch (emailErr) {
          console.error("Failed to send staff direct message notification:", emailErr);
        }
      })();
      res.json(msg);
    } catch (e) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // ─── Samples ───────────────────────────────────────────────────────────────

  // Staff: list all samples (enriched with customer name + files)
  app.get("/api/staff/samples", isStaffAuthenticated, async (_req, res) => {
    try {
      const allSamples = await storage.getSamples();
      const customers = await storage.getCustomers();
      const custMap = new Map(customers.map(c => [c.id, c]));
      const enriched = await Promise.all(allSamples.map(async (s) => {
        const files = await storage.getSampleFiles(s.id);
        return { ...s, customerName: custMap.get(s.customerId)?.name ?? "Unknown", files };
      }));
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch samples" });
    }
  });

  // Staff: create a sample
  app.post("/api/staff/samples", isStaffAuthenticated, async (req: any, res) => {
    try {
      const data = insertSampleSchema.parse({ ...req.body, uploadedById: String(req.session.userId) });
      const sample = await storage.createSample(data);
      res.json(sample);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: "Failed to create sample" });
    }
  });

  // Staff: update a sample (status, title, description, notes)
  app.patch("/api/staff/samples/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const sample = await storage.updateSample(req.params.id, req.body);
      res.json(sample);
    } catch (e) {
      res.status(500).json({ error: "Failed to update sample" });
    }
  });

  // Staff: delete a sample
  app.delete("/api/staff/samples/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteSample(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete sample" });
    }
  });

  // Staff: attach a file to a sample
  app.post("/api/staff/samples/:id/files", isStaffAuthenticated, async (req: any, res) => {
    try {
      const sample = await storage.getSample(req.params.id);
      if (!sample) return res.status(404).json({ error: "Sample not found" });
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const rawKey = req.body.objectKey;
      if (!rawKey) return res.status(400).json({ error: "Missing objectKey" });
      const fileUrl = objectStorageService.normalizeObjectEntityPath(rawKey);
      const fileData = insertSampleFileSchema.parse({
        sampleId: req.params.id,
        fileName: req.body.fileName,
        fileUrl,
        fileSize: req.body.fileSize,
        fileType: req.body.fileType,
        uploadedBy: "staff",
        uploaderId: String(req.session.userId),
      });
      const file = await storage.createSampleFile(fileData);
      res.json(file);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: "Failed to attach file" });
    }
  });

  // Staff: delete a sample file
  app.delete("/api/staff/samples/:id/files/:fileId", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteSampleFile(req.params.fileId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Staff: upload URL for sample files
  app.post("/api/staff/samples/objects/upload", isStaffAuthenticated, async (_req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const { url, key } = await objectStorageService.getObjectEntityUploadURLWithKey();
      res.json({ url, key });
    } catch (e) {
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Customer: list their samples (with files)
  app.get("/api/customer-portal/samples", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById(req.session.customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const allSamples = await storage.getSamplesByCustomer(customerUser.customerId);
      const enriched = await Promise.all(allSamples.map(async (s) => {
        const files = await storage.getSampleFiles(s.id);
        return { ...s, files };
      }));
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch samples" });
    }
  });

  // Customer: get a single sample (with files) - ownership check
  app.get("/api/customer-portal/samples/:id", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById(req.session.customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const sample = await storage.getSample(req.params.id);
      if (!sample || sample.customerId !== customerUser.customerId) return res.status(404).json({ error: "Not found" });
      const files = await storage.getSampleFiles(sample.id);
      res.json({ ...sample, files });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch sample" });
    }
  });

  // Customer: approve a sample
  app.post("/api/customer-portal/samples/:id/approve", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById(req.session.customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const sample = await storage.getSample(req.params.id);
      if (!sample || sample.customerId !== customerUser.customerId) return res.status(404).json({ error: "Not found" });
      const updated = await storage.updateSample(req.params.id, { status: "approved", customerNotes: null });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: "Failed to approve sample" });
    }
  });

  // Customer: request amends on a sample
  app.post("/api/customer-portal/samples/:id/amends", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById(req.session.customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const sample = await storage.getSample(req.params.id);
      if (!sample || sample.customerId !== customerUser.customerId) return res.status(404).json({ error: "Not found" });
      const updated = await storage.updateSample(req.params.id, {
        status: "amends_required",
        customerNotes: req.body.notes || null,
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: "Failed to submit amends" });
    }
  });

  // Customer: upload file to their own sample (customer-uploaded reference files)
  app.post("/api/customer-portal/samples/:id/files", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById(req.session.customerUserId);
      if (!customerUser) return res.status(404).json({ error: "Not found" });
      const sample = await storage.getSample(req.params.id);
      if (!sample || sample.customerId !== customerUser.customerId) return res.status(404).json({ error: "Not found" });
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const rawKey = req.body.objectKey;
      if (!rawKey) return res.status(400).json({ error: "Missing objectKey" });
      const fileUrl = objectStorageService.normalizeObjectEntityPath(rawKey);
      const fileData = insertSampleFileSchema.parse({
        sampleId: req.params.id,
        fileName: req.body.fileName,
        fileUrl,
        fileSize: req.body.fileSize,
        fileType: req.body.fileType,
        uploadedBy: "customer",
        uploaderId: req.session.customerUserId,
      });
      const file = await storage.createSampleFile(fileData);
      res.json(file);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: "Failed to attach file" });
    }
  });

  // ─── Machine management ───────────────────────────────────────────
  app.get("/api/machines", isStaffAuthenticated, async (_req, res) => {
    const all = await storage.getMachines();
    res.json(all);
  });

  app.patch("/api/machines/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid machine id" });
      const data = updateMachineSchema.parse(req.body);
      const updated = await storage.updateMachine(id, data);
      res.json(updated);
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
      res.status(500).json({ error: "Failed to update machine" });
    }
  });

  // ─── Customer Portal: Team Management ───────────────────────────────────

  // List all team members for this customer
  app.get("/api/customer-portal/team", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });
      const members = await storage.getCustomerUsersByCustomerId(currentUser.customerId);
      res.json(members.map(({ passwordHash: _, ...m }) => m));
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch team" });
    }
  });

  // Add a new team member
  app.post("/api/customer-portal/team", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });

      const bodySchema = z.object({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().optional(),
        email: z.string().email("Valid email required"),
      });
      const { firstName, lastName, email } = bodySchema.parse(req.body);

      // Check for duplicate email
      const existing = await storage.getCustomerUserByEmail(email);
      if (existing) {
        if (existing.customerId === currentUser.customerId) {
          return res.status(409).json({ error: "This person is already a member of your team", alreadyMember: true });
        }
        return res.status(409).json({ error: "This email address is already registered in the portal under a different account. Please use a different email." });
      }

      // Generate a random placeholder password (user will set via invite link)
      const crypto = await import("crypto");
      const placeholderPassword = crypto.randomBytes(32).toString("hex");
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(placeholderPassword, 10);

      const newUser = await storage.createCustomerUser({
        customerId: currentUser.customerId,
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        mustResetPassword: true,
        active: true,
      });

      // Generate invite token (48 hours expiry)
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await storage.createCustomerInviteToken({ customerUserId: newUser.id, token, expiresAt });

      // Send invite email
      try {
        const customers = await storage.getCustomers();
        const customer = customers.find(c => c.id === currentUser.customerId);
        const companyName = customer?.name || "Select Branding";
        const inviterName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.email;
        const baseUrl = getBaseUrl();
        await sendTeamInviteEmail(email, {
          firstName: firstName || null,
          inviterName,
          companyName,
          inviteUrl: `${baseUrl}/customer/invite?token=${token}`,
          isReset: false,
        });
      } catch (emailErr) {
        console.error("Failed to send invite email:", emailErr);
      }

      res.json(newUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors.map(e => e.message).join(", ") });
      } else if (error instanceof Error && error.message.includes("already exists")) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : "Failed to add team member" });
      }
    }
  });

  // Send / resend a password-reset invite link to a team member
  app.post("/api/customer-portal/team/:id/send-invite", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });
      const target = await storage.getCustomerUserById(req.params.id);
      if (!target || target.customerId !== currentUser.customerId) return res.status(403).json({ error: "Forbidden" });

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await storage.createCustomerInviteToken({ customerUserId: target.id, token, expiresAt });

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === currentUser.customerId);
      const companyName = customer?.name || "Select Branding";
      const inviterName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.email;
      const baseUrl = getBaseUrl();
      await sendTeamInviteEmail(target.email, {
        firstName: target.firstName || null,
        inviterName,
        companyName,
        inviteUrl: `${baseUrl}/customer/invite?token=${token}`,
        isReset: true,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to send invite:", error);
      res.status(500).json({ error: "Failed to send reset link" });
    }
  });

  // Toggle active status for a team member
  app.put("/api/customer-portal/team/:id/profile-picture", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });
      const target = await storage.getCustomerUserById(req.params.id);
      if (!target || target.customerId !== currentUser.customerId) return res.status(403).json({ error: "Forbidden" });
      const { profileImageUrl } = z.object({ profileImageUrl: z.string() }).parse(req.body);
      await storage.updateCustomerUserProfileImage(req.params.id, profileImageUrl);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update profile picture" });
    }
  });

  app.patch("/api/customer-portal/team/:id/active", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });
      const target = await storage.getCustomerUserById(req.params.id);
      if (!target || target.customerId !== currentUser.customerId) return res.status(403).json({ error: "Forbidden" });
      if (target.id === currentUser.id) return res.status(400).json({ error: "You cannot deactivate your own account" });
      const { active } = z.object({ active: z.boolean() }).parse(req.body);
      await storage.updateCustomerActive(req.params.id, active);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Failed to update team member" });
    }
  });

  // Reset password for a team member
  app.post("/api/customer-portal/team/:id/reset-password", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });
      const target = await storage.getCustomerUserById(req.params.id);
      if (!target || target.customerId !== currentUser.customerId) return res.status(403).json({ error: "Forbidden" });
      const { password } = z.object({ password: z.string().min(8, "Password must be at least 8 characters") }).parse(req.body);
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(password, 10);
      await storage.updateCustomerPassword(req.params.id, passwordHash);
      await storage.updateCustomerMustResetPassword(req.params.id, true);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors.map(e => e.message).join(", ") });
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Delete a team member (cannot delete yourself)
  app.delete("/api/customer-portal/team/:id", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });
      const target = await storage.getCustomerUserById(req.params.id);
      if (!target || target.customerId !== currentUser.customerId) return res.status(403).json({ error: "Forbidden" });
      if (target.id === currentUser.id) return res.status(400).json({ error: "You cannot delete your own account" });
      await storage.deleteCustomerUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete team member" });
    }
  });

  // ─── Customer Portal: Invoice History ────────────────────────────────────

  app.get("/api/customer-portal/invoices", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === currentUser.customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      // Fetch "ready" jobs (completed, awaiting Xero invoicing)
      const allJobs = await storage.getJobsByCustomerId(currentUser.customerId);
      const readyJobs = allJobs.filter(j => j.invoiceStatus === "ready");
      const awaitingInvoice = await Promise.all(
        readyJobs.map(async (job) => {
          const lineItems = await storage.getJobLineItems(job.id);
          return {
            id: job.id,
            jobNumber: job.jobNumber,
            description: job.description,
            dispatchDate: job.requiredDispatchDate,
            lineItems: lineItems.map(li => ({
              jobType: li.jobType,
              description: li.description,
              quantity: li.quantity,
              stitchCount: li.stitchCount,
            })),
            totalQuantity: lineItems.reduce((s, li) => s + li.quantity, 0),
          };
        })
      );

      // Fetch actual Xero invoices for this contact
      let xeroInvoices: any[] = [];
      const xeroConnected = xeroService.isConfigured() && xeroService.isConnected();
      if (xeroConnected) {
        const contact = await xeroService.findContact(customer);
        if (contact) {
          // Persist the found Xero contact ID so future lookups skip the search entirely
          if (!customer.xeroContactId || customer.xeroContactId !== contact.contactID) {
            await storage.updateCustomer(customer.id, { xeroContactId: contact.contactID });
          }
          xeroInvoices = await xeroService.getInvoicesForContact(contact.contactID);
        }
      }

      res.json({ awaitingInvoice, xeroInvoices, xeroConnected });
    } catch (e) {
      console.error("Failed to fetch invoice history:", e);
      res.status(500).json({ error: "Failed to fetch invoice history" });
    }
  });

  // Returns the customer's unpaid invoices that are more than 30 days old.
  // Used to warn customers when submitting a new job that we may not be able to
  // process the order while older invoices remain unpaid.
  app.get("/api/customer-portal/overdue-invoices", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.impersonationCustomerUserId || req.session.customerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });

      const customers = await storage.getCustomers();
      const customer = customers.find(c => c.id === currentUser.customerId);
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      // Xero invoice dates can come back as ISO strings or in the legacy
      // "/Date(1234567890000+0000)/" format, so parse both robustly.
      const parseXeroDate = (raw: string | null | undefined): number => {
        if (!raw) return NaN;
        const msMatch = raw.match(/\/Date\((\d+)([+-]\d+)?\)\//);
        if (msMatch) return parseInt(msMatch[1]);
        return new Date(raw).getTime();
      };

      let overdueInvoices: Array<{
        invoiceNumber: string;
        date: string;
        dueDate: string;
        amountDue: number;
        total: number;
        daysOld: number;
      }> = [];

      const xeroConnected = xeroService.isConfigured() && xeroService.isConnected();
      if (xeroConnected) {
        const contact = await xeroService.findContact(customer);
        if (contact) {
          if (!customer.xeroContactId || customer.xeroContactId !== contact.contactID) {
            await storage.updateCustomer(customer.id, { xeroContactId: contact.contactID });
          }
          const invoices = await xeroService.getInvoicesForContact(contact.contactID);
          const now = Date.now();
          const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
          overdueInvoices = invoices
            .filter((inv) => {
              const isUnpaid = (inv.Status === "AUTHORISED" || inv.Status === "SUBMITTED") && (inv.AmountDue ?? 0) > 0;
              if (!isUnpaid) return false;
              const invDate = parseXeroDate(inv.Date);
              if (isNaN(invDate)) return false;
              return now - invDate > THIRTY_DAYS_MS;
            })
            .map((inv) => ({
              invoiceNumber: inv.InvoiceNumber,
              date: inv.Date,
              dueDate: inv.DueDate,
              amountDue: inv.AmountDue ?? 0,
              total: inv.Total ?? 0,
              daysOld: Math.floor((now - parseXeroDate(inv.Date)) / (24 * 60 * 60 * 1000)),
            }));
        }
      }

      res.json({ overdueInvoices, hasOverdue: overdueInvoices.length > 0, xeroConnected });
    } catch (e) {
      console.error("Failed to fetch overdue invoices:", e);
      res.status(500).json({ error: "Failed to fetch overdue invoices" });
    }
  });

  // ─── DPD Shipping API ─────────────────────────────────────────────────────

  app.get("/api/dpd/status", isStaffAuthenticated, async (req, res) => {
    res.json({ configured: dpdService.isConfigured() });
  });

  app.post("/api/dpd/book-shipment", isStaffAuthenticated, async (req, res) => {
    try {
      if (!dpdService.isConfigured()) {
        return res.status(503).json({ error: "DPD API credentials are not configured" });
      }

      const {
        jobId,
        jobIds, // array for consolidated shipments
        recipientName,
        recipientStreet,
        recipientHouseNo,
        recipientCity,
        recipientPostcode,
        recipientCountry,
        recipientPhone,
        recipientEmail,
        packageCount,
        packageWeightGrams,
        reference,
      } = req.body;

      if (!recipientName || !recipientStreet || !recipientCity || !recipientPostcode) {
        return res.status(400).json({ error: "Recipient name, street, city and postcode are required" });
      }

      const allJobIds: string[] = jobIds?.length ? jobIds : [jobId].filter(Boolean);
      if (!allJobIds.length) {
        return res.status(400).json({ error: "At least one job ID is required" });
      }

      // Verify all jobs exist
      const jobs = await Promise.all(allJobIds.map(id => storage.getJob(id)));
      const validJobs = jobs.filter(Boolean);
      if (!validJobs.length) {
        return res.status(404).json({ error: "Jobs not found" });
      }

      // Build parcel list
      const count = Math.max(1, parseInt(packageCount) || 1);
      const weightGrams = Math.max(100, parseInt(packageWeightGrams) || 1000);
      const parcels = Array.from({ length: count }, (_, i) => ({
        weight: weightGrams,
        customerReference: reference || `JOB-${allJobIds[0].slice(0, 8)}${count > 1 ? `-${i + 1}` : ""}`,
      }));

      const result = await dpdService.createShipment({
        recipient: {
          name: recipientName,
          street: recipientStreet,
          houseNo: recipientHouseNo || "",
          city: recipientCity,
          zipCode: recipientPostcode,
          country: recipientCountry || "GB",
          phone: recipientPhone || "",
          email: recipientEmail || "",
        },
        parcels,
        reference: reference || `JOB-${allJobIds[0].slice(0, 8)}`,
        notifyEmail: recipientEmail || undefined,
      });

      // Save the tracking number to all jobs
      await Promise.all(
        allJobIds.map(id =>
          storage.updateJob(id, { dhlTrackingNumber: result.trackingNumber.trim() })
        )
      );

      // Send dispatch notification emails to opted-in customer users
      try {
        // Group jobs by customer so we send one email per customer
        const customerJobMap = new Map<string, { jobNames: string[]; customerName: string; logoUrl: string | null }>();
        for (const job of validJobs) {
          if (!job) continue;
          const customerId = job.customerId;
          if (!customerJobMap.has(customerId)) {
            const customer = await storage.getCustomer(customerId);
            customerJobMap.set(customerId, {
              jobNames: [],
              customerName: customer?.name ?? "Customer",
              logoUrl: customer?.logoUrl ?? null,
            });
          }
          customerJobMap.get(customerId)!.jobNames.push(job.jobName);
        }

        const portalUrl = `${process.env.REPLIT_DEPLOYMENT_URL || process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://your-portal.com"}/customer/orders`;

        for (const [customerId, { jobNames, customerName, logoUrl }] of customerJobMap) {
          const customerUsersList = await storage.getCustomerUsersByCustomerId(customerId);
          const emailsToNotify = customerUsersList
            .filter(u => u.active && u.emailNotificationsDispatch && u.email)
            .map(u => u.email);

          if (emailsToNotify.length > 0) {
            sendDispatchNotificationEmail(emailsToNotify, {
              customerName,
              jobNames,
              trackingNumber: result.trackingNumber.trim(),
              portalUrl,
              customerLogoUrl: logoUrl,
            }).catch(err => console.error("[DPD] Dispatch email error:", err));
          }
        }
      } catch (emailErr) {
        console.error("[DPD] Failed to send dispatch notification emails:", emailErr);
      }

      res.json({
        trackingNumber: result.trackingNumber,
        labelPdfBase64: result.labelPdfBase64,
        parcelNumbers: result.parcelNumbers,
      });
    } catch (e: any) {
      console.error("[DPD] Book shipment error:", e);
      res.status(500).json({ error: e.message || "Failed to book DPD shipment" });
    }
  });

  app.get("/api/customer-portal/invoices/:invoiceId/pdf", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUserId = req.session.customerUserId || req.session.impersonationCustomerUserId;
      const currentUser = await storage.getCustomerUserById(customerUserId);
      if (!currentUser) return res.status(404).json({ error: "Not found" });

      const { invoiceId } = req.params;
      const pdfResponse = await xeroService.streamInvoicePdf(invoiceId);

      if (!pdfResponse.ok) {
        const errorBody = await pdfResponse.text().catch(() => "(unreadable)");
        console.error(`Xero PDF fetch failed: status=${pdfResponse.status}, body=${errorBody}`);
        return res.status(502).json({ error: "Could not retrieve PDF from Xero" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceId}.pdf"`);
      const buffer = await pdfResponse.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (e) {
      console.error("Failed to fetch invoice PDF:", e);
      res.status(500).json({ error: "Failed to fetch invoice PDF" });
    }
  });

  // ── Google Drive invoice verification ─────────────────────────────────────
  // Uses @replit/connectors-sdk to access Google Drive + Sheets

  app.get("/api/google-drive/customer-rows", isStaffAuthenticated, async (req, res) => {
    try {
      const { customerName } = req.query;
      if (!customerName || typeof customerName !== "string") {
        return res.status(400).json({ error: "customerName is required" });
      }
      const { getCustomerDriveRows } = await import("./googleService.js");
      const result = await getCustomerDriveRows(customerName);
      if (!result) {
        return res.status(404).json({ error: "No Google Drive folder or spreadsheet found for this customer" });
      }
      res.json(result);
    } catch (err: any) {
      console.error("[Google Drive] Failed to fetch customer rows:", err);
      res.status(500).json({ error: err.message || "Failed to fetch Drive data" });
    }
  });

  app.post("/api/google-drive/hide-rows", isStaffAuthenticated, async (req, res) => {
    try {
      const { spreadsheetId, sheetNumericId, rowIndices } = req.body;
      if (!spreadsheetId || !Array.isArray(rowIndices) || rowIndices.length === 0) {
        return res.status(400).json({ error: "spreadsheetId and rowIndices are required" });
      }
      const { hideDriveRows } = await import("./googleService.js");
      await hideDriveRows(spreadsheetId, sheetNumericId ?? 0, rowIndices);
      res.json({ success: true, hidden: rowIndices.length });
    } catch (err: any) {
      console.error("[Google Drive] Failed to hide rows:", err);
      res.status(500).json({ error: err.message || "Failed to hide rows" });
    }
  });

  // ─── Feature Requests ───────────────────────────────────────────────────────

  // Staff: submit a feature request
  app.post("/api/feature-requests", isStaffAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const { title, description } = req.body;
      if (!title || !description) return res.status(400).json({ error: "title and description are required" });
      const [created] = await db.insert(featureRequests).values({
        title: title.trim(),
        description: description.trim(),
        submitterType: "staff",
        submitterName: user.name || user.email || "Staff",
        submitterEmail: user.email || null,
      }).returning();
      const { sendFeatureRequestNotificationEmail } = await import("./emailService.js");
      sendFeatureRequestNotificationEmail({
        title: created.title,
        description: created.description,
        submitterName: created.submitterName,
        submitterType: created.submitterType,
        submitterEmail: created.submitterEmail,
      }).catch(e => console.error("Feature request email failed:", e));
      res.json(created);
    } catch (err: any) {
      console.error("[FeatureRequests] POST staff:", err);
      res.status(500).json({ error: "Failed to submit feature request" });
    }
  });

  // Customer: submit a feature request
  app.post("/api/customer-portal/feature-requests", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = req.customerUser;
      const { title, description } = req.body;
      if (!title || !description) return res.status(400).json({ error: "title and description are required" });
      const [created] = await db.insert(featureRequests).values({
        title: title.trim(),
        description: description.trim(),
        submitterType: "customer",
        submitterName: customerUser.name || customerUser.email || "Customer",
        submitterEmail: customerUser.email || null,
      }).returning();
      const { sendFeatureRequestNotificationEmail } = await import("./emailService.js");
      sendFeatureRequestNotificationEmail({
        title: created.title,
        description: created.description,
        submitterName: created.submitterName,
        submitterType: created.submitterType,
        submitterEmail: created.submitterEmail,
      }).catch(e => console.error("Feature request email failed:", e));
      res.json(created);
    } catch (err: any) {
      console.error("[FeatureRequests] POST customer:", err);
      res.status(500).json({ error: "Failed to submit feature request" });
    }
  });

  // Super admin: list all feature requests
  app.get("/api/feature-requests", isStaffAuthenticated, requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(featureRequests).orderBy(featureRequests.createdAt);
      res.json(rows);
    } catch (err: any) {
      console.error("[FeatureRequests] GET:", err);
      res.status(500).json({ error: "Failed to fetch feature requests" });
    }
  });

  // Super admin: update status / priority / notes
  app.patch("/api/feature-requests/:id", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, priority, adminNotes } = req.body;
      const updates: Record<string, unknown> = {};
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority === null ? null : Number(priority);
      if (adminNotes !== undefined) updates.adminNotes = adminNotes;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
      const [updated] = await db.update(featureRequests).set(updates).where(eq(featureRequests.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      console.error("[FeatureRequests] PATCH:", err);
      res.status(500).json({ error: "Failed to update feature request" });
    }
  });

  // ── Message: Mark as Unread ─────────────────────────────────────────────────

  // Staff: mark a job message unread (so badge reappears)
  app.patch("/api/staff/messages/job/:messageId/mark-unread", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.markJobMessageUnread(req.params.messageId, 'readByStaff');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark message unread" });
    }
  });

  // Staff: mark a direct conversation message unread
  app.patch("/api/staff/messages/direct/:messageId/mark-unread", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.markConversationMessageUnread(req.params.messageId, 'readByStaff');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark message unread" });
    }
  });

  // Customer: mark a job message unread
  app.patch("/api/customer-portal/messages/job/:messageId/mark-unread", isCustomerAuthenticated, async (req, res) => {
    try {
      await storage.markJobMessageUnread(req.params.messageId, 'readByCustomer');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark message unread" });
    }
  });

  // Customer: mark a direct conversation message unread
  app.patch("/api/customer-portal/messages/direct/:messageId/mark-unread", isCustomerAuthenticated, async (req, res) => {
    try {
      await storage.markConversationMessageUnread(req.params.messageId, 'readByCustomer');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark message unread" });
    }
  });

  // ── Message Reminders ────────────────────────────────────────────────────────

  // Staff: get pending reminders
  app.get("/api/staff/messages/reminders", isStaffAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const reminders = await storage.getMessageReminders(userId, 'staff');
      res.json(reminders);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch reminders" });
    }
  });

  // Staff: create a reminder
  app.post("/api/staff/messages/reminders", isStaffAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const { messageId, messageType, remindAt, messagePreview } = req.body;
      if (!messageId || !messageType || !remindAt) return res.status(400).json({ error: "Missing fields" });
      const reminder = await storage.createMessageReminder({
        messageId,
        messageType,
        userId,
        userType: 'staff',
        remindAt: new Date(remindAt),
        messagePreview: messagePreview || null,
        dismissed: false,
      });
      res.json(reminder);
    } catch (err) {
      res.status(500).json({ error: "Failed to create reminder" });
    }
  });

  // Staff: dismiss a reminder
  app.patch("/api/staff/messages/reminders/:id/dismiss", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.dismissMessageReminder(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to dismiss reminder" });
    }
  });

  // Staff: delete a reminder
  app.delete("/api/staff/messages/reminders/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteMessageReminder(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete reminder" });
    }
  });

  // Customer: get pending reminders
  app.get("/api/customer-portal/messages/reminders", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const userId = req.customerUser?.id;
      const reminders = await storage.getMessageReminders(userId, 'customer');
      res.json(reminders);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch reminders" });
    }
  });

  // Customer: create a reminder
  app.post("/api/customer-portal/messages/reminders", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const userId = req.customerUser?.id;
      const { messageId, messageType, remindAt, messagePreview } = req.body;
      if (!messageId || !messageType || !remindAt) return res.status(400).json({ error: "Missing fields" });
      const reminder = await storage.createMessageReminder({
        messageId,
        messageType,
        userId,
        userType: 'customer',
        remindAt: new Date(remindAt),
        messagePreview: messagePreview || null,
        dismissed: false,
      });
      res.json(reminder);
    } catch (err) {
      res.status(500).json({ error: "Failed to create reminder" });
    }
  });

  // Customer: dismiss a reminder
  app.patch("/api/customer-portal/messages/reminders/:id/dismiss", isCustomerAuthenticated, async (req, res) => {
    try {
      await storage.dismissMessageReminder(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to dismiss reminder" });
    }
  });

  // Customer: delete a reminder
  app.delete("/api/customer-portal/messages/reminders/:id", isCustomerAuthenticated, async (req, res) => {
    try {
      await storage.deleteMessageReminder(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete reminder" });
    }
  });

  // ── Tasks ──────────────────────────────────────────────────────────────────

  app.get("/api/tasks", isStaffAuthenticated, async (req: any, res) => {
    try {
      const { assignedTo, status } = req.query as { assignedTo?: string; status?: string };
      const taskList = await storage.getTasks({ assignedToUserId: assignedTo, status });
      res.json(taskList);
    } catch {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.get("/api/tasks/count", isStaffAuthenticated, async (_req, res) => {
    try {
      const count = await storage.getOpenTaskCount();
      res.json({ count });
    } catch {
      res.status(500).json({ error: "Failed to get task count" });
    }
  });

  app.post("/api/tasks", isStaffAuthenticated, async (req: any, res) => {
    try {
      const parsed = insertTaskSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
      const task = await storage.createTask({ ...parsed.data, createdByUserId: req.session.userId });
      res.json(task);
    } catch {
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", isStaffAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { completedAt, ...rest } = req.body;
      const updateData: any = { ...rest };
      if (completedAt !== undefined) updateData.completedAt = completedAt ? new Date(completedAt) : null;
      const task = await storage.updateTask(id, updateData);
      res.json(task);
    } catch {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", isStaffAuthenticated, async (req, res) => {
    try {
      await storage.deleteTask(parseInt(req.params.id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // ─── Thread Colour Library ────────────────────────────────────────────────

  // Public endpoint — accessible to staff and customers without auth
  app.get("/api/thread-library", async (_req, res) => {
    try {
      const colours = await storage.getThreadColours();
      res.json(colours);
    } catch {
      res.status(500).json({ error: "Failed to fetch thread colours" });
    }
  });

  // Staff only — import a .TCH file (UTF-16 LE CSV: code,chart,name,flag,r,g,b)
  app.post("/api/thread-library/import-tch", isStaffAuthenticated, async (req, res) => {
    try {
      // Expect raw body as base64 string: { data: "<base64>" }
      const { data: b64 } = req.body as { data: string };
      if (!b64) return res.status(400).json({ error: "No data provided" });

      const buf = Buffer.from(b64, "base64");

      // Detect UTF-16 LE BOM (FF FE)
      let text: string;
      if (buf[0] === 0xff && buf[1] === 0xfe) {
        text = buf.slice(2).toString("utf16le");
      } else {
        text = buf.toString("utf8");
      }

      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      const colours: any[] = [];

      for (const line of lines) {
        const parts = line.split(",").map(p => p.trim());
        if (parts.length < 7) continue;
        const [code, chart, name, flag, rStr, gStr, bStr] = parts;
        const r = parseInt(rStr, 10);
        const g = parseInt(gStr, 10);
        const b = parseInt(bStr, 10);
        if (!code || isNaN(r) || isNaN(g) || isNaN(b)) continue;
        colours.push({ code, chart, name, flag, r, g, b });
      }

      if (colours.length === 0) {
        return res.status(400).json({ error: "No valid thread colour entries found in file" });
      }

      await storage.clearThreadColours();
      await storage.upsertThreadColours(colours);
      res.json({ imported: colours.length });
    } catch (error) {
      console.error("TCH import error:", error);
      res.status(500).json({ error: "Failed to import TCH file" });
    }
  });

  // Staff only — fetch colour codes from the Google Sheet (3 tabs: Classic 40, Classic 60, Poly Neon 60)
  app.get("/api/thread-library/sheet-colours", isStaffAuthenticated, async (_req, res) => {
    try {
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();
      const SHEET_ID = "1mxsnnNoe-DwJGwlGh980x19euie-c-Ek0ug3pGBw3vs";
      const TABS = ["Classic 40", "Classic 60", "Poly Neon 60"];

      const results: Record<string, string[]> = {};
      await Promise.all(
        TABS.map(async (tab) => {
          const r = await connectors.proxy(
            "google-sheet",
            `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab)}!A1:A1000`,
            { method: "GET" }
          );
          const data = await r.json();
          const codes: string[] = (data.values || [])
            .map((row: string[]) => (row[0] || "").trim())
            .filter(Boolean);
          if (codes.length > 0) results[tab] = codes;
        })
      );

      res.json(results);
    } catch (error) {
      console.error("Sheet colours fetch error:", error);
      res.status(500).json({ error: "Failed to fetch sheet colours" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
