import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  MessageSquare,
  Send,
  ChevronRight,
  Package,
  ArrowLeft,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

type Conversation = {
  jobId: string;
  jobName: string;
  customerId: string;
  customerName: string;
  status: string;
  completed: boolean;
  messageCount: number;
  unreadCount: number;
  latestMessage: {
    message: string;
    senderType: "customer" | "staff";
    createdAt: string;
  } | null;
};

type ChatMessage = {
  id: string;
  senderType: "customer" | "staff";
  message: string;
  createdAt: string;
};

function formatConvoTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

export default function StaffMessages() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCustomerMsgCount = useRef(0);
  const isInitialLoad = useRef(true);

  const { data: conversations = [], isLoading: isLoadingConvos } = useQuery<Conversation[]>({
    queryKey: ["/api/staff/conversations"],
    refetchInterval: 15000,
  });

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<ChatMessage[]>({
    queryKey: [`/api/staff/jobs/${selectedJobId}/messages`],
    enabled: !!selectedJobId,
    refetchInterval: 5000,
  });

  const selectedConvo = conversations.find(c => c.jobId === selectedJobId) ?? null;

  // Auto-select first conversation
  useEffect(() => {
    if (conversations.length > 0 && !selectedJobId) {
      setSelectedJobId(conversations[0].jobId);
    }
  }, [conversations, selectedJobId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Notify on new customer messages
  useEffect(() => {
    if (isLoadingMessages || !selectedJobId) return;
    const custMsgs = messages.filter(m => m.senderType === "customer");
    if (isInitialLoad.current) {
      prevCustomerMsgCount.current = custMsgs.length;
      isInitialLoad.current = false;
      return;
    }
    if (custMsgs.length > prevCustomerMsgCount.current) {
      toast({ title: "New message from customer" });
    }
    prevCustomerMsgCount.current = custMsgs.length;
  }, [messages, isLoadingMessages, selectedJobId, toast]);

  // Invalidate unread count when conversation opened
  useEffect(() => {
    if (selectedJobId) {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations"] });
    }
  }, [selectedJobId]);

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest(
        "POST",
        `/api/staff/jobs/${selectedJobId}/messages`,
        { message: msg }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/staff/jobs/${selectedJobId}/messages`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations"] });
      setNewMessage("");
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!newMessage.trim() || !selectedJobId) return;
    sendMutation.mutate(newMessage.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Conversation list */}
      <div
        className={`w-full sm:w-80 flex-shrink-0 border-r flex flex-col overflow-hidden ${selectedJobId ? "hidden sm:flex" : "flex"}`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Customer Conversations
          </p>
          {totalUnread > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
              {totalUnread}
            </Badge>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoadingConvos ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No messages yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Customer messages will appear here
              </p>
            </div>
          ) : (
            conversations.map((convo) => {
              const isActive = convo.jobId === selectedJobId;
              return (
                <button
                  key={convo.jobId}
                  className={`w-full text-left px-4 py-3.5 border-b transition-colors flex items-start gap-3 ${
                    isActive ? "bg-primary/8" : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedJobId(convo.jobId)}
                  data-testid={`staff-conversation-${convo.jobId}`}
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="min-w-0">
                        <span className={`text-xs font-semibold truncate block ${convo.unreadCount > 0 ? "text-foreground" : "text-foreground/80"}`}>
                          {convo.customerName}
                        </span>
                        <span className="text-xs text-muted-foreground truncate block">
                          {convo.jobName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {convo.unreadCount > 0 && (
                          <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                            {convo.unreadCount}
                          </Badge>
                        )}
                        {convo.latestMessage && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatConvoTime(convo.latestMessage.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    {convo.latestMessage ? (
                      <p className={`text-xs mt-0.5 truncate ${convo.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {convo.latestMessage.senderType === "staff" ? "You: " : `${convo.customerName}: `}
                        {convo.latestMessage.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">No messages</p>
                    )}
                  </div>
                  {isActive && <ChevronRight className="h-4 w-4 text-primary/50 flex-shrink-0 mt-2.5" />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat panel */}
      {selectedJobId ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-card/40 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="sm:hidden"
              onClick={() => setSelectedJobId(null)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{selectedConvo?.jobName}</p>
              <p className="text-xs text-muted-foreground">{selectedConvo?.customerName}</p>
            </div>
            {selectedConvo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation(`/staff/job/${selectedConvo.jobId}`)}
                data-testid="button-view-job"
              >
                View Job
              </Button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/25 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderType === "staff" ? "justify-end" : "justify-start"}`}
                  data-testid={`staff-message-${msg.id}`}
                >
                  {msg.senderType === "customer" && (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {selectedConvo?.customerName?.[0]?.toUpperCase() || "C"}
                      </span>
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      msg.senderType === "staff"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted rounded-bl-sm"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {msg.message}
                    </p>
                    <p
                      className={`text-[10px] mt-1 ${
                        msg.senderType === "staff"
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground"
                      }`}
                    >
                      {msg.senderType === "customer" ? `${selectedConvo?.customerName} · ` : ""}
                      {format(new Date(msg.createdAt), "d MMM, h:mm a")}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 bg-card/40">
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder="Reply to customer… (Enter to send, Shift+Enter for new line)"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className="resize-none text-sm"
                data-testid="input-staff-message"
              />
              <Button
                onClick={handleSend}
                disabled={!newMessage.trim() || sendMutation.isPending}
                size="icon"
                data-testid="button-staff-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden sm:flex items-center justify-center text-center p-8">
          <div>
            <MessageSquare className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-sm font-medium text-muted-foreground">Select a conversation</p>
          </div>
        </div>
      )}
    </div>
  );
}
