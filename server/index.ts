import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes, autoScheduleLineItem } from "./routes";
import { PRINT_MACHINE_ID, isPrintJobType } from "@shared/machines";
import { setupVite, serveStatic, log } from "./vite";
import { getSession } from "./replitAuth";
import { storage } from "./storage";
import { xeroService } from "./xero";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { scheduleDailyReEngagementCheck } from "./reEngagement";
import { scheduleFortnightlyRecalibration } from "./calibration";
import { scheduleInactiveCustomerChecks } from "./inactiveCustomers";
import { scheduleWeeklySummary } from "./weeklySummary";
import { scheduleOverdueInvoiceReminders } from "./overdueInvoiceReminders";
import { scheduleWeeklyArticleCampaign } from "./highLevelCampaign";
import { startCustomerOrderNotificationRetryWorker } from "./customerOrderNotifications";
import { scheduleAwaitingGarmentsReminders } from "./awaitingGarmentsReminders";

const app = express();
// Allow the HighLevel landing page to use the public callback API.
app.use("/api/callback", (req, res, next) => {
  const allowedOrigin = "https://go.selectbranding.co.uk";
  res.vary("Origin");
  if (req.get("Origin") !== allowedOrigin) {
    return next();
  }
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

app.set("trust proxy", 1);
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(getSession());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Backfill customer created_at from earliest job date (idempotent — only touches null/today rows)
  try {
    await db.execute(sql`
      UPDATE customers
      SET created_at = sub.earliest_date
      FROM (
        SELECT
          j.customer_id,
          MIN(COALESCE(j.submitted_at, j.approved_at, j.invoiced_at)) AS earliest_date
        FROM jobs j
        WHERE j.customer_id IS NOT NULL
          AND COALESCE(j.submitted_at, j.approved_at, j.invoiced_at) IS NOT NULL
        GROUP BY j.customer_id
      ) sub
      WHERE customers.id = sub.customer_id
        AND sub.earliest_date IS NOT NULL
        AND (
          customers.created_at IS NULL
          OR customers.created_at::date = CURRENT_DATE
        )
    `);
    log("Customer created_at backfill complete");
  } catch (e) {
    log(`Customer created_at backfill skipped: ${e}`);
  }

  await storage.seedMachines();
  await storage.ensureProductionMachineRoster();
  await storage.ensurePrintMachine();

  // Backfill the dedicated Print machine without changing job ownership.
  try {
    const printMachine = await storage.getMachine(PRINT_MACHINE_ID);
    const jobsById = new Map((await storage.getJobs()).map(job => [job.id, job]));
    const printItems = (await storage.getAllJobLineItems()).filter(
      (li) =>
        isPrintJobType(li.jobType) &&
        (li.machineId !== PRINT_MACHINE_ID ||
          li.operatorId !== (jobsById.get(li.jobId)?.responsibleOperatorId ?? null)),
    );
    if (printItems.length > 0) {
      for (const li of printItems) {
        const operatorId = jobsById.get(li.jobId)?.responsibleOperatorId ?? null;
        await storage.updateJobLineItem(li.id, {
          machineId: PRINT_MACHINE_ID,
          operatorId,
        });
        if (!li.completed) await autoScheduleLineItem(li.id);
      }
      log(`Backfilled ${printItems.length} Print line item(s) onto the Print machine`);
    }
  } catch (e) {
    log(`Print backfill skipped: ${e}`);
  }

  await xeroService.loadTokensFromDb();
  scheduleDailyReEngagementCheck();
  scheduleFortnightlyRecalibration();
  scheduleInactiveCustomerChecks();
  scheduleWeeklySummary();
  scheduleOverdueInvoiceReminders();
  scheduleAwaitingGarmentsReminders();
  scheduleWeeklyArticleCampaign();
  startCustomerOrderNotificationRetryWorker();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
