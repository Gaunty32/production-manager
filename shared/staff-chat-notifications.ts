export type GeneralChatNotification = {
  id: string;
  customerId: string | null;
  archivedByStaff?: boolean;
  latestMessage: {
    id?: string;
    message: string | null;
    senderType: "customer" | "staff";
    createdAt: string;
  } | null;
};

export function generalChatSnapshot(conversations: GeneralChatNotification[]): Map<string, string | null> {
  return new Map(conversations.map(conversation => [
    conversation.id,
    conversation.latestMessage
      ? conversation.latestMessage.id ?? `${conversation.latestMessage.senderType}:${conversation.latestMessage.createdAt}`
      : null,
  ]));
}

export function newGeneralChatAlerts<T extends GeneralChatNotification>(
  previous: Map<string, string | null> | null,
  conversations: T[],
  selectedConversationId: string | null,
): T[] {
  // Establish a baseline on first load; old messages are not new arrivals.
  if (!previous) return [];
  const current = generalChatSnapshot(conversations);
  return conversations.filter(conversation =>
    conversation.customerId
    && !conversation.archivedByStaff
    && conversation.id !== selectedConversationId
    && conversation.latestMessage?.senderType === "customer"
    && previous.get(conversation.id) !== current.get(conversation.id),
  );
}
