import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { StaffLogin, StaffRegister } from "@shared/schema";

const SALT_ROUNDS = 10;

export async function registerStaff(data: StaffRegister) {
  // Check if user already exists by email or username
  const existingUserByEmail = await storage.getUserByEmail(data.email);
  if (existingUserByEmail) {
    throw new Error("Email already registered");
  }
  
  const existingUserByUsername = await storage.getUserByUsername(data.username);
  if (existingUserByUsername) {
    throw new Error("Username already taken");
  }

  // Hash the password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  
  // Create user
  const user = await storage.createUser({
    username: data.username,
    email: data.email,
    password: passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    profileImageUrl: null,
    role: data.role || "staff",
  });
  
  // Return without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

export async function loginStaff(data: StaffLogin) {
  // Find user by email or username
  let user = await storage.getUserByEmail(data.email);
  
  // If not found by email, try username
  if (!user) {
    user = await storage.getUserByUsername(data.email);
  }
  
  if (!user || !user.password) {
    throw new Error("Invalid username or password");
  }
  
  // Verify password
  const isValid = await bcrypt.compare(data.password, user.password);
  
  if (!isValid) {
    throw new Error("Invalid username or password");
  }
  
  // Return without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Middleware to check if staff is authenticated
export function isStaffAuthenticated(req: any, res: any, next: any) {
  console.log(`[AUTH] Checking authentication - SessionID: ${req.sessionID}, UserId: ${req.session?.userId}, Session: ${JSON.stringify(req.session)}`);
  if (!req.session?.userId) {
    console.log(`[AUTH] No userId in session, returning 401`);
    return res.status(401).json({ error: "Authentication required" });
  }
  console.log(`[AUTH] User authenticated: ${req.session.userId}`);
  next();
}

// Middleware to attach user to request
export async function attachUser(req: any, res: any, next: any) {
  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        const { password: _, ...userWithoutPassword } = user;
        req.user = userWithoutPassword;
      }
    } catch (error) {
      console.error("Error fetching user:", error);
    }
  }
  next();
}
