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
  PenLine,
  Bell,
  BellOff,
  Paperclip,
  FileText,
  MailOpen,
  Clock,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, isToday, isYesterday } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
import { useConversationFlags } from "@/hooks/useConversationFlags";
import { useAppBadge } from "@/hooks/useAppBadge";

type JobConversation = {
  jobId: string;
  jobName: string;
  status: string;
  completed: boolean;
  messageCount: number;
  unreadCount: number;
  isArchived: boolean;
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
  emailNotificationsMessages?: boolean;
  emailNotificationsDispatch?: boolean;
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
  const flags = useConversationFlags("customer", (reminder) => {
    toast({ title: `Reminder: ${reminder.label}`, description: "You asked to be reminded about this conversation." });
  });
  const { isImpersonating } = usePermissions();
  const [tab, setTab] = useState<Tab>("job");
  const [selected, setSelected] = useState<Selected>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevStaffMsgCount = useRef(0);
  const isInitialLoad = useRef(true);
  const [newMessageBanner, setNewMessageBanner] = useState(false);

  // Request browser notification permission once on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // New conversation dialog (direct messages)
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newFirstMessage, setNewFirstMessage] = useState("");
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null); // null = Everyone

  // New job chat dialog
  const [showNewJobChat, setShowNewJobChat] = useState(false);
  const [newJobChatJobId, setNewJobChatJobId] = useState<string>("");
  const [newJobChatMessage, setNewJobChatMessage] = useState("");
  const [jobPickerSearch, setJobPickerSearch] = useState("");

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // File attachment
  const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/avif"]);
  const [chatImage, setChatImage] = useState<{ key: string; previewUrl: string | null; isImage: boolean; fileName: string } | null>(null);
  const [isUploadingChatImage, setIsUploadingChatImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const { data: currentUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const notificationSettingsMutation = useMutation({
    mutationFn: (settings: { emailNotificationsMessages?: boolean; emailNotificationsDispatch?: boolean }) =>
      apiRequest("PATCH", "/api/customer-auth/me/notification-settings", settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-auth/user"] });
    },
    onError: () => {
      toast({ title: "Failed to update notification settings", variant: "destructive" });
    },
  });

  const { data: staffMembers = [] } = useQuery<{ id: string; firstName: string; fullName: string; profileImageUrl: string | null }[]>({
    queryKey: ["/api/customer-portal/staff-members"],
  });

  const { data: allCustomerJobs = [] } = useQuery<{ id: string; jobName: string; status: string }[]>({
    queryKey: ["/api/customer-portal/jobs"],
    enabled: showNewJobChat,
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
  const convKey = jobId ? `job:${jobId}` : directId ? `direct:${directId}` : null;

  const handleMarkUnread = () => {
    if (!convKey) return;
    flags.markUnread(convKey);
    setSelected(null);
    toast({ title: "Marked as unread" });
  };

  const handleToggleReminder = () => {
    if (!convKey) return;
    if (flags.hasReminder(convKey)) {
      flags.clearReminder(convKey);
      toast({ title: "Reminder cancelled" });
    } else {
      const label = selected?.type === "job"
        ? selectedJobConvo?.jobName || "Job conversation"
        : selectedDirectConvo?.subject || "General chat";
      flags.setReminder(convKey, label || "Conversation");
      toast({ title: "Reminder set", description: "We'll remind you in 1 hour." });
    }
  };

  // Auto-select first conversation per tab
  useEffect(() => {
    if (tab === "job" && jobConversations.length > 0 && !jobId) {
      const active = jobConversations.find(c => !c.isArchived);
      if (active) {
        setSelected({ type: "job", jobId: active.jobId });
      } else {
        // All archived — auto-expand the archived section and select the first one
        setShowArchivedJobs(true);
        setSelected({ type: "job", jobId: jobConversations[0].jobId });
      }
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
      setNewMessageBanner(true);
      if ("Notification" in window && Notification.permission === "granted") {
        const latest = staffMsgs[staffMsgs.length - 1];
        new Notification("New message from Select Branding Solutions", {
          body: latest?.message ? latest.message.slice(0, 120) : "You have a new message",
          icon: "/favicon.ico",
        });
      }
    }
    prevStaffMsgCount.current = staffMsgs.length;
  }, [messages, isLoadingMessages, selected, toast]);

  useEffect(() => {
    if (selected) {
      setNewMessageBanner(false);
      isInitialLoad.current = true;
      setChatImage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations"] });
    }
  }, [selected]);

  useEffect(() => {
    if (convKey) flags.clearUnread(convKey);
  }, [convKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendJobMutation = useMutation({
    mutationFn: async ({ message, imageUrl }: { message: string; imageUrl?: string }) => {
      const res = await apiRequest("POST", `/api/customer-portal/jobs/${jobId}/messages/send`, {
        message,
        ...(imageUrl ? { imageUrl } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customer-portal/jobs/${jobId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
      setNewMessage("");
      setChatImage(null);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const startJobChatMutation = useMutation({
    mutationFn: async ({ targetJobId, message }: { targetJobId: string; message: string }) => {
      if (!message.trim()) return null;
      const res = await apiRequest("POST", `/api/customer-portal/jobs/${targetJobId}/messages/send`, { message: message.trim() });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
      setShowNewJobChat(false);
      setNewJobChatJobId("");
      setNewJobChatMessage("");
      setJobPickerSearch("");
      setTab("job");
      setSelected({ type: "job", jobId: vars.targetJobId });
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const handleStartJobChat = () => {
    if (!newJobChatJobId) return;
    startJobChatMutation.mutate({ targetJobId: newJobChatJobId, message: newJobChatMessage });
  };

  const sendDirectMutation = useMutation({
    mutationFn: async ({ message, imageUrl }: { message: string; imageUrl?: string }) => {
      const res = await apiRequest("POST", `/api/customer-portal/direct-conversations/${directId}/messages`, {
        message,
        ...(imageUrl ? { imageUrl } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations", directId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/direct-conversations"] });
      setNewMessage("");
      setChatImage(null);
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

  const [showArchivedJobs, setShowArchivedJobs] = useState(false);

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

  const archiveJobConvoMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("PUT", `/api/customer-portal/jobs/${jobId}/conversation/archive`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
      if (selected?.type === "job") setSelected(null);
      toast({ title: "Conversation hidden" });
    },
    onError: () => toast({ title: "Failed to hide conversation", variant: "destructive" }),
  });

  const unarchiveJobConvoMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("PUT", `/api/customer-portal/jobs/${jobId}/conversation/unarchive`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/conversations"] });
      toast({ title: "Conversation restored" });
    },
    onError: () => toast({ title: "Failed to restore conversation", variant: "destructive" }),
  });

  const handleSend = () => {
    if ((!newMessage.trim() && !chatImage) || !selected) return;
    let payload: { message: string; imageUrl?: string };
    if (chatImage) {
      if (chatImage.isImage) {
        payload = { message: newMessage.trim(), imageUrl: chatImage.key };
      } else {
        const fileMarker = `[FILE:${chatImage.fileName}:${chatImage.key}]`;
        const text = [newMessage.trim(), fileMarker].filter(Boolean).join("\n");
        payload = { message: text };
      }
    } else {
      payload = { message: newMessage.trim() };
    }
    if (selected.type === "job") sendJobMutation.mutate(payload);
    else sendDirectMutation.mutate(payload);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const processFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 20 MB", variant: "destructive" });
      return;
    }
    setIsUploadingChatImage(true);
    try {
      const contentType = file.type || "application/octet-stream";
      const isImage = IMAGE_MIME_TYPES.has(file.type);
      const arrayBuffer = await file.arrayBuffer();
      const res = await fetch("/api/customer-portal/upload-file", {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "x-file-name": encodeURIComponent(file.name),
          "x-file-type": contentType,
        },
        body: arrayBuffer,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const { key } = await res.json();
      // Normalize key for serving via /api/img route
      const normalizedKey = key.startsWith("/objects/") ? `/api/img${key.replace("/objects", "")}` : key;
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      setChatImage({ key: normalizedKey, previewUrl, isImage, fileName: file.name });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload the file. Please try again.", variant: "destructive" });
    } finally {
      setIsUploadingChatImage(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (file) processFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const fileItems = items.filter(item => item.kind === "file");
    if (fileItems.length === 0) return;
    e.preventDefault();
    const file = fileItems[0].getAsFile();
    if (file) processFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDraggingOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (chatImage || isUploadingChatImage) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const jobUnread = jobConversations.reduce((s, c) => {
    const effective = c.unreadCount > 0 ? c.unreadCount : (flags.isManuallyUnread(`job:${c.jobId}`) ? 1 : 0);
    return s + effective;
  }, 0);
  const directUnread = directConversations.reduce((s, c) => {
    const effective = c.unreadCount > 0 ? c.unreadCount : (flags.isManuallyUnread(`direct:${c.id}`) ? 1 : 0);
    return s + effective;
  }, 0);
  const totalUnread = jobUnread + directUnread;

  useAppBadge(totalUnread);

  return (
    <div className="bg-background flex flex-col" style={{ height: "100dvh" }}>
      {isImpersonating && currentUser && (
        <ImpersonationBanner customerEmail={currentUser.email} />
      )}

      {/* Header — adapts on mobile: shows back-to-list when in chat */}
      <header className="border-b bg-card/60 backdrop-blur-sm shrink-0 z-50">
        <div className="px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          {/* On mobile in chat view: show back-to-list button + conversation title */}
          {selected ? (
            <>
              <Button variant="ghost" size="sm" className="sm:hidden -ml-1" onClick={() => setSelected(null)} data-testid="button-back-to-list">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold text-sm sm:hidden truncate flex-1">
                {selected.type === "job" ? selectedJobConvo?.jobName : selectedDirectConvo?.subject}
              </span>
              {/* Desktop: normal header */}
              <Button variant="ghost" size="sm" className="hidden sm:flex" onClick={() => setLocation("/customer/dashboard")} data-testid="button-back-to-portal">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <div className="hidden sm:block h-5 w-px bg-border" />
              <div className="hidden sm:flex items-center gap-2">
                <span className="font-semibold text-sm">Messages</span>
                {totalUnread > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">{totalUnread}</Badge>
                )}
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
          <div className="ml-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-notification-settings"
                  title="Notification settings"
                >
                  {currentUser?.emailNotificationsMessages
                    ? <Bell className="h-4 w-4" />
                    : <BellOff className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-sm">Email notification settings</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Choose when you receive email updates from us</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <Label htmlFor="customer-email-notifs-messages" className="text-sm leading-snug flex-1 pt-0.5">
                        New messages
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">Email me when a staff member sends a new message</p>
                      </Label>
                      <Switch
                        id="customer-email-notifs-messages"
                        checked={currentUser?.emailNotificationsMessages ?? false}
                        onCheckedChange={(checked) => notificationSettingsMutation.mutate({ emailNotificationsMessages: checked })}
                        disabled={notificationSettingsMutation.isPending}
                        data-testid="toggle-customer-email-notifications"
                      />
                    </div>
                    <div className="border-t pt-3 flex items-start justify-between gap-4">
                      <Label htmlFor="customer-email-notifs-dispatch" className="text-sm leading-snug flex-1 pt-0.5">
                        Order dispatched
                        <p className="text-xs text-muted-foreground font-normal mt-0.5">Email me when an order is dispatched with DPD tracking</p>
                      </Label>
                      <Switch
                        id="customer-email-notifs-dispatch"
                        checked={currentUser?.emailNotificationsDispatch ?? false}
                        onCheckedChange={(checked) => notificationSettingsMutation.mutate({ emailNotificationsDispatch: checked })}
                        disabled={notificationSettingsMutation.isPending}
                        data-testid="toggle-customer-dispatch-notifications"
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — full screen on mobile, fixed sidebar on desktop */}
        <div className={`flex-shrink-0 border-r flex flex-col overflow-hidden
          w-full sm:w-80
          ${selected ? "hidden sm:flex" : "flex"}`}>
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
                  {t === "job" ? "Order Chats" : "General Chat"}
                  {(t === "job" ? jobUnread : directUnread) > 0 && (
                    <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                      {t === "job" ? jobUnread : directUnread}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* New chat / new conversation buttons */}
          {tab === "job" && (
            <div className="px-3 py-2 border-b">
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => setShowNewJobChat(true)}
                data-testid="button-new-job-chat"
              >
                <PenLine className="h-3.5 w-3.5 mr-1.5" />
                New Chat
              </Button>
            </div>
          )}
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
              ) : jobConversations.every(c => c.isArchived) ? (
                <>
                  <EmptyState label="No active conversations" sublabel="Your conversations have been archived — expand the section below to view them" />
                  <div>
                    <button
                      onClick={() => setShowArchivedJobs(v => !v)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground border-t transition-colors"
                      data-testid="button-toggle-archived-jobs"
                    >
                      <Archive className="h-3 w-3" />
                      Archived ({jobConversations.filter(c => c.isArchived).length})
                      <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${showArchivedJobs ? "rotate-90" : ""}`} />
                    </button>
                    {showArchivedJobs && jobConversations
                      .filter(c => c.isArchived && (!searchQuery || c.jobName.toLowerCase().includes(searchQuery.toLowerCase())))
                      .map(convo => (
                        <ConvoRow
                          key={convo.jobId}
                          isActive={selected?.type === "job" && selected.jobId === convo.jobId}
                          icon={<Package className="h-4 w-4 text-muted-foreground" />}
                          title={convo.jobName}
                          subtitle={convo.completed ? "Completed" : "In Production"}
                          unread={0}
                          latest={convo.latestMessage}
                          myLabel="You"
                          theirLabel="Select"
                          onClick={() => setSelected({ type: "job", jobId: convo.jobId })}
                          testId={`conversation-archived-${convo.jobId}`}
                          onUnarchive={() => unarchiveJobConvoMutation.mutate(convo.jobId)}
                          dimmed
                        />
                      ))
                    }
                  </div>
                </>
              ) : (
                <>
                  {jobConversations
                    .filter(c => !c.isArchived && (!searchQuery || c.jobName.toLowerCase().includes(searchQuery.toLowerCase())))
                    .map(convo => (
                      <ConvoRow
                        key={convo.jobId}
                        isActive={selected?.type === "job" && selected.jobId === convo.jobId}
                        icon={<Package className="h-4 w-4 text-primary" />}
                        title={convo.jobName}
                        subtitle={convo.completed ? "Completed" : "In Production"}
                        unread={convo.unreadCount > 0 ? convo.unreadCount : (flags.isManuallyUnread(`job:${convo.jobId}`) ? 1 : 0)}
                        latest={convo.latestMessage}
                        myLabel="You"
                        theirLabel="Select"
                        onClick={() => setSelected({ type: "job", jobId: convo.jobId })}
                        testId={`conversation-${convo.jobId}`}
                        onArchive={() => archiveJobConvoMutation.mutate(convo.jobId)}
                        hasReminder={flags.hasReminder(`job:${convo.jobId}`)}
                      />
                    ))
                  }
                  {/* Archived section */}
                  {jobConversations.some(c => c.isArchived) && (
                    <div>
                      <button
                        onClick={() => setShowArchivedJobs(v => !v)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground border-t transition-colors"
                        data-testid="button-toggle-archived-jobs"
                      >
                        <Archive className="h-3 w-3" />
                        Archived ({jobConversations.filter(c => c.isArchived).length})
                        <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${showArchivedJobs ? "rotate-90" : ""}`} />
                      </button>
                      {showArchivedJobs && jobConversations
                        .filter(c => c.isArchived && (!searchQuery || c.jobName.toLowerCase().includes(searchQuery.toLowerCase())))
                        .map(convo => (
                          <ConvoRow
                            key={convo.jobId}
                            isActive={selected?.type === "job" && selected.jobId === convo.jobId}
                            icon={<Package className="h-4 w-4 text-muted-foreground" />}
                            title={convo.jobName}
                            subtitle={convo.completed ? "Completed" : "In Production"}
                            unread={0}
                            latest={convo.latestMessage}
                            myLabel="You"
                            theirLabel="Select"
                            onClick={() => setSelected({ type: "job", jobId: convo.jobId })}
                            testId={`conversation-archived-${convo.jobId}`}
                            onUnarchive={() => unarchiveJobConvoMutation.mutate(convo.jobId)}
                            dimmed
                          />
                        ))
                      }
                    </div>
                  )}
                </>
              )
            ) : (
              isLoadingDirectConvos ? (
                <LoadingSpinner />
              ) : directConversations.filter(c => c.status === "open").length === 0 ? (
                <EmptyState label="No general chats" sublabel="Start a general conversation with Select Branding" />
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
                      unread={convo.unreadCount > 0 ? convo.unreadCount : (flags.isManuallyUnread(`direct:${convo.id}`) ? 1 : 0)}
                      latest={convo.latestMessage}
                      myLabel="You"
                      theirLabel="Select"
                      onClick={() => setSelected({ type: "direct", conversationId: convo.id })}
                      testId={`direct-conversation-${convo.id}`}
                      onArchive={() => archiveConvoMutation.mutate(convo.id)}
                      onDelete={() => deleteConvoMutation.mutate(convo.id)}
                      hasReminder={flags.hasReminder(`direct:${convo.id}`)}
                    />
                  ))
              )
            )}
          </div>
        </div>

        {/* Chat panel — full screen on mobile, flex-1 on desktop */}
        {selected ? (
          <div
            className={`flex-col overflow-hidden flex-1 relative
              ${selected ? "flex" : "hidden sm:flex"}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Drag-and-drop overlay */}
            {isDraggingOver && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-none bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
                <Paperclip className="h-10 w-10 text-primary" />
                <p className="text-base font-semibold text-primary">Drop file to attach</p>
              </div>
            )}
            {/* Chat sub-header (desktop only — mobile uses the main header) */}
            <div className="hidden sm:flex px-4 py-3 border-b bg-card/40 items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                {selected.type === "job" ? <Package className="h-4 w-4 text-primary" /> : <MessageCircle className="h-4 w-4 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {selected.type === "job" ? selectedJobConvo?.jobName : selectedDirectConvo?.subject}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selected.type === "job"
                    ? (selectedJobConvo?.completed ? "Completed" : "In Production")
                    : "Select Branding Solutions"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title="Mark as unread"
                onClick={handleMarkUnread}
                data-testid="button-mark-unread"
              >
                <MailOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={convKey && flags.hasReminder(convKey) ? "Cancel reminder" : "Remind me in 1 hour"}
                onClick={handleToggleReminder}
                data-testid="button-toggle-reminder"
                className={convKey && flags.hasReminder(convKey) ? "text-primary" : ""}
              >
                <Clock className="h-4 w-4" />
              </Button>
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
                    onClick={() => sendJobMutation.mutate({ message: "Approved, please proceed." })}
                    disabled={sendJobMutation.isPending}
                    data-testid="button-approve-sample-quick-reply"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                    Approved, please proceed
                  </Button>
                </div>
              </div>
            )}

            {newMessageBanner && (
              <div
                className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground shrink-0 cursor-pointer"
                onClick={() => { setNewMessageBanner(false); messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                data-testid="banner-new-message"
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium flex-1">New message from Select Branding Solutions</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-primary-foreground hover:bg-white/20"
                  onClick={(e) => { e.stopPropagation(); setNewMessageBanner(false); }}
                  data-testid="button-dismiss-new-message-banner"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3" onScroll={() => newMessageBanner && setNewMessageBanner(false)}>
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

                  // Date separator logic
                  const msgDate = new Date(msg.createdAt);
                  const prevMsgDate = prevMsg ? new Date(prevMsg.createdAt) : null;
                  const showDateSep = !prevMsgDate || msgDate.toDateString() !== prevMsgDate.toDateString();
                  const dateSepLabel = isToday(msgDate)
                    ? "Today"
                    : isYesterday(msgDate)
                    ? "Yesterday"
                    : format(msgDate, "d MMMM yyyy");

                  return (
                    <div key={msg.id}>
                      {showDateSep && (
                        <div className="flex items-center gap-3 py-2" data-testid={`date-sep-${msg.id}`}>
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wide">{dateSepLabel}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <div className={`flex items-end gap-2.5 ${isCustomer ? "flex-row-reverse" : "flex-row"}`} data-testid={`message-${msg.id}`}>
                        {/* Avatar + name below */}
                        <div className={`flex flex-col items-center gap-0.5 shrink-0 ${showAvatar ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                          <div className={`h-8 w-8 rounded-full overflow-hidden flex items-center justify-center border-2 border-background ${isCustomer ? "bg-blue-500" : "bg-orange-400"}`}>
                            {msg.senderImageUrl ? (
                              <img src={msg.senderImageUrl} alt={msg.senderName || ""} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-bold text-white">{initials}</span>
                            )}
                          </div>
                          {msg.senderName && (
                            <span className="text-[9px] font-medium text-muted-foreground text-center leading-tight max-w-[44px] truncate">
                              {msg.senderName.split(" ")[0]}
                            </span>
                          )}
                        </div>
                        <div className={`max-w-[82%] sm:max-w-[72%] flex flex-col gap-0.5 ${isCustomer ? "items-end" : "items-start"}`}>
                          {/* name moved under avatar */}
                          <div className={`rounded-2xl px-4 py-2.5 ${isCustomer ? "bg-blue-500 text-white rounded-br-sm" : "bg-orange-400 text-white rounded-bl-sm"}`}>
                            {msg.message.replace(/\[FILE:[^:]+:[^\]]+\]/g, "").trim() && (
                              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.message.replace(/\[FILE:[^:]+:[^\]]+\]/g, "").trim()}</p>
                            )}
                            {msg.imageUrl && (
                              <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                                <img src={msg.imageUrl} alt="Attachment" className="max-w-full rounded-lg max-h-48 object-contain hover:opacity-90 transition-opacity" />
                              </a>
                            )}
                            {(() => {
                              const fileRegex = /\[FILE:([^:]+):([^\]]+)\]/g;
                              const rawText = msg.message || "";
                              const fileMatches: { name: string; url: string }[] = [];
                              let m: RegExpExecArray | null;
                              while ((m = fileRegex.exec(rawText)) !== null) {
                                fileMatches.push({ name: m[1], url: m[2] });
                              }
                              if (!fileMatches.length) return null;
                              return (
                                <div className="mt-2 space-y-1">
                                  {fileMatches.map((f, fi) => (
                                    <a
                                      key={fi}
                                      href={f.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium no-underline bg-white/20 text-inherit border border-white/20 hover:opacity-80 transition-opacity"
                                    >
                                      <FileText className="h-4 w-4 shrink-0" />
                                      <span className="truncate max-w-[200px]">{f.name}</span>
                                    </a>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                          <p className={`text-[10px] text-muted-foreground px-1 mt-0.5 ${isCustomer ? "text-right" : ""}`}>
                            {format(msgDate, "h:mm a")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t px-3 py-3 bg-card/40 shrink-0">
              {/* Attached file/image preview */}
              {chatImage && (
                <div className="mb-2 relative inline-block">
                  {chatImage.isImage && chatImage.previewUrl ? (
                    <img
                      src={chatImage.previewUrl}
                      alt="Attachment preview"
                      className="max-h-28 max-w-[200px] rounded-lg border object-contain"
                    />
                  ) : (
                    <div className="h-16 w-36 rounded-md border border-border bg-muted flex flex-col items-center justify-center gap-1 px-2">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 break-all">{chatImage.fileName}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setChatImage(null)}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                    data-testid="button-remove-attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="flex gap-2 items-end">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-file-attachment"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 h-[42px] w-[42px] text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingChatImage || !!chatImage}
                  data-testid="button-attach-file"
                  title="Attach a file"
                >
                  {isUploadingChatImage ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>
                <Textarea
                  placeholder="Message… (Enter to send, paste images/files with Ctrl+V)"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  rows={1}
                  className="resize-none text-sm min-h-[42px] max-h-32"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={(!newMessage.trim() && !chatImage) || sendJobMutation.isPending || sendDirectMutation.isPending}
                  size="icon"
                  className="shrink-0 h-[42px] w-[42px]"
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
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1"
                style={{ scrollbarWidth: "none" }}>
                {/* Everyone tile */}
                <button
                  type="button"
                  onClick={() => setSelectedRecipientId(null)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-colors w-16 shrink-0 ${selectedRecipientId === null ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground/40"}`}
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
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-colors w-16 shrink-0 ${isSelected ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground/40"}`}
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
                autoResize
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

      {/* New Job Chat dialog */}
      <Dialog open={showNewJobChat} onOpenChange={(o) => {
        if (!o) { setShowNewJobChat(false); setNewJobChatJobId(""); setNewJobChatMessage(""); setJobPickerSearch(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Job search + picker */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Which order is this about?</label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search your orders…"
                  value={jobPickerSearch}
                  onChange={e => setJobPickerSearch(e.target.value)}
                  className="pl-8 text-sm"
                  data-testid="input-job-picker-search"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                {allCustomerJobs
                  .filter(j => !jobPickerSearch || j.jobName.toLowerCase().includes(jobPickerSearch.toLowerCase()))
                  .map(job => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setNewJobChatJobId(job.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors text-sm ${newJobChatJobId === job.id ? "bg-primary/10 font-semibold" : "hover:bg-muted/50"}`}
                      data-testid={`job-picker-${job.id}`}
                    >
                      <Package className={`h-4 w-4 flex-shrink-0 ${newJobChatJobId === job.id ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="truncate">{job.jobName}</span>
                      {job.status === "completed" && (
                        <span className="ml-auto text-[10px] text-muted-foreground font-normal flex-shrink-0">Completed</span>
                      )}
                    </button>
                  ))}
                {allCustomerJobs.filter(j => !jobPickerSearch || j.jobName.toLowerCase().includes(jobPickerSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">No orders found</p>
                )}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Message (optional)</label>
              <Textarea
                placeholder="Type your first message…"
                autoResize
                value={newJobChatMessage}
                onChange={e => setNewJobChatMessage(e.target.value)}
                data-testid="input-new-job-chat-message"
              />
            </div>

            {/* General enquiry fallback */}
            <div className="pt-1 border-t">
              <p className="text-xs text-muted-foreground">
                Not about an existing order?{" "}
                <button
                  type="button"
                  className="underline text-primary"
                  onClick={() => {
                    setShowNewJobChat(false);
                    setNewJobChatJobId(""); setNewJobChatMessage(""); setJobPickerSearch("");
                    setTab("direct");
                    setSelected(null);
                    setTimeout(() => setShowNewConvo(true), 50);
                  }}
                  data-testid="button-switch-to-general-enquiry"
                >
                  Start a general enquiry
                </button>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewJobChat(false)}>Cancel</Button>
            <Button
              onClick={handleStartJobChat}
              disabled={!newJobChatJobId || startJobChatMutation.isPending}
              data-testid="button-start-job-chat"
            >
              {startJobChatMutation.isPending ? "Opening…" : newJobChatMessage.trim() ? "Send & Open Chat" : "Open Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConvoRow({ isActive, icon, title, subtitle, unread, latest, myLabel, theirLabel, onClick, testId, onArchive, onDelete, onUnarchive, dimmed, hasReminder }: {
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
  onUnarchive?: () => void;
  dimmed?: boolean;
  hasReminder?: boolean;
}) {
  return (
    <div
      className={`group/row w-full border-b transition-colors flex items-start gap-3 ${isActive ? "bg-primary/8" : "hover:bg-muted/50"} ${dimmed ? "opacity-60" : ""}`}
      data-testid={testId}
    >
      <button className="flex items-start gap-3 flex-1 min-w-0 px-4 py-3.5 text-left" onClick={onClick}>
        <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${dimmed ? "bg-muted" : "bg-primary/10"}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className={`text-sm font-semibold truncate ${unread > 0 ? "text-foreground" : "text-foreground/80"}`}>{title}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {unread > 0 && <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{unread}</Badge>}
              {hasReminder && <Clock className="h-3 w-3 text-primary/70" />}
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
      {(onArchive || onDelete || onUnarchive) && (
        <div className="flex flex-col justify-center gap-1 pr-2 py-3 opacity-0 group-hover/row:opacity-100 transition-opacity">
          {onUnarchive && (
            <button
              onClick={e => { e.stopPropagation(); onUnarchive(); }}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Restore"
              data-testid={`button-unarchive-${testId}`}
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          {onArchive && (
            <button
              onClick={e => { e.stopPropagation(); onArchive(); }}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Hide conversation"
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
