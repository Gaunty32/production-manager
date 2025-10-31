// Simple in-memory rate limiter for login attempts
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

// Clean up old entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(loginAttempts.entries())) {
    if (now > entry.resetTime) {
      loginAttempts.delete(key);
    }
  }
}, 15 * 60 * 1000);

export function checkRateLimit(identifier: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(identifier);

  if (!entry || now > entry.resetTime) {
    // New window or expired entry
    loginAttempts.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return true;
  }

  if (entry.count >= maxAttempts) {
    return false;
  }

  entry.count++;
  return true;
}

export function resetRateLimit(identifier: string): void {
  loginAttempts.delete(identifier);
}
