import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { InsertCustomerUser, CustomerLogin } from "@shared/schema";

const SALT_ROUNDS = 10;

export async function registerCustomer(data: InsertCustomerUser & { customerId: string }) {
  // Hash the password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  
  // Create customer user with password reset required
  const customerUser = await storage.createCustomerUser({
    customerId: data.customerId,
    email: data.email,
    passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    mustResetPassword: true,
    active: true,
  });
  
  // Return without password hash
  const { passwordHash: _, ...user } = customerUser;
  return user;
}

export async function loginCustomer(data: CustomerLogin) {
  // Find customer user by email
  const customerUser = await storage.getCustomerUserByEmail(data.email);
  
  if (!customerUser) {
    throw new Error("Invalid email or password");
  }
  
  // Check if account is active
  if (!customerUser.active) {
    throw new Error("This account has been disabled. Please contact support.");
  }
  
  // Verify password
  const isValid = await bcrypt.compare(data.password, customerUser.passwordHash);
  
  if (!isValid) {
    throw new Error("Invalid email or password");
  }
  
  // Update last login
  await storage.updateCustomerLastLogin(customerUser.id);
  
  // Return without password hash
  const { passwordHash: _, ...user } = customerUser;
  return user;
}

export async function resetCustomerPassword(customerUserId: string, newPassword: string) {
  // Hash the new password
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  
  // Update password and clear the mustResetPassword flag
  await storage.updateCustomerPassword(customerUserId, passwordHash);
  await storage.updateCustomerMustResetPassword(customerUserId, false);
  
  return { success: true };
}

// Middleware to check if customer is authenticated
export function isCustomerAuthenticated(req: any, res: any, next: any) {
  if (!req.session?.customerUserId) {
    return res.status(401).json({ error: "Customer authentication required" });
  }
  next();
}

// Middleware to attach customer user to request
export async function attachCustomerUser(req: any, res: any, next: any) {
  if (req.session?.customerUserId) {
    try {
      const customerUser = await storage.getCustomerUserById(req.session.customerUserId);
      if (customerUser) {
        const { passwordHash: _, ...user } = customerUser;
        req.customerUser = user;
      }
    } catch (error) {
      console.error("Error fetching customer user:", error);
    }
  }
  next();
}
