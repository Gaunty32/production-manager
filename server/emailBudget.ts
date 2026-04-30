/**
 * In-memory daily email budget tracker.
 *
 * Resets at midnight (Europe/London). All outbound email functions call
 * recordEmailSent() so the re-engagement scheduler can check remaining
 * quota before firing batch emails.
 *
 * Set DAILY_EMAIL_LIMIT env var to override the default (95 leaves 5
 * headroom on the Resend free 100/day plan).
 */

const DAILY_EMAIL_LIMIT = parseInt(process.env.DAILY_EMAIL_LIMIT ?? '95', 10);

function londonDateStr(): string {
  return new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
}

let _currentDate = londonDateStr();
let _sentToday = 0;

function resetIfNewDay() {
  const today = londonDateStr();
  if (today !== _currentDate) {
    _currentDate = today;
    _sentToday = 0;
    console.log('[EmailBudget] New day — counter reset');
  }
}

export function recordEmailSent(count = 1) {
  resetIfNewDay();
  _sentToday += count;
}

export function getEmailBudget(): { limit: number; sent: number; remaining: number } {
  resetIfNewDay();
  return {
    limit: DAILY_EMAIL_LIMIT,
    sent: _sentToday,
    remaining: Math.max(0, DAILY_EMAIL_LIMIT - _sentToday),
  };
}
