import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  MessageSquare,
  Send,
  ChevronRight,
  Package,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";

type Conversation = {
  jobId: string;
  jobName: string;
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

type CustomerUser = {
  email: string;
  customerName: string | null;
  customerLogoUrl: string | null;
};

function formatConvoTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

export default function CustomerInbox() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isImpersonating } = usePermissions();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevStaffMsgCount = useRef(0);
  const isInitialLoad = useRef(true);

  const { data: currentUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: conversations = [], isLoading: isLoadingConvos } = useQuery<Conversation[]>({
    queryKey: ["/api/customer-portal/conversations"],
    refetchInterval: 10000,
  });

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<ChatMessage[]>({
    queryKey: [`/api/customer-portal/jobs/${selectedJobId}/messages`],
    enabled: !!selectedJobId,
    refetchInterval: 3000,
  });

  const selectedConvo = conversations.find(c => c.jobId === selectedJobId) ?? null;

  // Auto-select first conversation on load (desktop)
  useEffect(() => {
    if (conversations.length > 0 && !selectedJobId) {
      setSelectedJobId(conversations[0].jobId);
    }
  }, [conversations, selectedJobId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Notify on new staff messages
  useEffect(() => {
    if (isLoadingMessages || !selectedJobId) return;
    const staffMsgs = messages.filter(m => m.senderType === "staff");
    if (isInitialLoad.current) {
      prevStaffMsgCount.current = staffMsgs.length;
      isInitialLoad.current = false;
      return;
    }
    if (staffMsgs.length > prevStaffMsgCount.current) {
      toast({ title: "New message from Select Branding Solutions" });
    }
    prevStaffMsgCount.current = staffMsgs.length;
  }, [messages, isLoadingMessages, selectedJobId, toast]);

  // Invalidate unread count when conversation is opened
  useEffect(() => {
    if (selectedJobId) {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
    }
  }, [selectedJobId]);

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest(
        "POST",
        `/api/customer-portal/jobs/${selectedJobId}/messages/send`,
        { message: msg }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/customer-portal/jobs/${selectedJobId}/messages`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
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
    <div className="min-h-screen bg-background flex flex-col">
      {isImpersonating && currentUser && (
        <ImpersonationBanner customerEmail={currentUser.email} />
      )}

      {/* Header */}
      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/customer/dashboard")}
            data-testid="button-back-to-portal"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Messages</span>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                {totalUnread}
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Main layout: sidebar + chat */}
      <div className="flex flex-1 overflow-hidden container mx-auto" style={{ maxHeight: "calc(100vh - 57px)" }}>

        {/* Conversation list */}
        <div
          className={`w-full sm:w-80 flex-shrink-0 border-r flex flex-col overflow-hidden ${selectedJobId ? "hidden sm:flex" : "flex"}`}
        >
          {/* Section header */}
          <div className="px-4 py-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              All Conversations
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoadingConvos ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground font-medium">No conversations yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Messages about your jobs will appear here
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
                    data-testid={`conversation-${convo.jobId}`}
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Package className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-sm font-semibold truncate ${convo.unreadCount > 0 ? "text-foreground" : "text-foreground/80"}`}>
                          {convo.jobName}
                        </span>
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
                          {convo.latestMessage.senderType === "staff" ? "Select: " : "You: "}
                          {convo.latestMessage.message}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/60 mt-0.5">No messages yet — start the conversation</p>
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
            {/* Chat header */}
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
              <div>
                <p className="text-sm font-semibold">{selectedConvo?.jobName}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedConvo?.completed ? "Completed" : "In Production"}
                </p>
              </div>
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
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Send us a message about this job
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.senderType === "customer" ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.id}`}
                  >
                    {msg.senderType === "staff" && (
                      <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                        <span className="text-[10px] font-bold text-primary">SB</span>
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        msg.senderType === "customer"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted rounded-bl-sm"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.message}
                      </p>
                      <p
                        className={`text-[10px] mt-1 ${
                          msg.senderType === "customer"
                            ? "text-primary-foreground/60"
                            : "text-muted-foreground"
                        }`}
                      >
                        {msg.senderType === "staff" ? "Select Branding · " : ""}
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
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="resize-none text-sm"
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sendMutation.isPending}
                  size="icon"
                  data-testid="button-send"
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
              <p className="text-xs text-muted-foreground/60 mt-1">
                Choose a job on the left to view or send messages
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
