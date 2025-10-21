import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { InsertCustomerUser, CustomerLogin } from "@shared/schema";

const SALT_ROUNDS = 10;

export async function registerCustomer(data: InsertCustomerUser & { customerId: string }) {
  // Hash the password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  
  // Create customer user
  const customerUser = await storage.createCustomerUser({
    customerId: data.customerId,
    email: data.email,
    passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
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
