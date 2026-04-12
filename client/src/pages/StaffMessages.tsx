import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Search,
  Paperclip,
  X,
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
  customerId: string | null;
  staffRecipientId: string | null;
  customerName: string;
  recipientName: string;
  recipientType: "customer" | "staff";
  subject: string;
  status: string;
  unreadCount: number;
  latestMessage: { message: string; senderType: "customer" | "staff"; createdAt: string } | null;
  updatedAt: string;
};

type MessagingUser = { id: string; name: string; email: string; role: string };

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

  // New direct conversation dialog
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newRecipientId, setNewRecipientId] = useState("");
  const [newRecipientType, setNewRecipientType] = useState<"customer" | "staff">("customer");
  const [newRecipientSearch, setNewRecipientSearch] = useState("");
  const [newFirstMessage, setNewFirstMessage] = useState("");

  // New order chat dialog
  const [showNewOrderChat, setShowNewOrderChat] = useState(false);
  const [newOrderCustomerId, setNewOrderCustomerId] = useState("");
  const [newOrderCustomerSearch, setNewOrderCustomerSearch] = useState("");
  const [newOrderJobName, setNewOrderJobName] = useState("");
  const [newOrderColleagues, setNewOrderColleagues] = useState<string[]>([]);
  const [newOrderMessage, setNewOrderMessage] = useState("");
  const [newOrderFiles, setNewOrderFiles] = useState<File[]>([]);
  const [isCreatingOrderChat, setIsCreatingOrderChat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const { data: staffList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/staff"],
  });

  const { data: messagingUsers = [] } = useQuery<MessagingUser[]>({
    queryKey: ["/api/staff/messaging-users"],
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
      const payload: Record<string, string | undefined> = {
        subject: newSubject,
        message: newFirstMessage || undefined,
      };
      if (newRecipientType === "customer") {
        payload.customerId = newRecipientId;
      } else {
        payload.staffRecipientId = newRecipientId;
      }
      const res = await apiRequest("POST", "/api/staff/direct-conversations", payload);
      return res.json();
    },
    onSuccess: (convo) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      setShowNewConvo(false);
      setNewSubject(""); setNewRecipientId(""); setNewRecipientSearch(""); setNewFirstMessage("");
      setTab("direct");
      setSelected({ type: "direct", conversationId: convo.id });
    },
    onError: () => toast({ title: "Failed to create conversation", variant: "destructive" }),
  });

  const resetOrderChatForm = () => {
    setNewOrderCustomerId("");
    setNewOrderCustomerSearch("");
    setNewOrderJobName("");
    setNewOrderColleagues([]);
    setNewOrderMessage("");
    setNewOrderFiles([]);
  };

  const handleCreateOrderChat = async () => {
    if (!newOrderCustomerId || !newOrderJobName.trim() || !newOrderMessage.trim()) return;
    setIsCreatingOrderChat(true);
    try {
      // 1. Create new job
      const jobRes = await apiRequest("POST", "/api/jobs", {
        customerId: newOrderCustomerId,
        jobName: newOrderJobName.trim(),
        quantity: 1,
      });
      const newJob = await jobRes.json();
      const createdJobId = newJob.id;

      // 2. Upload files if any
      for (const file of newOrderFiles) {
        try {
          const uploadRes = await apiRequest("POST", "/api/staff/objects/upload", {});
          const { url, key } = await uploadRes.json();
          await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
          await apiRequest("POST", `/api/jobs/${createdJobId}/files`, {
            objectKey: key,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || "application/octet-stream",
          });
        } catch {
          toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
        }
      }

      // 3. Build message (prepend CC list if colleagues selected)
      const ccNames = newOrderColleagues
        .map(id => staffList.find(s => s.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      const fullMessage = ccNames
        ? `CC: ${ccNames}\n\n${newOrderMessage.trim()}`
        : newOrderMessage.trim();

      // 4. Send first message
      await apiRequest("POST", `/api/staff/jobs/${createdJobId}/messages`, { message: fullMessage });

      // 5. Refresh and navigate
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setShowNewOrderChat(false);
      resetOrderChatForm();
      setTab("job");
      setSelected({ type: "job", jobId: createdJobId });
    } catch {
      toast({ title: "Failed to create order chat", variant: "destructive" });
    } finally {
      setIsCreatingOrderChat(false);
    }
  };

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

        {/* New chat buttons */}
        <div className="px-3 py-2 border-b">
          {tab === "job" ? (
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => setShowNewOrderChat(true)}
              data-testid="button-new-order-chat"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Order Chat
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => setShowNewConvo(true)}
              data-testid="button-new-conversation"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Conversation
            </Button>
          )}
        </div>

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

      {/* New order chat dialog */}
      <Dialog open={showNewOrderChat} onOpenChange={(open) => {
        setShowNewOrderChat(open);
        if (!open) resetOrderChatForm();
      }}>
        <DialogContent className="max-w-lg" data-testid="dialog-new-order-chat">
          <DialogHeader>
            <DialogTitle>New Order Chat</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-1">
            <div className="space-y-4 py-1 pr-3">

              {/* Customer — searchable, alphabetical */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Customer *</label>
                <div className="border rounded-md overflow-hidden">
                  <div className="flex items-center px-3 py-2 border-b bg-muted/30">
                    <Search className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0" />
                    <input
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      placeholder="Search customers…"
                      value={newOrderCustomerSearch}
                      onChange={e => setNewOrderCustomerSearch(e.target.value)}
                      data-testid="input-order-chat-customer-search"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {customers
                      .filter(c => c.name.toLowerCase().includes(newOrderCustomerSearch.toLowerCase()))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setNewOrderCustomerId(c.id)}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            newOrderCustomerId === c.id
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted/60"
                          }`}
                          data-testid={`option-customer-${c.id}`}
                        >
                          {c.name}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Job name */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Job Name *</label>
                <Input
                  placeholder="e.g. Polo shirts — Spring 2026"
                  value={newOrderJobName}
                  onChange={e => setNewOrderJobName(e.target.value)}
                  data-testid="input-order-chat-job-name"
                />
              </div>

              {/* Colleagues */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Include Colleagues</label>
                <div className="border rounded-md divide-y max-h-36 overflow-y-auto">
                  {staffList.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-2">No staff found</p>
                  ) : (
                    staffList.map(s => (
                      <label
                        key={s.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm"
                        data-testid={`option-colleague-${s.id}`}
                      >
                        <Checkbox
                          checked={newOrderColleagues.includes(s.id)}
                          onCheckedChange={(checked) => {
                            setNewOrderColleagues(prev =>
                              checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                            );
                          }}
                        />
                        {s.name}
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Message *</label>
                <Textarea
                  placeholder="Type your opening message…"
                  rows={3}
                  value={newOrderMessage}
                  onChange={e => setNewOrderMessage(e.target.value)}
                  data-testid="input-order-chat-message"
                />
              </div>

              {/* Attachments */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Attachments</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const picked = Array.from(e.target.files || []);
                    setNewOrderFiles(prev => [...prev, ...picked]);
                    e.target.value = "";
                  }}
                  data-testid="input-order-chat-files"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-attach-files"
                >
                  <Paperclip className="h-3.5 w-3.5 mr-1.5" />
                  Attach Files
                </Button>
                {newOrderFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {newOrderFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1.5">
                        <span className="truncate mr-2">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewOrderFiles(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          data-testid={`button-remove-file-${i}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewOrderChat(false)} disabled={isCreatingOrderChat}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrderChat}
              disabled={!newOrderCustomerId || !newOrderJobName.trim() || !newOrderMessage.trim() || isCreatingOrderChat}
              data-testid="button-start-order-chat"
            >
              {isCreatingOrderChat ? "Creating…" : "Start Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New conversation dialog */}
      <Dialog open={showNewConvo} onOpenChange={(open) => {
        setShowNewConvo(open);
        if (!open) { setNewSubject(""); setNewRecipientId(""); setNewRecipientSearch(""); setNewFirstMessage(""); }
      }}>
        <DialogContent data-testid="dialog-new-conversation">
          <DialogHeader>
            <DialogTitle>New Direct Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">To *</label>
              <Input
                placeholder="Search customers or staff…"
                value={newRecipientSearch}
                onChange={e => { setNewRecipientSearch(e.target.value); setNewRecipientId(""); }}
                data-testid="input-convo-recipient-search"
                autoComplete="off"
              />
              {newRecipientSearch.trim() && !newRecipientId && (() => {
                const q = newRecipientSearch.toLowerCase();
                const matchedCustomers = customers
                  .filter(c => c.name.toLowerCase().includes(q))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .slice(0, 5)
                  .map(c => ({ id: c.id, name: c.name, type: "customer" as const }));
                const matchedStaff = messagingUsers
                  .filter(u => u.name.toLowerCase().includes(q))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .slice(0, 5)
                  .map(u => ({ id: u.id, name: u.name, type: "staff" as const }));
                const results = [...matchedCustomers, ...matchedStaff];
                if (results.length === 0) return (
                  <div className="border rounded-md mt-1 p-3 text-sm text-muted-foreground">No results found</div>
                );
                return (
                  <div className="border rounded-md mt-1 overflow-hidden max-h-48 overflow-y-auto" data-testid="list-convo-recipients">
                    {results.map(r => (
                      <button
                        key={`${r.type}-${r.id}`}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover-elevate flex items-center gap-2"
                        onClick={() => {
                          setNewRecipientId(r.id);
                          setNewRecipientType(r.type);
                          setNewRecipientSearch(r.name);
                        }}
                        data-testid={`option-recipient-${r.id}`}
                      >
                        <span className="flex-1">{r.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${r.type === "staff" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
                          {r.type === "staff" ? "Staff" : "Customer"}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}
              {newRecipientId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Selected: <span className="font-medium">{newRecipientSearch}</span>
                  {" · "}<button type="button" className="text-destructive underline text-xs" onClick={() => { setNewRecipientId(""); setNewRecipientSearch(""); }}>Clear</button>
                </p>
              )}
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
              disabled={!newSubject.trim() || !newRecipientId || createConvoMutation.isPending}
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
