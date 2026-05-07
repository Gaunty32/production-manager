import { useState, useEffect, useRef, useCallback } from "react";

export type ConversationReminder = {
  key: string;
  label: string;
  remindAt: number;
};

export function useConversationFlags(
  namespace: "staff" | "customer",
  onReminderFired?: (reminder: ConversationReminder) => void
) {
  const unreadStorageKey = `${namespace}:conv_unread`;
  const remindersStorageKey = `${namespace}:conv_reminders`;

  const [manuallyUnread, setManuallyUnread] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(unreadStorageKey);
      return new Set(stored ? (JSON.parse(stored) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  const [reminders, setReminders] = useState<ConversationReminder[]>(() => {
    try {
      const stored = localStorage.getItem(remindersStorageKey);
      return stored ? (JSON.parse(stored) as ConversationReminder[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(unreadStorageKey, JSON.stringify([...manuallyUnread]));
  }, [manuallyUnread, unreadStorageKey]);

  useEffect(() => {
    localStorage.setItem(remindersStorageKey, JSON.stringify(reminders));
  }, [reminders, remindersStorageKey]);

  const callbackRef = useRef(onReminderFired);
  useEffect(() => {
    callbackRef.current = onReminderFired;
  });

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const due = reminders.filter((r) => r.remindAt <= now);
      if (due.length === 0) return;
      due.forEach((r) => {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`Reminder: ${r.label}`, {
            body: "You asked to be reminded about this conversation.",
            icon: "/favicon.ico",
          });
        }
        callbackRef.current?.(r);
      });
      setReminders((prev) => prev.filter((r) => r.remindAt > now));
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [reminders]);

  const markUnread = useCallback((key: string) => {
    setManuallyUnread((prev) => new Set([...prev, key]));
  }, []);

  const clearUnread = useCallback((key: string) => {
    setManuallyUnread((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const isManuallyUnread = useCallback(
    (key: string) => manuallyUnread.has(key),
    [manuallyUnread]
  );

  const setReminder = useCallback((key: string, label: string) => {
    const remindAt = Date.now() + 60 * 60 * 1000;
    setReminders((prev) => [
      ...prev.filter((r) => r.key !== key),
      { key, label, remindAt },
    ]);
  }, []);

  const clearReminder = useCallback((key: string) => {
    setReminders((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const hasReminder = useCallback(
    (key: string) => reminders.some((r) => r.key === key),
    [reminders]
  );

  return {
    isManuallyUnread,
    markUnread,
    clearUnread,
    setReminder,
    clearReminder,
    hasReminder,
  };
}
