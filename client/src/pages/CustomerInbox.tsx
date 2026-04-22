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
  ArrowLeft,
  MessageSquare,
  Send,
  ChevronRight,
  Package,
  MessageCircle,
  Plus,
  Pin,
  CheckCircle,
  Search,
  Trash2,
  Archive,
  X,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";

type JobConversation = {
  jobId: string;
  jobName: string;
  status: string;
  completed: boolean;
  messageCount: number;
  unreadCount: number;
  latestMessage: { message: string; senderType: "customer" | "staff"; createdAt: string } | null;
};

type DirectConversation = {
  id: string;
  customerId: string;
  subject: string;
  status: string;
  unreadCount: number;
  latestMessage: { message: string; senderType: "customer" | "staff"; createdAt: string } | null;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  senderType: "customer" | "staff";
  senderName?: string | null;
  senderImageUrl?: string | null;
  message: string;
  imageUrl?: string | null;
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

type Tab = "job" | "direct";
type Selected =
  | { type: "job"; jobId: string }
  | { type: "direct"; conversationId: string }
  | null;

export default function CustomerInbox() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isImpersonating } = usePermissions();
  const [tab, setTab] = useState<Tab>("job");
  const [selected, setSelected] = useState<Selected>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevStaffMsgCount = useRef(0);
  const isInitialLoad = useRef(true);

  // New conversation dialog
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newFirstMessage, setNewFirstMessage] = useState("");
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null); // null = Everyone

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  const { data: currentUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: staffMembers = [] } = useQuery<{ id: string; firstName: string; fullName: string; profileImageUrl: string | null }[]>({
    queryKey: ["/api/customer-portal/staff-members"],
  });

  const { data: jobConversations = [], isLoading: isLoadingJobConvos } = useQuery<JobConversation[]>({
    queryKey: ["/api/customer-portal/conversations"],
    refetchInterval: 10000,
  });

  const { data: directConversations = [], isLoading: isLoadingDirectConvos } = useQuery<DirectConversation[]>({
    queryKey: ["/api/customer-portal/direct-conversations"],
    refetchInterval: 10000,
  });

  const jobId = selected?.type === "job" ? selected.jobId : null;
  const directId = selected?.type === "direct" ? selected.conversationId : null;

  const { data: jobMessages = [], isLoading: isLoadingJobMsgs } = useQuery<ChatMessage[]>({
    queryKey: [`/api/customer-portal/jobs/${jobId}/messages`],
    enabled: !!jobId,
    refetchInterval: 3000,
  });

  const { data: directMessages = [], isLoading: isLoadingDirectMsgs } = useQuery<ChatMessage[]>({
    queryKey: ["/api/customer-portal/direct-conversations", directId, "messages"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customer-portal/direct-conversations/${directId}/messages`);
      return res.json();
    },
    enabled: !!directId,
    refetchInterval: 3000,
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

  useEffect(() => {
    if (isLoadingMessages || !selected) return;
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
  }, [messages, isLoadingMessages, selected, toast]);

  useEffect(() => {
    if (selected) {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations"] });
    }
  }, [selected]);

  const sendJobMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest("POST", `/api/customer-portal/jobs/${jobId}/messages/send`, { message: msg });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customer-portal/jobs/${jobId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
      setNewMessage("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const sendDirectMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest("POST", `/api/customer-portal/direct-conversations/${directId}/messages`, { message: msg });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations", directId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations"] });
      setNewMessage("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const createConvoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/customer-portal/direct-conversations", {
        subject: newSubject,
        message: newFirstMessage || undefined,
        staffRecipientId: selectedRecipientId || undefined,
      });
      return res.json();
    },
    onSuccess: (convo) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations"] });
      setShowNewConvo(false);
      setNewSubject(""); setNewFirstMessage(""); setSelectedRecipientId(null);
      setSelected({ type: "direct", conversationId: convo.id });
    },
    onError: () => toast({ title: "Failed to start conversation", variant: "destructive" }),
  });

  const archiveConvoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/customer-portal/direct-conversations/${id}/archive`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations"] });
      if (selected?.type === "direct") setSelected(null);
      toast({ title: "Conversation archived" });
    },
    onError: () => toast({ title: "Failed to archive conversation", variant: "destructive" }),
  });

  const deleteConvoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/customer-portal/direct-conversations/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations"] });
      if (selected?.type === "direct") setSelected(null);
      toast({ title: "Conversation deleted" });
    },
    onError: () => toast({ title: "Failed to delete conversation", variant: "destructive" }),
  });

  const handleSend = () => {
    if (!newMessage.trim() || !selected) return;
    if (selected.type === "job") sendJobMutation.mutate(newMessage.trim());
    else sendDirectMutation.mutate(newMessage.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const jobUnread = jobConversations.reduce((s, c) => s + c.unreadCount, 0);
  const directUnread = directConversations.reduce((s, c) => s + c.unreadCount, 0);
  const totalUnread = jobUnread + directUnread;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {isImpersonating && currentUser && (
        <ImpersonationBanner customerEmail={currentUser.email} />
      )}

      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/customer/dashboard")} data-testid="button-back-to-portal">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Messages</span>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">{totalUnread}</Badge>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden container mx-auto" style={{ maxHeight: "calc(100vh - 57px)" }}>

        {/* Left panel */}
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

          {/* New conversation button (direct tab only) */}
          {tab === "direct" && (
            <div className="px-3 py-2 border-b">
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => setShowNewConvo(true)}
                data-testid="button-new-conversation"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Message
              </Button>
            </div>
          )}

          {/* Search bar */}
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search conversations…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
                data-testid="input-search-conversations"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === "job" ? (
              isLoadingJobConvos ? (
                <LoadingSpinner />
              ) : jobConversations.length === 0 ? (
                <EmptyState label="No conversations yet" sublabel="Messages about your jobs will appear here" />
              ) : (
                jobConversations
                  .filter(c => !searchQuery || c.jobName.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(convo => (
                    <ConvoRow
                      key={convo.jobId}
                      isActive={selected?.type === "job" && selected.jobId === convo.jobId}
                      icon={<Package className="h-4 w-4 text-primary" />}
                      title={convo.jobName}
                      subtitle={convo.completed ? "Completed" : "In Production"}
                      unread={convo.unreadCount}
                      latest={convo.latestMessage}
                      myLabel="You"
                      theirLabel="Select"
                      onClick={() => setSelected({ type: "job", jobId: convo.jobId })}
                      testId={`conversation-${convo.jobId}`}
                    />
                  ))
              )
            ) : (
              isLoadingDirectConvos ? (
                <LoadingSpinner />
              ) : directConversations.filter(c => c.status === "open").length === 0 ? (
                <EmptyState label="No direct messages" sublabel="Start a conversation with Select Branding" />
              ) : (
                directConversations
                  .filter(c => c.status === "open" && (!searchQuery || c.subject.toLowerCase().includes(searchQuery.toLowerCase())))
                  .map(convo => (
                    <ConvoRow
                      key={convo.id}
                      isActive={selected?.type === "direct" && selected.conversationId === convo.id}
                      icon={<MessageCircle className="h-4 w-4 text-primary" />}
                      title={convo.subject}
                      subtitle="Select Branding Solutions"
                      unread={convo.unreadCount}
                      latest={convo.latestMessage}
                      myLabel="You"
                      theirLabel="Select"
                      onClick={() => setSelected({ type: "direct", conversationId: convo.id })}
                      testId={`direct-conversation-${convo.id}`}
                      onArchive={() => archiveConvoMutation.mutate(convo.id)}
                      onDelete={() => deleteConvoMutation.mutate(convo.id)}
                    />
                  ))
              )
            )}
          </div>
        </div>

        {/* Chat panel */}
        {selected ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b bg-card/40 flex items-center gap-3">
              <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => setSelected(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                {selected.type === "job" ? <Package className="h-4 w-4 text-primary" /> : <MessageCircle className="h-4 w-4 text-primary" />}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {selected.type === "job" ? selectedJobConvo?.jobName : selectedDirectConvo?.subject}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selected.type === "job"
                    ? (selectedJobConvo?.completed ? "Completed" : "In Production")
                    : "Select Branding Solutions"}
                </p>
              </div>
            </div>

            {/* Pinned sample images — shown when staff has sent images in this job chat */}
            {selected.type === "job" && messages.some(m => m.imageUrl && m.senderType === "staff") && (
              <div className="border-b bg-muted/30 px-4 py-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Pin className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sample Images for Approval</span>
                </div>
                <div className="flex gap-2 flex-wrap items-end">
                  {messages.filter(m => m.imageUrl && m.senderType === "staff").map(m => (
                    <a
                      key={m.id}
                      href={m.imageUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                      data-testid={`pinned-sample-${m.id}`}
                    >
                      <img
                        src={m.imageUrl!}
                        alt="Sample"
                        className="h-14 w-14 rounded-md object-cover border border-border hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1.5"
                    onClick={() => setNewMessage("Approved, please proceed.")}
                    data-testid="button-approve-sample-quick-reply"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                    Approved, please proceed
                  </Button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoadingMessages ? (
                <LoadingSpinner />
              ) : messages.length === 0 ? (
                <EmptyState label="No messages yet" sublabel="Start the conversation below" />
              ) : (
                messages.map((msg, idx) => {
                  const isCustomer = msg.senderType === "customer";
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const sameGroup = prevMsg && prevMsg.senderType === msg.senderType && prevMsg.senderName === msg.senderName;
                  const showAvatar = !sameGroup;
                  const initials = msg.senderName
                    ? msg.senderName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                    : isCustomer ? "ME" : "SB";
                  return (
                    <div key={msg.id} className={`flex items-end gap-2.5 ${isCustomer ? "flex-row-reverse" : "flex-row"}`} data-testid={`message-${msg.id}`}>
                      {/* Avatar */}
                      <div className={`h-8 w-8 rounded-full overflow-hidden flex items-center justify-center border-2 border-background shrink-0 ${isCustomer ? "bg-blue-500" : "bg-orange-400"} ${showAvatar ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                        {msg.senderImageUrl ? (
                          <img src={msg.senderImageUrl} alt={msg.senderName || ""} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-white">{initials}</span>
                        )}
                      </div>
                      <div className={`max-w-[72%] flex flex-col gap-0.5 ${isCustomer ? "items-end" : "items-start"}`}>
                        {showAvatar && msg.senderName && (
                          <p className={`text-[10px] font-semibold text-muted-foreground px-1 ${isCustomer ? "text-right" : ""}`}>{msg.senderName}</p>
                        )}
                        <div className={`rounded-2xl px-4 py-2.5 ${isCustomer ? "bg-blue-500 text-white rounded-br-sm" : "bg-orange-400 text-white rounded-bl-sm"}`}>
                          {msg.message.trim() && (
                            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.message}</p>
                          )}
                          {msg.imageUrl && (
                            <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                              <img src={msg.imageUrl} alt="Sample" className="max-w-full rounded-lg max-h-48 object-contain hover:opacity-90 transition-opacity" />
                            </a>
                          )}
                          <p className="text-[10px] mt-1 text-white/70">
                            {format(new Date(msg.createdAt), "d MMM, h:mm a")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t p-3 bg-card/40">
              <div className="flex gap-2 items-end">
                <Textarea
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="resize-none text-sm"
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sendJobMutation.isPending || sendDirectMutation.isPending}
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
              <p className="text-xs text-muted-foreground/60 mt-1">Choose a conversation from the left to read and reply</p>
            </div>
          </div>
        )}
      </div>

      {/* New direct conversation dialog */}
      <Dialog open={showNewConvo} onOpenChange={(open) => { setShowNewConvo(open); if (!open) { setNewSubject(""); setNewFirstMessage(""); setSelectedRecipientId(null); } }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-new-conversation">
          <DialogHeader>
            <DialogTitle>New Message to Select Branding</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">

            {/* Send to */}
            <div>
              <label className="text-sm font-medium mb-3 block">Send to</label>
              <div className="flex flex-wrap gap-3">
                {/* Everyone tile */}
                <button
                  type="button"
                  onClick={() => setSelectedRecipientId(null)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-colors w-16 ${selectedRecipientId === null ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground/40"}`}
                  data-testid="recipient-everyone"
                >
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-[11px] font-medium text-center leading-tight">Everyone</span>
                </button>

                {/* Staff tiles */}
                {staffMembers.map(member => {
                  const initials = member.firstName.slice(0, 2).toUpperCase();
                  const isSelected = selectedRecipientId === member.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setSelectedRecipientId(member.id)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-colors w-16 ${isSelected ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground/40"}`}
                      data-testid={`recipient-staff-${member.id}`}
                    >
                      <div className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center bg-orange-400 flex-shrink-0">
                        {member.profileImageUrl ? (
                          <img src={member.profileImageUrl} alt={member.firstName} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-white">{initials}</span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-center leading-tight truncate w-full">{member.firstName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Subject *</label>
              <Input
                placeholder="e.g. Question about my order"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                data-testid="input-convo-subject"
              />
            </div>

            {/* Message */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Message (optional)</label>
              <Textarea
                placeholder="Type your message…"
                rows={3}
                value={newFirstMessage}
                onChange={e => setNewFirstMessage(e.target.value)}
                data-testid="input-convo-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewConvo(false)}>Cancel</Button>
            <Button
              onClick={() => createConvoMutation.mutate()}
              disabled={!newSubject.trim() || createConvoMutation.isPending}
              data-testid="button-send-new-conversation"
            >
              {createConvoMutation.isPending ? "Sending…" : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConvoRow({ isActive, icon, title, subtitle, unread, latest, myLabel, theirLabel, onClick, testId, onArchive, onDelete }: {
  isActive: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  unread: number;
  latest: { message: string; senderType: string; createdAt: string } | null;
  myLabel: string;
  theirLabel: string;
  onClick: () => void;
  testId: string;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`group/row w-full border-b transition-colors flex items-start gap-3 ${isActive ? "bg-primary/8" : "hover:bg-muted/50"}`}
      data-testid={testId}
    >
      <button className="flex items-start gap-3 flex-1 min-w-0 px-4 py-3.5 text-left" onClick={onClick}>
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className={`text-sm font-semibold truncate ${unread > 0 ? "text-foreground" : "text-foreground/80"}`}>{title}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {unread > 0 && <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{unread}</Badge>}
              {latest && <span className="text-[10px] text-muted-foreground">{formatConvoTime(latest.createdAt)}</span>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
          {latest && (
            <p className={`text-xs mt-0.5 truncate ${unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {latest.senderType === "customer" ? `${myLabel}: ` : `${theirLabel}: `}{latest.message}
            </p>
          )}
        </div>
        {isActive && <ChevronRight className="h-4 w-4 text-primary/50 flex-shrink-0 mt-2.5" />}
      </button>
      {(onArchive || onDelete) && (
        <div className="flex flex-col justify-center gap-1 pr-2 py-3 opacity-0 group-hover/row:opacity-100 transition-opacity">
          {onArchive && (
            <button
              onClick={e => { e.stopPropagation(); onArchive(); }}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Archive"
              data-testid={`button-archive-${testId}`}
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete"
              data-testid={`button-delete-${testId}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
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
