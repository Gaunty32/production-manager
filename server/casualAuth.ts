import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { CasualLogin } from "@shared/schema";

const SALT_ROUNDS = 10;

export function normalizeMobile(mobile: string): string {
  return mobile.replace(/\s+/g, "");
}

// Set (or reset) a casual staff member's PIN using a one-time invite token
export async function setCasualPinWithToken(token: string, pin: string) {
  const invite = await storage.getCasualInviteToken(token);
  if (!invite) {
    throw new Error("This invite link is invalid.");
  }
  if (invite.used) {
    throw new Error("This invite link has already been used.");
  }
  if (new Date(invite.expiresAt) < new Date()) {
    throw new Error("This invite link has expired. Please ask for a new one.");
  }

  const staffMember = await storage.getCasualStaffById(invite.casualStaffId);
  if (!staffMember) {
    throw new Error("This account no longer exists.");
  }

  const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
  await storage.updateCasualStaff(staffMember.id, { pinHash });
  await storage.markCasualInviteTokenUsed(invite.id);

  return staffMember;
}

export async function loginCasual(data: CasualLogin) {
  const staffMember = await storage.getCasualStaffByMobile(data.mobileNumber);
  if (!staffMember) {
    throw new Error("Invalid mobile number or PIN.");
  }
  if (!staffMember.active) {
    throw new Error("This account has been disabled. Please contact the office.");
  }
  if (!staffMember.pinHash) {
    throw new Error("You haven't set a PIN yet. Please use the invite link we sent you.");
  }

  const isValid = await bcrypt.compare(data.pin, staffMember.pinHash);
  if (!isValid) {
    throw new Error("Invalid mobile number or PIN.");
  }

  await storage.updateCasualStaff(staffMember.id, { lastLoginAt: new Date() });

  const { pinHash: _, ...safe } = staffMember;
  return safe;
}

// Middleware: require an authenticated casual staff member. Re-verifies on every
// request that the account still exists and is active, so a disabled or deleted
// user with an old session can't keep booking/cancelling via the API.
export async function isCasualAuthenticated(req: any, res: any, next: any) {
  const id = req.session?.casualStaffId;
  if (!id) {
    return res.status(401).json({ error: "Login required" });
  }
  try {
    const member = await storage.getCasualStaffById(id);
    if (!member || !member.active) {
      req.session.casualStaffId = undefined;
      return res.status(401).json({ error: "Login required" });
    }
    req.casualStaff = member;
    next();
  } catch (error) {
    console.error("Casual auth check error:", error);
    res.status(500).json({ error: "Authentication check failed" });
  }
}
