import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCustomerSchema, insertJobSchema, updateJobSchema } from "@shared/schema";
import { z } from "zod";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { xeroService } from "./xero";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Optional auth middleware - allows both authenticated and guest access
  const optionalAuth = (req: any, res: any, next: any) => {
    // Skip authentication check, allow all requests
    next();
  };

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

  // Customer routes
  app.get("/api/customers", optionalAuth, async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.post("/api/customers", optionalAuth, async (req, res) => {
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

  // Job routes
  app.get("/api/jobs", optionalAuth, async (req, res) => {
    try {
      const { machineId } = req.query;
      
      let jobs;
      if (machineId) {
        jobs = await storage.getJobsByMachine(parseInt(machineId as string));
      } else {
        jobs = await storage.getJobs();
      }
      
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.post("/api/jobs", optionalAuth, async (req, res) => {
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

  app.patch("/api/jobs/:id", optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const data = updateJobSchema.parse(req.body);
      
      // Remove undefined keys from updates
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      
      const job = await storage.updateJob(id, updates);
      res.json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update job" });
      }
    }
  });

  app.delete("/api/jobs/:id", optionalAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteJob(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // Xero integration routes
  app.get("/api/xero/status", optionalAuth, async (req, res) => {
    res.json({ 
      configured: xeroService.isConfigured(),
      message: xeroService.isConfigured() 
        ? "Xero integration is configured" 
        : "Xero credentials not set. Please configure XERO_CLIENT_ID, XERO_CLIENT_SECRET, and XERO_TENANT_ID environment variables."
    });
  });

  app.post("/api/xero/invoice/:jobId", optionalAuth, async (req, res) => {
    try {
      const { jobId } = req.params;
      const { unitPrice } = req.body;

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

      const invoice = await xeroService.createInvoice(job, customer, unitPrice || 0);
      res.json(invoice);
    } catch (error) {
      console.error("Xero invoice creation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create invoice in Xero" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
