import crypto from "crypto";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { PasswordResetRequest, PasswordResetConfirm } from "@shared/schema";

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 1;

export async function requestPasswordReset(data: PasswordResetRequest): Promise<string> {
  const user = await storage.getUserByEmail(data.email);
  
  if (!user) {
    throw new Error("If an account exists with this email, you will receive a password reset link.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

  await storage.createPasswordResetToken({
    userId: user.id,
    token,
    expiresAt,
  });

  return token;
}

export async function confirmPasswordReset(data: PasswordResetConfirm): Promise<void> {
  const resetToken = await storage.getPasswordResetToken(data.token);
  
  if (!resetToken || resetToken.used) {
    throw new Error("Invalid or expired reset token");
  }

  if (new Date() > new Date(resetToken.expiresAt)) {
    throw new Error("Reset token has expired");
  }

  const passwordHash = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
  
  await storage.updateUserPassword(resetToken.userId, passwordHash);
  await storage.markPasswordResetTokenUsed(resetToken.id);
}
