import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Send,
  ChevronRight,
  Package,
  ArrowLeft,
  Plus,
  MessageCircle,
  Archive,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

type JobConversation = {
  jobId: string;
  jobName: string;
  customerId: string;
  customerName: string;
  status: string;
  completed: boolean;
  messageCount: number;
  unreadCount: number;
  latestMessage: { message: string; senderType: "customer" | "staff"; createdAt: string } | null;
};

type DirectConversation = {
  id: string;
  customerId: string;
  customerName: string;
  subject: string;
  status: string;
  unreadCount: number;
  latestMessage: { message: string; senderType: "customer" | "staff"; createdAt: string } | null;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  senderType: "customer" | "staff";
  message: string;
  createdAt: string;
};

type Customer = { id: string; name: string };

function formatConvoTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

type Tab = "job" | "direct";
type Selected =
  | { type: "job"; jobId: string }
  | { type: "direct"; conversationId: string }
  | null;

export default function StaffMessages() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("job");
  const [selected, setSelected] = useState<Selected>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCustomerMsgCount = useRef(0);
  const isInitialLoad = useRef(true);

  // New conversation dialog
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newFirstMessage, setNewFirstMessage] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: jobConversations = [], isLoading: isLoadingJobConvos } = useQuery<JobConversation[]>({
    queryKey: ["/api/staff/conversations"],
    refetchInterval: 15000,
  });

  const { data: directConversations = [], isLoading: isLoadingDirectConvos } = useQuery<DirectConversation[]>({
    queryKey: ["/api/staff/direct-conversations"],
    refetchInterval: 10000,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const jobId = selected?.type === "job" ? selected.jobId : null;
  const directId = selected?.type === "direct" ? selected.conversationId : null;

  const { data: jobMessages = [], isLoading: isLoadingJobMsgs } = useQuery<ChatMessage[]>({
    queryKey: [`/api/staff/jobs/${jobId}/messages`],
    enabled: !!jobId,
    refetchInterval: 5000,
  });

  const { data: directMessages = [], isLoading: isLoadingDirectMsgs } = useQuery<ChatMessage[]>({
    queryKey: ["/api/staff/direct-conversations", directId, "messages"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/staff/direct-conversations/${directId}/messages`);
      return res.json();
    },
    enabled: !!directId,
    refetchInterval: 5000,
  });

  const messages = selected?.type === "job" ? jobMessages : directMessages;
  const isLoadingMessages = selected?.type === "job" ? isLoadingJobMsgs : isLoadingDirectMsgs;

  const selectedJobConvo = jobConversations.find(c => c.jobId === jobId) ?? null;
  const selectedDirectConvo = directConversations.find(c => c.id === directId) ?? null;

  // Auto-select first conversation per tab
  useEffect(() => {
    if (tab === "job" && jobConversations.length > 0 && !jobId) {
      setSelected({ type: "job", jobId: jobConversations[0].jobId });
    }
    if (tab === "direct" && directConversations.length > 0 && !directId) {
      setSelected({ type: "direct", conversationId: directConversations[0].id });
    }
  }, [tab, jobConversations, directConversations, jobId, directId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Notify on new customer messages
  useEffect(() => {
    if (isLoadingMessages || !selected) return;
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
  }, [messages, isLoadingMessages, selected, toast]);

  useEffect(() => {
    if (selected) {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
    }
  }, [selected]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const sendJobMessageMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest("POST", `/api/staff/jobs/${jobId}/messages`, { message: msg });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/staff/jobs/${jobId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations"] });
      setNewMessage("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const sendDirectMessageMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest("POST", `/api/staff/direct-conversations/${directId}/messages`, { message: msg });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations", directId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      setNewMessage("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const createConvoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staff/direct-conversations", {
        customerId: newCustomerId,
        subject: newSubject,
        message: newFirstMessage || undefined,
      });
      return res.json();
    },
    onSuccess: (convo) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      setShowNewConvo(false);
      setNewSubject(""); setNewCustomerId(""); setNewFirstMessage("");
      setTab("direct");
      setSelected({ type: "direct", conversationId: convo.id });
    },
    onError: () => toast({ title: "Failed to create conversation", variant: "destructive" }),
  });

  const archiveConvoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/staff/direct-conversations/${id}`, { status: "archived" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      setSelected(null);
    },
  });

  const handleSend = () => {
    if (!newMessage.trim() || !selected) return;
    if (selected.type === "job") sendJobMessageMutation.mutate(newMessage.trim());
    else sendDirectMessageMutation.mutate(newMessage.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const jobUnread = jobConversations.reduce((s, c) => s + c.unreadCount, 0);
  const directUnread = directConversations.reduce((s, c) => s + c.unreadCount, 0);

  const showList = !selected || window.innerWidth >= 640;
  const showChat = !!selected;

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left panel: tabs + conversation list */}
      <div className={`w-full sm:w-80 flex-shrink-0 border-r flex flex-col overflow-hidden ${selected ? "hidden sm:flex" : "flex"}`}>
        {/* Tabs */}
        <div className="border-b">
          <div className="flex">
            {(["job", "direct"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelected(null); isInitialLoad.current = true; }}
                className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${t}`}
              >
                {t === "job" ? <Package className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                {t === "job" ? "Order Chats" : "Direct Messages"}
                {(t === "job" ? jobUnread : directUnread) > 0 && (
                  <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                    {t === "job" ? jobUnread : directUnread}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* New conversation button (direct only) */}
        {tab === "direct" && (
          <div className="px-3 py-2 border-b">
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => setShowNewConvo(true)}
              data-testid="button-new-conversation"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Conversation
            </Button>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {tab === "job" ? (
            isLoadingJobConvos ? (
              <LoadingSpinner />
            ) : jobConversations.length === 0 ? (
              <EmptyState label="No job conversations yet" sublabel="Customer messages will appear here" />
            ) : (
              jobConversations.map(c => (
                <ConvoRow
                  key={c.jobId}
                  isActive={selected?.type === "job" && selected.jobId === c.jobId}
                  title={c.customerName}
                  subtitle={c.jobName}
                  unread={c.unreadCount}
                  latest={c.latestMessage}
                  senderLabel={c.customerName}
                  onClick={() => setSelected({ type: "job", jobId: c.jobId })}
                  testId={`job-convo-${c.jobId}`}
                />
              ))
            )
          ) : (
            isLoadingDirectConvos ? (
              <LoadingSpinner />
            ) : directConversations.filter(c => c.status === "open").length === 0 ? (
              <EmptyState label="No direct conversations" sublabel="Start a conversation with a customer" />
            ) : (
              directConversations.filter(c => c.status === "open").map(c => (
                <ConvoRow
                  key={c.id}
                  isActive={selected?.type === "direct" && selected.conversationId === c.id}
                  title={c.customerName}
                  subtitle={c.subject}
                  unread={c.unreadCount}
                  latest={c.latestMessage}
                  senderLabel={c.customerName}
                  onClick={() => setSelected({ type: "direct", conversationId: c.id })}
                  testId={`direct-convo-${c.id}`}
                />
              ))
            )
          )}
        </div>
      </div>

      {/* Right panel: chat */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b bg-card/40 flex items-center gap-3">
            <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              {selected.type === "job" ? <Package className="h-4 w-4 text-primary" /> : <MessageCircle className="h-4 w-4 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              {selected.type === "job" ? (
                <>
                  <p className="text-sm font-semibold truncate">{selectedJobConvo?.jobName}</p>
                  <p className="text-xs text-muted-foreground">{selectedJobConvo?.customerName}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold truncate">{selectedDirectConvo?.subject}</p>
                  <p className="text-xs text-muted-foreground">{selectedDirectConvo?.customerName}</p>
                </>
              )}
            </div>
            {selected.type === "job" && selectedJobConvo && (
              <Button variant="outline" size="sm" onClick={() => setLocation(`/staff/job/${selectedJobConvo.jobId}`)} data-testid="button-view-job">
                View Job
              </Button>
            )}
            {selected.type === "direct" && selectedDirectConvo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => archiveConvoMutation.mutate(selectedDirectConvo.id)}
                data-testid="button-archive-convo"
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoadingMessages ? (
              <LoadingSpinner />
            ) : messages.length === 0 ? (
              <EmptyState label="No messages yet" />
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.senderType === "staff" ? "justify-end" : "justify-start"}`} data-testid={`message-${msg.id}`}>
                  {msg.senderType === "customer" && (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {(selected.type === "job" ? selectedJobConvo?.customerName : selectedDirectConvo?.customerName)?.[0]?.toUpperCase() || "C"}
                      </span>
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.senderType === "staff" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.message}</p>
                    <p className={`text-[10px] mt-1 ${msg.senderType === "staff" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {format(new Date(msg.createdAt), "d MMM, h:mm a")}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-3 bg-card/40">
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder="Reply… (Enter to send, Shift+Enter for new line)"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className="resize-none text-sm"
                data-testid="input-staff-message"
              />
              <Button
                onClick={handleSend}
                disabled={!newMessage.trim() || sendJobMessageMutation.isPending || sendDirectMessageMutation.isPending}
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

      {/* New conversation dialog */}
      <Dialog open={showNewConvo} onOpenChange={setShowNewConvo}>
        <DialogContent data-testid="dialog-new-conversation">
          <DialogHeader>
            <DialogTitle>New Direct Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Customer *</label>
              <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                <SelectTrigger data-testid="select-convo-customer">
                  <SelectValue placeholder="Select customer…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Subject *</label>
              <Input
                placeholder="e.g. Delivery update for order #123"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                data-testid="input-convo-subject"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">First message (optional)</label>
              <Textarea
                placeholder="Type your opening message…"
                rows={3}
                value={newFirstMessage}
                onChange={e => setNewFirstMessage(e.target.value)}
                data-testid="input-convo-first-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewConvo(false)}>Cancel</Button>
            <Button
              onClick={() => createConvoMutation.mutate()}
              disabled={!newSubject.trim() || !newCustomerId || createConvoMutation.isPending}
              data-testid="button-create-conversation"
            >
              {createConvoMutation.isPending ? "Creating…" : "Start Conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConvoRow({ isActive, title, subtitle, unread, latest, senderLabel, onClick, testId }: {
  isActive: boolean;
  title: string;
  subtitle: string;
  unread: number;
  latest: { message: string; senderType: string; createdAt: string } | null;
  senderLabel: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className={`w-full text-left px-4 py-3.5 border-b transition-colors flex items-start gap-3 ${isActive ? "bg-primary/8" : "hover:bg-muted/50"}`}
      onClick={onClick}
      data-testid={testId}
    >
      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-bold text-primary">{title[0]?.toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <div className="min-w-0">
            <span className={`text-xs font-semibold truncate block ${unread > 0 ? "text-foreground" : "text-foreground/80"}`}>{title}</span>
            <span className="text-xs text-muted-foreground truncate block">{subtitle}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {unread > 0 && <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{unread}</Badge>}
            {latest && <span className="text-[10px] text-muted-foreground">{formatConvoTime(latest.createdAt)}</span>}
          </div>
        </div>
        {latest ? (
          <p className={`text-xs mt-0.5 truncate ${unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
            {latest.senderType === "staff" ? "You: " : `${senderLabel}: `}{latest.message}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 mt-0.5">No messages yet</p>
        )}
      </div>
      {isActive && <ChevronRight className="h-4 w-4 text-primary/50 flex-shrink-0 mt-2.5" />}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

function EmptyState({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <div className="py-16 px-4 text-center">
      <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground font-medium">{label}</p>
      {sublabel && <p className="text-xs text-muted-foreground/70 mt-1">{sublabel}</p>}
    </div>
  );
}
