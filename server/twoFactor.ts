import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";
import crypto from "crypto";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
  }
  return codes;
}

export async function generateQRCode(secret: string, email: string): Promise<string> {
  const totp = new OTPAuth.TOTP({
    issuer: "Select Uniforms",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secret,
  });

  const otpauthUrl = totp.toString();
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
  return qrCodeUrl;
}

export function verifyToken(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: "Select Uniforms",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secret,
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

export async function hashBackupCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(code, salt, 64) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyBackupCodeHash(code: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  const derivedKey = await scryptAsync(code, salt, 64) as Buffer;
  return key === derivedKey.toString("hex");
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(code => hashBackupCode(code)));
}

export async function setup2FA(email: string): Promise<TwoFactorSetup> {
  const secret = generateSecret();
  const backupCodes = generateBackupCodes();
  const qrCodeUrl = await generateQRCode(secret, email);

  return {
    secret,
    qrCodeUrl,
    backupCodes,
  };
}
