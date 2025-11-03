import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
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
  insertLogoSetupSchema,
  updateLogoSetupSchema
} from "@shared/schema";
import { z } from "zod";
import { xeroService } from "./xero";
import { calculateJobPrice, calculateShippingCost } from "@shared/pricing";
import { loginCustomer, registerCustomer, isCustomerAuthenticated, attachCustomerUser } from "./customerAuth";
import { loginStaff, registerStaff, isStaffAuthenticated, attachUser } from "./staffAuth";
import { customerLoginSchema, insertCustomerUserSchema, staffLoginSchema, staffRegisterSchema, passwordResetRequestSchema, passwordResetConfirmSchema } from "@shared/schema";
import { setupProductionDatabase } from "./setup-production";
import { checkRateLimit, resetRateLimit } from "./rateLimiter";
import { requestPasswordReset, confirmPasswordReset } from "./passwordReset";
import { sendPasswordResetEmail } from "./emailService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Production database setup endpoint (only in production)
  if (process.env.NODE_ENV === 'production') {
    app.get('/api/setup-production', setupProductionDatabase);
  }

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
      res.json(userWithoutPassword);
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
      
      const user = await storage.getUser(req.session.userId);
      
      if (!user || user.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      
      next();
    } catch (error) {
      console.error("Error checking super admin status:", error);
      res.status(500).json({ error: "Authorization check failed" });
    }
  };

  // User management routes - protected for super admins only
  app.get("/api/users", isStaffAuthenticated, requireSuperAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
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
  app.post("/api/customer-auth/register", async (req, res) => {
    try {
      const data = insertCustomerUserSchema.extend({
        customerId: z.string(),
      }).parse(req.body);
      
      const customerUser = await registerCustomer(data);
      res.json(customerUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
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
      
      res.json(customerUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(401).json({ error: error instanceof Error ? error.message : "Login failed" });
      }
    }
  });

  app.post("/api/customer-auth/logout", (req, res) => {
    (req.session as any).customerUserId = undefined;
    res.json({ success: true });
  });

  app.get("/api/customer-auth/user", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById((req.session as any).customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }
      
      // Return without password hash
      const { passwordHash: _, ...user } = customerUser;
      res.json(user);
    } catch (error) {
      console.error("Error fetching customer user:", error);
      res.status(500).json({ error: "Failed to fetch customer user" });
    }
  });

  // Customer Portal - Jobs (read-only for now)
  app.get("/api/customer-portal/jobs", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById((req.session as any).customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }
      
      // Get all jobs for this customer
      const jobs = await storage.getJobsByCustomerId(customerUser.customerId);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching customer jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
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

  // Staff routes
  app.get("/api/staff", isStaffAuthenticated, async (req, res) => {
    try {
      const staff = await storage.getStaff();
      res.json(staff);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch staff" });
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
      res.json({ ...job, lineItems });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  app.get("/api/jobs", isStaffAuthenticated, async (req, res) => {
    try {
      const { machineId } = req.query;
      
      let jobs;
      if (machineId) {
        jobs = await storage.getJobsByMachine(parseInt(machineId as string));
      } else {
        jobs = await storage.getJobs();
      }
      
      // Enrich each job with its line items
      const jobsWithLineItems = await Promise.all(
        jobs.map(async (job) => ({
          ...job,
          lineItems: await storage.getJobLineItems(job.id),
        }))
      );
      
      res.json(jobsWithLineItems);
    } catch (error) {
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
              dhlTrackingNumber: updates.dhlTrackingNumber as string | null,
              packageType: updates.packageType as string,
              packageCount: updates.packageCount as number,
              shippingCost: null, // Don't duplicate shipping cost on consolidated jobs
              completed: true, // Mark as completed
              invoiceStatus: "ready", // Ready for invoicing
            });
          }
        } else {
          // Creating a single-job consolidated shipment (for future consolidation)
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

  app.delete("/api/jobs/:id", isStaffAuthenticated, async (req, res) => {
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
      const lineItem = await storage.createJobLineItem(data);
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
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      const lineItem = await storage.updateJobLineItem(req.params.id, updates);
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
      await storage.deleteJobLineItem(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete line item" });
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
      const { jobId, machineId, staffId, startDate, endDate } = req.query;
      const schedules = await storage.getJobSchedules(
        jobId as string | undefined,
        machineId ? parseInt(machineId as string) : undefined,
        staffId as string | undefined,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
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

  // Xero integration routes
  app.get("/api/xero/status", isStaffAuthenticated, async (req, res) => {
    res.json({ 
      configured: xeroService.isConfigured(),
      message: xeroService.isConfigured() 
        ? "Xero integration is configured" 
        : "Xero credentials not set. Please configure XERO_CLIENT_ID, XERO_CLIENT_SECRET, and XERO_TENANT_ID environment variables."
    });
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
        
        // Determine item code based on job type
        let itemCode = "EMB"; // Default to embroidery
        if (lineItem.jobType === "print") {
          itemCode = "Print DTF";
        } else if (lineItem.jobType === "bagging") {
          itemCode = "BAG";
        } else if (lineItem.jobType === "other") {
          itemCode = "OTHER";
        }
        
        return {
          jobName: job.jobName,
          poNumber: job.poNumber,
          description: lineItem.description || '',
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
          unitPrice: 10, // £10 per approved logo setup
          stitchCount: 0,
          itemCode: "OTHER", // Use OTHER item code for logo setups
        });
      }

      const invoice = await xeroService.createInvoice(job, customer, lineItemsWithPricing);
      
      // Only delete logo setups after successful invoice creation
      for (const setup of customerLogoSetups) {
        await storage.deleteLogoSetup(setup.id);
      }
      
      res.json(invoice);
    } catch (error) {
      console.error("Xero invoice creation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create invoice in Xero" 
      });
    }
  });

  app.post("/api/xero/consolidated-invoice", isStaffAuthenticated, async (req, res) => {
    try {
      const { jobIds, customerId, manualPrices } = req.body; // Optional manual prices: { lineItemId: unitPrice }

      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ error: "jobIds must be a non-empty array" });
      }

      // Fetch all jobs and customer
      const allJobs = await storage.getJobs();
      const selectedJobs = allJobs.filter(j => jobIds.includes(j.id));

      if (selectedJobs.length !== jobIds.length) {
        return res.status(404).json({ error: "One or more jobs not found" });
      }

      // CRITICAL: Verify all selected jobs belong to the specified customer
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

      const customer = await storage.getCustomers().then(customers => 
        customers.find(c => c.id === customerId)
      );

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // Determine pricing table (use null for zero pricing if none configured)
      const pricingTable = customer.pricingTable2026 ? "2026" : customer.pricingTable2025 ? "2025" : null;

      // Get line items and calculate pricing for each job
      const lineItemsWithPricing: Array<{ jobName: string; poNumber: string | null; description: string; quantity: number; unitPrice: number; stitchCount: number; itemCode: string }> = [];
      let hasPOA = false;
      let hasTBA = false;

      for (const job of selectedJobs) {
        const jobLineItems = await storage.getJobLineItems(job.id);
        
        // Try to calculate price, but catch errors for items outside pricing tables
        let priceResult;
        try {
          priceResult = pricingTable ? calculateJobPrice(jobLineItems, pricingTable) : { totalPrice: 0, lineItemPrices: jobLineItems.map(() => ({ unitPrice: 0, totalPrice: 0 })) };
          if (priceResult.totalPrice === "POA") {
            hasPOA = true;
          }
        } catch (error) {
          // If price calculation fails (e.g., no tier for quantity), treat as POA
          console.log(`Price calculation failed for job ${job.id}, treating as POA:`, error instanceof Error ? error.message : error);
          hasPOA = true;
          priceResult = null;
        }

        // Add each line item with its calculated unit price or manual price
        jobLineItems.forEach((lineItem, index) => {
          let unitPrice: number;
          
          // Use manual price if provided for this line item
          if (manualPrices && manualPrices[lineItem.id] !== undefined) {
            unitPrice = parseFloat(manualPrices[lineItem.id]);
          } else if (priceResult) {
            // Use calculated price if available
            const lineItemPrice = priceResult.lineItemPrices[index];
            unitPrice = typeof lineItemPrice === 'number' ? lineItemPrice : lineItemPrice.unitPrice as number;
          } else {
            // No calculated price and no manual price - this will trigger error below
            unitPrice = 0;
          }
          
          // Determine item code based on job type
          let itemCode = "EMB"; // Default to embroidery
          if (lineItem.jobType === "print") {
            itemCode = "Print DTF";
          } else if (lineItem.jobType === "bagging") {
            itemCode = "BAG";
          } else if (lineItem.jobType === "other") {
            itemCode = "OTHER";
          }
          
          lineItemsWithPricing.push({
            jobName: job.jobName,
            poNumber: job.poNumber,
            description: lineItem.description || '',
            quantity: lineItem.quantity,
            unitPrice,
            stitchCount: lineItem.stitchCount,
            itemCode,
          });
        });

        // Add shipping cost as a separate line item if available
        if (job.shippingCost && job.shippingCost !== "TBA") {
          const shippingCost = parseFloat(job.shippingCost);
          if (!isNaN(shippingCost) && shippingCost > 0) {
            lineItemsWithPricing.push({
              jobName: job.jobName,
              poNumber: job.poNumber,
              description: `Shipping - ${job.shippingMethod === 'customer_collection' ? 'Customer Collection' : job.shippingMethod === 'consolidated' ? 'Consolidated Back to Customer' : 'Direct Delivery'}`,
              quantity: 1,
              unitPrice: shippingCost,
              stitchCount: 0, // No stitch count for shipping
              itemCode: "CARRIAGE", // Xero item code for shipping
            });
          }
        } else if (job.shippingCost === "TBA") {
          hasTBA = true;
        }
      }
      
      // If we have POA items and no manual prices provided, reject
      if (hasPOA && !manualPrices) {
        return res.status(400).json({ error: "Manual prices required for POA items" });
      }

      // If we have TBA shipping costs, reject
      if (hasTBA) {
        return res.status(400).json({ error: "Cannot create invoice with TBA shipping costs. Please contact support for shipping pricing on orders with more than 4 boxes." });
      }

      // Add approved logo setups for this customer
      const approvedLogoSetups = await storage.getLogoSetups();
      const customerLogoSetups = approvedLogoSetups.filter(
        setup => setup.customerId === customerId && setup.approved && setup.approvedAt
      );
      
      for (const setup of customerLogoSetups) {
        lineItemsWithPricing.push({
          jobName: "Logo Set-Up",
          poNumber: null,
          description: `Logo Set-Up - ${setup.jobName}`,
          quantity: 1,
          unitPrice: 10, // £10 per approved logo setup
          stitchCount: 0,
          itemCode: "OTHER", // Use OTHER item code for logo setups
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

      // Only delete logo setups after successful invoice creation
      for (const setup of customerLogoSetups) {
        await storage.deleteLogoSetup(setup.id);
      }

      // Update all jobs with invoice status
      const now = new Date();
      for (const job of selectedJobs) {
        await storage.updateJob(job.id, {
          invoiceStatus: "invoiced",
          invoicedAt: now,
          invoiceReference: invoiceNumber || invoiceId,
        });
      }

      res.json({
        success: true,
        invoiceId,
        invoiceNumber,
        jobsInvoiced: selectedJobs.length,
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
      const logoSetup = await storage.updateLogoSetup(req.params.id, parsed);
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

      // Use Replit dev domain if available, otherwise fall back to request headers
      const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
      let redirectUri: string;
      
      if (replitDevDomain) {
        redirectUri = `https://${replitDevDomain}/api/xero/auth/callback`;
      } else {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers.host;
        redirectUri = `${protocol}://${host}/api/xero/auth/callback`;
      }
      
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

      // Use Replit dev domain if available, otherwise fall back to request headers
      const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
      let redirectUri: string;
      
      if (replitDevDomain) {
        redirectUri = `https://${replitDevDomain}/api/xero/auth/callback`;
      } else {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers.host;
        redirectUri = `${protocol}://${host}/api/xero/auth/callback`;
      }

      console.log("Redirect URI:", redirectUri);
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

  const httpServer = createServer(app);
  return httpServer;
}
