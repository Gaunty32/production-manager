/**
 * Per-conversation notification cooldown for staff email alerts.
 *
 * When a customer sends multiple messages in a busy thread, this prevents
 * the system from emailing every enabled staff member for each reply.
 * Once a notification fires for a given conversation/job, a cooldown
 * window starts and any further messages within that window are silently
 * skipped — staff already know there's an active conversation.
 *
 * Set NOTIFICATION_COOLDOWN_MINUTES env var to override the default (30).
 */

const COOLDOWN_MS =
  parseInt(process.env.NOTIFICATION_COOLDOWN_MINUTES ?? '30', 10) * 60 * 1000;

// key format: 'job:{jobId}' or 'convo:{conversationId}'
const lastSentAt = new Map<string, number>();

/**
 * Returns true if a staff notification SHOULD be sent for this conversation
 * key, and records the send time. Returns false (and does nothing) if we're
 * still within the cooldown window for that key.
 */
export function shouldSendStaffNotification(key: string): boolean {
  const now = Date.now();
  const last = lastSentAt.get(key);
  if (last !== undefined && now - last < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - last)) / 60000);
    console.log(
      `[NotifyThrottle] Suppressed notification for ${key} — cooldown active (${remaining} min remaining)`
    );
    return false;
  }
  lastSentAt.set(key, now);
  return true;
}
