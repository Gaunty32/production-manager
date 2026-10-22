import { z } from "zod";

export const mentionSelectionSchema = z.object({
  id: z.string().min(1),
  isCustomer: z.boolean(),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  text: z.string().min(2),
});
export type MentionSelection = z.infer<typeof mentionSelectionSchema>;

// Keep only selections whose original text survives an edit. Retyping a name
// after deleting it must not resurrect the previously selected staff recipient.
export function updateMentionSelections(before: string, after: string, mentions: MentionSelection[]): MentionSelection[] {
  if (before === after) return mentions;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return mentions.flatMap(mention => {
    let next = mention;
    if (oldEnd <= mention.start) next = { ...mention, start: mention.start + delta, end: mention.end + delta };
    else if (start < mention.end) return [];
    if (after.slice(next.start, next.end) !== next.text || /[\w@]/.test(after[next.start - 1] || "")
      || /\w/.test(after[next.end] || "")) return [];
    return [next];
  });
}

type MentionStaff = { id: string; name: string; active: boolean | null; userId: string | null; email: string | null };
type MentionUser = { id: string; active: boolean | null; email: string | null; firstName: string | null; lastName: string | null; role: string };

export function resolveSelectedStaffMentions(
  message: string, selections: unknown, staff: MentionStaff[], users: MentionUser[], senderUserId: string,
) {
  const parsed = z.array(mentionSelectionSchema).max(100).safeParse(selections ?? []);
  if (!parsed.success) return [];
  const recipients = new Map<string, { id: string; name: string; email: string }>();
  for (const mention of parsed.data) {
    if (mention.isCustomer || mention.end <= mention.start || message.slice(mention.start, mention.end) !== mention.text
      || /[\w@]/.test(message[mention.start - 1] || "") || /\w/.test(message[mention.end] || "")) continue;
    const member = staff.find(s => s.id === mention.id);
    let user: MentionUser | undefined;
    let name: string;
    if (member) {
      if (member.active === false) continue;
      user = member.userId
        ? users.find(u => u.id === member.userId)
        : users.find(u => !!member.email && u.email?.toLowerCase() === member.email.toLowerCase());
      name = member.name;
    } else {
      user = users.find(u => u.id === mention.id);
      // Only unlinked staff/admin users appear separately in the picker.
      if (staff.some(s => s.userId === user?.id || (!!user?.email && s.email?.toLowerCase() === user.email.toLowerCase()))) continue;
      name = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "" : "";
    }
    if (!user?.active || !user.email || user.role === "demo" || user.id === senderUserId) continue;
    if (mention.text !== `@${name.split(" ")[0]}`) continue;
    recipients.set(user.id, { id: user.id, name, email: user.email });
  }
  return Array.from(recipients.values());
}
