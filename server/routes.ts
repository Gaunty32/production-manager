import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
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
  updateLogoSetupSchema
} from "@shared/schema";
import { z } from "zod";
import { xeroService } from "./xero";
import { calculateJobPrice, calculateShippingCost, CODE_TO_PRINT_SIZE } from "@shared/pricing";
import { loginCustomer, registerCustomer, resetCustomerPassword, isCustomerAuthenticated, attachCustomerUser } from "./customerAuth";
import { loginStaff, registerStaff, isStaffAuthenticated, attachUser } from "./staffAuth";
import { customerLoginSchema, insertCustomerUserSchema, staffLoginSchema, staffRegisterSchema, passwordResetRequestSchema, passwordResetConfirmSchema, customerJobSubmissionSchema, insertJobFileSchema, insertJobMessageSchema, canViewPrices, type Job } from "@shared/schema";
import { setupProductionDatabase } from "./setup-production";
import { checkRateLimit, resetRateLimit } from "./rateLimiter";
import { requestPasswordReset, confirmPasswordReset } from "./passwordReset";
import { sendPasswordResetEmail, sendNewJobSubmissionEmail, sendJobApprovedEmail, sendJobRejectedEmail } from "./emailService";

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

export async function registerRoutes(app: Express): Promise<Server> {
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
      await sendPasswordResetEmail(user.email, token);
      
      res.json({ message: `Password reset email sent to ${user.email}` });
    } catch (error: any) {
      console.error("Error sending password reset:", error);
      res.status(500).json({ error: "Failed to send password reset email" });
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

  // Production Display API routes (no authentication required - for big screen display)
  app.get("/api/production-display/queue", async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 3;
      const queueData = await storage.getProductionDisplayQueue(days);
      res.json(queueData);
    } catch (error) {
      console.error("Error fetching production display queue:", error);
      res.status(500).json({ error: "Failed to fetch production queue" });
    }
  });

  app.get("/api/production-display/leaderboard", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const leaderboard = await storage.getProductionDisplayLeaderboard(limit);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching production display leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/production-display/history", async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const history = await storage.getProductionDisplayHistory(days);
      res.json(history);
    } catch (error) {
      console.error("Error fetching production display history:", error);
      res.status(500).json({ error: "Failed to fetch history" });
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

  app.post("/api/customer-users/:id/reset-password", isStaffAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = z.object({
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);
      
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(password, 10);
      
      await storage.updateCustomerPassword(id, passwordHash);
      await storage.updateCustomerMustResetPassword(id, true);
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : "Failed to reset customer password" });
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

  app.get("/api/customer-auth/user", isCustomerAuthenticated, async (req: any, res) => {
    try {
      const customerUser = await storage.getCustomerUserById((req.session as any).customerUserId);
      if (!customerUser) {
        return res.status(404).json({ error: "Customer user not found" });
      }
      
      // Return without password hash, include impersonation flag
      const { passwordHash: _, ...user } = customerUser;
      const isImpersonating = !!(req.session as any).impersonationCustomerUserId;
      
      res.json({
        ...user,
        isImpersonating,
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
      
      // Get all jobs for this customer except those pending approval
      // pending_customer_approval jobs are shown in a separate "Pending Submissions" page
      const jobs = await storage.getJobsByCustomerId(customerUser.customerId);
      const visibleJobs = jobs.filter(j => j.status !== 'pending_customer_approval');
      
      // Get line items for each job
      const jobsWithLineItems = await Promise.all(
        visibleJobs.map(async (job) => {
          const lineItems = await storage.getJobLineItems(job.id);
          return {
            ...job,
            lineItems,
          };
        })
      );
      
      res.json(jobsWithLineItems);
    } catch (error) {
      console.error("Error fetching customer jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
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
        quantity: data.quantity,
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

      // Send email notification to staff
      try {
        const allStaff = await storage.getStaff();
        const staffEmails = allStaff
          .filter(s => s.email && s.email.trim().length > 0)
          .map(s => s.email!);
        
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

  // Customer Portal - Get upload URL for file
  app.post("/api/customer-portal/objects/upload", isCustomerAuthenticated, async (req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

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
      const fileUrl = objectStorageService.normalizeObjectEntityPath(req.body.fileUrl);

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
      });

      const message = await storage.createJobMessage(messageData);
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

      const messages = await storage.getJobMessages(req.params.jobId);
      
      // Mark messages as read by customer
      await storage.markMessagesAsRead(req.params.jobId, 'customer');
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Staff - Get pending customer job submissions
  app.get("/api/staff/jobs/pending", isStaffAuthenticated, async (req, res) => {
    try {
      const allJobs = await storage.getJobs();
      const pendingJobs = allJobs.filter(j => j.status === 'pending_customer_approval');
      
      // Get files and messages for each pending job
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

  // Staff - Approve job
  app.post("/api/staff/jobs/:jobId/approve", isStaffAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Get staff ID from userId
      const allStaff = await storage.getStaff();
      const staff = allStaff.find(s => s.userId === req.session.userId);

      // Update job status to production
      await storage.updateJob(req.params.jobId, {
        status: 'production',
        approvedById: staff?.id || null,
        approvedAt: new Date() as any,
      });

      // Send email notification to customer
      try {
        if (job.submittedById) {
          const customerUser = await storage.getCustomerUserById(job.submittedById);
          if (customerUser && customerUser.email) {
            const customers = await storage.getCustomers();
            const customer = customers.find(c => c.id === job.customerId);
            await sendJobApprovedEmail(customerUser.email, {
              jobName: job.jobName,
              customerName: customer?.name || 'Customer',
              jobId: job.id,
            });
          }
        }
      } catch (emailError) {
        console.error('Failed to send job approval notification email:', emailError);
        // Don't fail the request if email fails
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error approving job:", error);
      res.status(500).json({ error: "Failed to approve job" });
    }
  });

  // Staff - Reject job
  app.post("/api/staff/jobs/:jobId/reject", isStaffAuthenticated, async (req: any, res) => {
    try {
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Get staff ID from userId
      const allStaff = await storage.getStaff();
      const staff = allStaff.find(s => s.userId === req.session.userId);

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

      // Get staff ID from userId
      const allStaff = await storage.getStaff();
      const staff = allStaff.find(s => s.userId === req.session.userId);
      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }

      const message = await storage.createJobMessage({
        jobId: req.params.jobId,
        senderType: 'staff',
        senderId: staff.id,
        message: req.body.message,
      });

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
      
      // Enrich messages with sender names
      const allStaff = await storage.getStaff();
      const enrichedMessages = await Promise.all(
        messages.map(async (msg) => {
          if (msg.senderType === 'staff' && msg.senderId) {
            const staff = allStaff.find(s => s.id === msg.senderId);
            return { ...msg, senderName: staff?.name || null };
          } else if (msg.senderType === 'customer' && msg.senderId) {
            const customerUser = await storage.getCustomerUserById(msg.senderId);
            const name = [customerUser?.firstName, customerUser?.lastName]
              .filter(Boolean)
              .join(' ') || null;
            return { ...msg, senderName: name };
          }
          return { ...msg, senderName: null };
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
      
      // Recalculate job's total actual production time
      await recalculateJobProductionTime(jobId);
      
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
      
      const updates = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      const lineItem = await storage.updateJobLineItem(req.params.id, updates);
      
      // Recalculate job's total actual production time from all completed line items
      await recalculateJobProductionTime(lineItem.jobId);
      
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
            invoiceStatus: "ready"
          });
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
    try {
      const { findAvailableSlots, calculateJobDuration, minutesToTime } = await import("@shared/scheduling");
      
      // Get all jobs and line items
      const allJobs = await storage.getJobs();
      const allLineItems = await storage.getAllJobLineItems();
      const existingSchedules = await storage.getJobSchedules();
      const staff = await storage.getStaff();
      
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
        
        // Try each candidate staff member to find earliest available slot
        for (const staffMember of candidateStaff) {
          const currentDate = new Date(startDate);
          
          while (currentDate <= endDate) {
            const dateSlots = findAvailableSlots(
              currentDate,
              lineItem.machineId!,
              staffMember.id,
              machineBlocks,
              staffShifts,
              currentSchedules,
              staffMachineAllocations,
              staffHolidays,
              bankHolidays
            );
            
            // Find first slot that fits
            for (const slot of dateSlots) {
              const slotDuration = slot.endTime - slot.startTime;
              if (slotDuration >= duration) {
                const proposedSlot = {
                  date: new Date(currentDate),
                  startTime: slot.startTime,
                  endTime: slot.startTime + duration
                };
                
                // Take the earliest slot we find (greedy algorithm)
                if (!bestSlot || proposedSlot.date < bestSlot.date ||
                    (proposedSlot.date.getTime() === bestSlot.date.getTime() && proposedSlot.startTime < bestSlot.startTime)) {
                  bestSlot = proposedSlot;
                  bestStaffId = staffMember.id;
                }
                // Once we find a slot, move to next staff member
                break;
              }
            }
            
            // If we found a slot for this staff, move to next staff
            if (bestSlot) break;
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
          }
          
          // If we already found the earliest possible slot (today), no need to check more staff
          if (bestSlot && bestSlot.date.toDateString() === startDate.toDateString()) {
            break;
          }
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

  app.post("/api/staff-holidays", isStaffAuthenticated, async (req, res) => {
    try {
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
      await storage.deleteStaffHoliday(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete staff holiday" });
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
        let itemCode = "Emb"; // Default to embroidery
        let description = lineItem.description || '';
        
        if (lineItem.jobType === "print") {
          itemCode = "Print DTF";
          // Add print size to description for Print jobs
          const printSize = CODE_TO_PRINT_SIZE[lineItem.stitchCount as keyof typeof CODE_TO_PRINT_SIZE];
          if (printSize) {
            description = description || job.jobName;
            description = `${description}, ${printSize} Print`;
          }
        } else if (lineItem.jobType === "bagging") {
          itemCode = "BAG";
        } else if (lineItem.jobType === "other") {
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
      const { jobIds, customerId, manualPrices, manualShippingCosts } = req.body; // Optional manual prices: { lineItemId: unitPrice }, optional manual shipping: { jobId: shippingCost }

      if (!Array.isArray(jobIds) || jobIds.length === 0) {
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
      let selectedJobs = allJobs.filter(j => jobIds.includes(j.id));

      if (selectedJobs.length !== jobIds.length) {
        return res.status(404).json({ error: "One or more jobs not found" });
      }

      // Sort jobs by completion date (goodsReceived) - earliest first
      selectedJobs.sort((a, b) => {
        const dateA = a.goodsReceived ? new Date(a.goodsReceived).getTime() : 0;
        const dateB = b.goodsReceived ? new Date(b.goodsReceived).getTime() : 0;
        return dateA - dateB;
      });

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
      // Build line items in order: job items, then carriage for that job, repeat
      const lineItemsWithPricing: Array<{ jobName: string; poNumber: string | null; description: string; quantity: number; unitPrice: number; stitchCount: number; itemCode: string }> = [];
      let hasPOA = false;
      let hasTBA = false;

      // Pre-compute the last index where each shipmentId appears
      const shipmentLastIndex = new Map<string, number>();
      for (let i = 0; i < selectedJobs.length; i++) {
        const shipmentKey = selectedJobs[i].consolidatedShipmentId || `single-${selectedJobs[i].id}`;
        shipmentLastIndex.set(shipmentKey, i);
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
          
          const jobTypeLower = lineItem.jobType?.toLowerCase() || '';
          let itemCode = "Emb";
          let description = lineItem.description || '';
          
          if (jobTypeLower === "print") {
            itemCode = "Print DTF";
            // Add print size to description for Print jobs
            const printSize = CODE_TO_PRINT_SIZE[lineItem.stitchCount as keyof typeof CODE_TO_PRINT_SIZE];
            if (printSize) {
              description = description || job.jobName;
              description = `${description}, ${printSize} Print`;
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
          if (!manualShippingCosts || !manualShippingCosts[job.id]) {
            hasTBA = true;
          }
        }
        
        // If this is the last occurrence of this shipmentKey, emit carriage
        if (shipmentLastIndex.get(shipmentKey) === i) {
          const shipmentJobs = shipmentJobsMap.get(shipmentKey)!;
          const emitCarriageForJobs = (jobs: Job[]) => {
            let totalShippingCost = 0;
            let shippingMethod = '';
            let hasShipping = false;
            
            for (const shipmentJob of jobs) {
              let shippingCost: number | null = null;
              
              if (shipmentJob.shippingCost === "TBA") {
                if (manualShippingCosts && manualShippingCosts[shipmentJob.id]) {
                  shippingCost = Number(manualShippingCosts[shipmentJob.id]);
                }
              } else if (shipmentJob.shippingCost) {
                shippingCost = parseFloat(shipmentJob.shippingCost);
              }
              
              if (shippingCost !== null && !isNaN(shippingCost) && shippingCost > 0) {
                totalShippingCost += shippingCost;
                hasShipping = true;
                if (!shippingMethod) {
                  shippingMethod = shipmentJob.shippingMethod || '';
                }
              }
            }
            
            if (hasShipping && totalShippingCost > 0) {
              const isConsolidated = jobs.length > 1;
              
              // Build job names with PO numbers
              const jobDetails = jobs.map(j => {
                if (j.poNumber) {
                  return `${j.jobName} (PO: ${j.poNumber})`;
                }
                return j.jobName;
              }).join(', ');
              
              let packageInfo = '';
              if (shippingMethod === 'direct_delivery') {
                const packageCounts: { [key: string]: number } = {};
                for (const shipmentJob of jobs) {
                  if (shipmentJob.packageCount && shipmentJob.packageType) {
                    const normalizedType = shipmentJob.packageType.toLowerCase();
                    packageCounts[normalizedType] = (packageCounts[normalizedType] || 0) + shipmentJob.packageCount;
                  }
                }
                
                if (Object.keys(packageCounts).length > 0) {
                  const pluralMap: { [key: string]: string } = {
                    'box': 'boxes',
                    'boxes': 'boxes', // Handle already-plural form
                    'bag': 'bags',
                    'bags': 'bags', // Handle already-plural form
                    'pallet': 'pallets',
                    'pallets': 'pallets',
                    'package': 'packages',
                    'packages': 'packages',
                  };
                  
                  const singularMap: { [key: string]: string } = {
                    'boxes': 'box',
                    'bags': 'bag',
                    'pallets': 'pallet',
                    'packages': 'package',
                  };
                  
                  const packageParts = Object.entries(packageCounts).map(([type, count]) => {
                    const singular = singularMap[type] || type;
                    const plural = pluralMap[type] || pluralMap[singular] || type + 's';
                    const displayType = count > 1 ? plural : singular;
                    return `${count} ${displayType}`;
                  });
                  
                  packageInfo = ` (${packageParts.join(', ')})`;
                }
              }
              
              lineItemsWithPricing.push({
                jobName: isConsolidated ? `${jobs.length} jobs` : jobs[0].jobName,
                poNumber: jobs[0].poNumber,
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
          };
          
          emitCarriageForJobs(shipmentJobs);
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

  const httpServer = createServer(app);
  return httpServer;
}
