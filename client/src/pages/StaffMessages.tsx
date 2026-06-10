import { useState, useEffect, useRef } from "react";
import { DemoText } from "@/components/DemoText";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MessageSquare,
  Send,
  ChevronRight,
  Package,
  ArrowLeft,
  Plus,
  MessageCircle,
  Archive,
  ArchiveX,
  Trash2,
  Search,
  Paperclip,
  X,
  EyeOff,
  Eye,
  Pin,
  Lock,
  Camera,
  User,
  Upload,
  FileText,
  Image,
  Film,
  Pencil,
  Check,
  ThumbsUp,
  MailOpen,
  Clock,
  Bell,
  CheckSquare,
  Briefcase,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, isToday, isYesterday } from "date-fns";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useConversationFlags } from "@/hooks/useConversationFlags";

type JobConversation = {
  jobId: string;
  jobName: string;
  customerId: string;
  customerName: string;
  customerLogoUrl: string | null;
  status: string;
  completed: boolean;
  messageCount: number;
  unreadCount: number;
  isArchivedByStaff?: boolean;
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
  archivedByStaff?: boolean;
  unreadCount: number;
  latestMessage: { message: string; senderType: "customer" | "staff"; createdAt: string } | null;
  updatedAt: string;
};

type MessagingUser = { id: string; name: string; email: string; role: string };

type ChatMessage = {
  id: string;
  senderType: "customer" | "staff";
  senderName: string | null;
  senderImageUrl: string | null;
  message: string;
  imageUrl?: string | null;
  isInternal?: boolean;
  createdAt: string;
};

type CurrentUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  staffName?: string | null;
  staffId?: string | null;
  role?: string;
  emailNotificationsMessages?: boolean;
};

type Customer = { id: string; name: string; logoUrl?: string | null };

function formatConvoTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

function getInitials(name: string | null | undefined, fallback = "?") {
  if (!name) return fallback;
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function renderMessageContent(text: string) {
  const parts = text.split(/(@\w+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^@\w+$/.test(part)
          ? <span key={i} className="font-semibold text-blue-300 dark:text-blue-300">{part}</span>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

// Color palette for customer avatars
const CUSTOMER_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-orange-500",
];
function customerColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return CUSTOMER_COLORS[h % CUSTOMER_COLORS.length];
}

type Tab = "job" | "direct";
type Selected =
  | { type: "job"; jobId: string }
  | { type: "direct"; conversationId: string }
  | null;

// Left panel view in "job" tab:  "tiles" = customer grid, "jobs" = job list for a customer
type LeftView = "tiles" | "jobs";

export default function StaffMessages() {
  const { toast } = useToast();
  const flags = useConversationFlags("staff", (reminder) => {
    toast({ title: `Reminder: ${reminder.label}`, description: "You asked to be reminded about this conversation." });
  });
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("job");

  // Pre-select a job or direct conversation from URL params
  const { urlJobId, urlConversationId } = (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return { urlJobId: p.get("jobId"), urlConversationId: p.get("conversationId") };
    } catch { return { urlJobId: null, urlConversationId: null }; }
  })();
  const [selected, setSelected] = useState<Selected>(
    urlConversationId
      ? { type: "direct", conversationId: urlConversationId }
      : urlJobId
        ? { type: "job", jobId: urlJobId }
        : null
  );
  const [newMessage, setNewMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCustomerMsgCount = useRef(0);
  const isInitialLoad = useRef(true);

  // Left panel navigation
  const [leftView, setLeftView] = useState<LeftView>("tiles");
  const [drillCustomerId, setDrillCustomerId] = useState<string | null>(null);
  const [drillSearch, setDrillSearch] = useState("");
  const [drillShowArchived, setDrillShowArchived] = useState(false);
  const [debouncedDrillSearch, setDebouncedDrillSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDrillSearch(drillSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [drillSearch]);

  // New direct conversation dialog
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newRecipientId, setNewRecipientId] = useState("");
  const [newRecipientType, setNewRecipientType] = useState<"customer" | "staff">("customer");
  const [newRecipientSearch, setNewRecipientSearch] = useState("");
  const [newFirstMessage, setNewFirstMessage] = useState("");

  // Hidden/archived job IDs (persisted in localStorage)
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("hiddenJobChats");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [showHidden, setShowHidden] = useState(false);
  const [confirmArchiveJobId, setConfirmArchiveJobId] = useState<string | null>(null);

  const toggleHideJob = (jobId: string) => {
    setHiddenJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      localStorage.setItem("hiddenJobChats", JSON.stringify([...next]));
      return next;
    });
    if (selected?.type === "job" && selected.jobId === jobId) setSelected(null);
  };

  // Message existing order dialog
  const [showMsgExisting, setShowMsgExisting] = useState(false);
  const [msgExistingCustomerId, setMsgExistingCustomerId] = useState("");
  const [msgExistingCustomerSearch, setMsgExistingCustomerSearch] = useState("");
  const [msgExistingJobId, setMsgExistingJobId] = useState("");
  const [msgExistingText, setMsgExistingText] = useState("");
  const [isSendingMsgExisting, setIsSendingMsgExisting] = useState(false);

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
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const [chatImages, setChatImages] = useState<{ key: string; preview: string | null; fileName: string; isImage: boolean }[]>([]);
  const [isUploadingChatImage, setIsUploadingChatImage] = useState(false);
  const [isDraggingOverCompose, setIsDraggingOverCompose] = useState(false);
  const composeAreaRef = useRef<HTMLDivElement>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [remindOpenMsgId, setRemindOpenMsgId] = useState<string | null>(null);
  const [taskFromMsg, setTaskFromMsg] = useState<{ messageId: string; messageText: string; jobId?: string } | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [pendingProfileCropFile, setPendingProfileCropFile] = useState<File | null>(null);

  // @mention state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionSearch, setMentionSearch] = useState("");
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionHighlightIdx, setMentionHighlightIdx] = useState(0);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: currentUser, refetch: refetchMe } = useQuery<CurrentUser>({
    queryKey: ["/api/staff/me"],
  });

  const { data: allJobConversations = [], isLoading: isLoadingJobConvos } = useQuery<JobConversation[]>({
    queryKey: ["/api/staff/conversations/all"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/staff/conversations?includeArchived=true");
      return res.json();
    },
    refetchInterval: 5000,
  });
  const jobConversations = allJobConversations.filter(c => !c.isArchivedByStaff);
  const archivedConversations = allJobConversations.filter(c => c.isArchivedByStaff);

  const { data: directConversations = [], isLoading: isLoadingDirectConvos } = useQuery<DirectConversation[]>({
    queryKey: ["/api/staff/direct-conversations"],
    refetchInterval: 10000,
  });

  // Drilled customer search results (across live + archived job messages for that customer)
  type CustomerMessageSearchResult = { id: string; jobId: string; jobName: string; jobNumber: number | null; isArchived: boolean; message: string; senderType: string; createdAt: string };
  const { data: drillSearchResults = [], isFetching: isSearchingDrill } = useQuery<CustomerMessageSearchResult[]>({
    queryKey: ["/api/staff/customers", drillCustomerId, "messages/search", debouncedDrillSearch],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/staff/customers/${drillCustomerId}/messages/search?q=${encodeURIComponent(debouncedDrillSearch)}`);
      return res.json();
    },
    enabled: !!drillCustomerId && debouncedDrillSearch.length >= 2,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: staffList = [] } = useQuery<{ id: string; name: string; email?: string | null }[]>({
    queryKey: ["/api/staff/mentionable"],
  });

  const jobId = selected?.type === "job" ? selected.jobId : null;
  const directId = selected?.type === "direct" ? selected.conversationId : null;
  const selectedJobConvo = jobConversations.find(c => c.jobId === jobId) ?? null;
  const selectedDirectConvo = directConversations.find(c => c.id === directId) ?? null;
  const currentCustomerId = selected?.type === "job" ? selectedJobConvo?.customerId : selectedDirectConvo?.customerId;
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

  const currentCustomerLogo = customers.find(c => c.id === currentCustomerId)?.logoUrl ?? null;

  const { data: currentConvoCustomerUsers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string; active: boolean }[]>({
    queryKey: ["/api/customers", currentCustomerId, "users"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customers/${currentCustomerId}/users`);
      return res.json();
    },
    enabled: !!currentCustomerId,
  });

  const { data: messagingUsers = [] } = useQuery<MessagingUser[]>({
    queryKey: ["/api/staff/messaging-users"],
  });

  const { data: customerJobs = [] } = useQuery<{ id: string; jobName: string; status: string; invoiceStatus: string; jobNumber?: number }[]>({
    queryKey: ["/api/jobs", { customerId: msgExistingCustomerId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/jobs?customerId=${msgExistingCustomerId}`);
      return res.json();
    },
    enabled: !!msgExistingCustomerId && showMsgExisting,
  });

  const handleSendMsgExisting = async () => {
    if (!msgExistingJobId || !msgExistingText.trim()) return;
    setIsSendingMsgExisting(true);
    try {
      await apiRequest("POST", `/api/staff/jobs/${msgExistingJobId}/messages`, { message: msgExistingText.trim() });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations/all"] });
      queryClient.invalidateQueries({ queryKey: [`/api/staff/jobs/${msgExistingJobId}/messages`] });
      setShowMsgExisting(false);
      setMsgExistingCustomerId("");
      setMsgExistingCustomerSearch("");
      setMsgExistingJobId("");
      setMsgExistingText("");
      setSelected({ type: "job", jobId: msgExistingJobId });
      toast({ title: "Message sent" });
    } catch {
      toast({ title: "Failed to send message", variant: "destructive" });
    } finally {
      setIsSendingMsgExisting(false);
    }
  };

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

  // Auto-select first conversation per tab on load
  useEffect(() => {
    if (tab === "direct" && !directId) {
      const firstActive = directConversations.find(c => !c.archivedByStaff);
      if (firstActive) {
        setSelected({ type: "direct", conversationId: firstActive.id });
      }
    }
  }, [tab, directConversations, directId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keep sidebar unread badge in sync — messages are marked as read on the server
  // each time they're fetched, so invalidate the count whenever messages change.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/staff/messages/unread-count"] });
  }, [jobMessages, directMessages]);

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
      const latestMsg = custMsgs[custMsgs.length - 1];
      toast({ title: "New message from customer", description: latestMsg?.message?.slice(0, 80) });
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && !document.hasFocus()) {
        const convoName = selected?.type === "job" ? selectedJobConvo?.jobName : "Direct message";
        new Notification(`New message — ${convoName || "Customer"}`, {
          body: latestMsg?.message?.slice(0, 100) || "",
          icon: "/logo.png",
        });
      }
    }
    prevCustomerMsgCount.current = custMsgs.length;
  }, [messages, isLoadingMessages, selected, toast]);

  // Request browser notification permission on first visit
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (selected) {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
    }
  }, [selected]);

  useEffect(() => {
    if (convKey) flags.clearUnread(convKey);
  }, [convKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────────
  const sendJobMessageMutation = useMutation({
    mutationFn: async ({ message, imageUrl, isInternal }: { message: string; imageUrl?: string; isInternal?: boolean }) => {
      const res = await apiRequest("POST", `/api/staff/jobs/${jobId}/messages`, {
        message,
        ...(imageUrl ? { imageUrl } : {}),
        ...(isInternal ? { isInternal: true } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/staff/jobs/${jobId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations"] });
      setNewMessage("");
      setIsInternal(false);
      setChatImages([]);
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const sendDirectMessageMutation = useMutation({
    mutationFn: async ({ message, imageUrl }: { message: string; imageUrl?: string }) => {
      const res = await apiRequest("POST", `/api/staff/direct-conversations/${directId}/messages`, { message, ...(imageUrl ? { imageUrl } : {}) });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations", directId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      setNewMessage("");
      setChatImages([]);
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const unsendMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("DELETE", `/api/staff/jobs/${jobId}/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/staff/jobs/${jobId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations/all"] });
    },
    onError: () => toast({ title: "Failed to unsend message", variant: "destructive" }),
  });

  const unsendDirectMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("DELETE", `/api/staff/direct-conversations/${directId}/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations", directId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations/all"] });
      toast({ title: "Message unsent" });
    },
    onError: () => toast({ title: "Failed to unsend message", variant: "destructive" }),
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, message }: { messageId: string; message: string }) => {
      await apiRequest("PATCH", `/api/staff/jobs/${jobId}/messages/${messageId}`, { message });
    },
    onSuccess: () => {
      setEditingMsgId(null);
      setEditingText("");
      queryClient.invalidateQueries({ queryKey: [`/api/staff/jobs/${jobId}/messages`] });
    },
    onError: () => toast({ title: "Failed to edit message", variant: "destructive" }),
  });

  const thumbsUpMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("POST", `/api/staff/jobs/${jobId}/messages/${messageId}/thumbs-up`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/staff/jobs/${jobId}/messages`] });
    },
    onError: () => toast({ title: "Failed to react to message", variant: "destructive" }),
  });

  const markUnreadMutation = useMutation({
    mutationFn: async ({ messageId, type }: { messageId: string; type: 'job' | 'direct' }) => {
      const url = type === 'job'
        ? `/api/staff/messages/job/${messageId}/mark-unread`
        : `/api/staff/messages/direct/${messageId}/mark-unread`;
      await apiRequest("PATCH", url, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      toast({ title: "Marked as unread" });
    },
    onError: () => toast({ title: "Failed to mark as unread", variant: "destructive" }),
  });

  const createReminderMutation = useMutation({
    mutationFn: async ({ messageId, messageType, remindAt, messagePreview }: {
      messageId: string; messageType: string; remindAt: Date; messagePreview: string;
    }) => {
      const res = await apiRequest("POST", "/api/staff/messages/reminders", {
        messageId, messageType, remindAt: remindAt.toISOString(), messagePreview,
      });
      return res.json();
    },
    onSuccess: (_data, { remindAt }) => {
      toast({ title: `Reminder set for ${format(remindAt, "d MMM 'at' h:mm a")}` });
      setRemindOpenMsgId(null);
    },
    onError: () => toast({ title: "Failed to set reminder", variant: "destructive" }),
  });

  const dismissReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/staff/messages/reminders/${id}/dismiss`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/messages/reminders"] });
    },
  });

  const { data: pendingReminders = [] } = useQuery<{ id: string; messagePreview: string | null; remindAt: string }[]>({
    queryKey: ["/api/staff/messages/reminders"],
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const now = new Date();
    pendingReminders.forEach(r => {
      if (new Date(r.remindAt) <= now) {
        const preview = r.messagePreview ? `"${r.messagePreview.slice(0, 80)}"` : "You asked to be reminded about a message.";
        toast({ title: "Message reminder", description: preview, duration: 10000 });
        dismissReminderMutation.mutate(r.id);
      }
    });
  }, [pendingReminders]);

  const REMIND_OPTIONS = [
    { label: "In 30 minutes", getDate: () => new Date(Date.now() + 30 * 60_000) },
    { label: "In 1 hour", getDate: () => new Date(Date.now() + 60 * 60_000) },
    { label: "In 4 hours", getDate: () => new Date(Date.now() + 4 * 60 * 60_000) },
    { label: "Tomorrow 9am", getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
    { label: "In 3 days", getDate: () => new Date(Date.now() + 3 * 24 * 60 * 60_000) },
  ];

  const archiveConvoJobMutation = useMutation({
    mutationFn: async ({ jobId: jId, archive }: { jobId: string; archive: boolean }) => {
      await apiRequest("PUT", `/api/staff/jobs/${jId}/conversation/${archive ? "archive" : "unarchive"}`);
    },
    onSuccess: (_data, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/conversations/all"] });
      if (archive) { setSelected(null); toast({ title: "Conversation archived" }); }
      else { toast({ title: "Conversation unarchived" }); }
    },
    onError: () => toast({ title: "Failed to archive conversation", variant: "destructive" }),
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
      const jobRes = await apiRequest("POST", "/api/jobs", {
        customerId: newOrderCustomerId,
        jobName: newOrderJobName.trim(),
        quantity: 1,
        goodsReceived: null,
        requiredDispatchDate: null,
        machineId: null,
      });
      const newJob = await jobRes.json();
      const createdJobId = newJob.id;

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

      const ccNames = newOrderColleagues
        .map(id => staffList.find(s => s.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      const fullMessage = ccNames ? `CC: ${ccNames}\n\n${newOrderMessage.trim()}` : newOrderMessage.trim();
      await apiRequest("POST", `/api/staff/jobs/${createdJobId}/messages`, { message: fullMessage });

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
      await apiRequest("PATCH", `/api/staff/direct-conversations/${id}`, { archivedByStaff: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      setSelected(null);
      toast({ title: "Chat archived" });
    },
    onError: () => toast({ title: "Failed to archive chat", variant: "destructive" }),
  });

  const unarchiveConvoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/staff/direct-conversations/${id}`, { archivedByStaff: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      toast({ title: "Chat restored" });
    },
    onError: () => toast({ title: "Failed to restore chat", variant: "destructive" }),
  });

  const handleSend = async () => {
    const allAttachments = [...chatImages];
    const text = newMessage.trim();
    if ((!text && allAttachments.length === 0) || !selected) return;
    setNewMessage("");
    setChatImages([]);
    setShowMentionDropdown(false);
    setMentionSearch("");
    allAttachments.forEach(att => { if (att.preview) URL.revokeObjectURL(att.preview); });

    const imageAttachments = allAttachments.filter(a => a.isImage);
    const fileAttachments = allAttachments.filter(a => !a.isImage);

    // Build file markers for non-image attachments, appended to the text
    const fileMarkers = fileAttachments.map(f => `[FILE:${f.fileName}:${f.key}]`).join("\n");
    const baseText = [text, fileMarkers].filter(Boolean).join("\n");

    if (imageAttachments.length === 0) {
      const payload = { message: baseText || " ", isInternal };
      if (selected.type === "job") sendJobMessageMutation.mutate(payload);
      else sendDirectMessageMutation.mutate(payload);
    } else {
      for (let i = 0; i < imageAttachments.length; i++) {
        const msgText = i === 0 ? (baseText || " ") : " ";
        const payload = { message: msgText, imageUrl: imageAttachments[i].key, isInternal };
        try {
          if (selected.type === "job") await sendJobMessageMutation.mutateAsync(payload);
          else await sendDirectMessageMutation.mutateAsync(payload);
        } catch { break; }
      }
    }
  };

  const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/avif"]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setIsUploadingChatImage(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const isImage = IMAGE_MIME_TYPES.has(file.type);
        const previewUrl = isImage ? URL.createObjectURL(file) : null;
        const contentType = file.type || "application/octet-stream";
        const uploadRes = await apiRequest("POST", "/api/staff/objects/upload", {});
        const { url, key } = await uploadRes.json();
        const putRes = await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": contentType },
        });
        if (!putRes.ok) throw new Error(`Upload failed: ${putRes.statusText}`);
        const normalizedKey = key.startsWith("/objects/") ? `/api/img${key.replace("/objects", "")}` : key;
        return { key: normalizedKey, preview: previewUrl, fileName: file.name, isImage };
      }));
      setChatImages(prev => [...prev, ...uploaded]);
    } catch {
      toast({ title: "Failed to upload file(s)", variant: "destructive" });
    } finally {
      setIsUploadingChatImage(false);
    }
  };

  const handleChatImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (chatImageInputRef.current) chatImageInputRef.current.value = "";
    await uploadFiles(files);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const fileItems = items.filter(item => item.kind === "file");
    if (fileItems.length === 0) return; // let normal text paste through
    e.preventDefault();
    const files = fileItems.map(item => item.getAsFile()).filter((f): f is File => f !== null);
    if (files.length > 0) await uploadFiles(files);
  };

  // Native DOM drag listeners on compose area — bypasses React event delegation
  useEffect(() => {
    const el = composeAreaRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setIsDraggingOverCompose(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!el.contains(e.relatedTarget as Node)) setIsDraggingOverCompose(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOverCompose(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) uploadFiles(files);
    };
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const notificationSettingsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("PATCH", "/api/staff/me/notification-settings", { emailNotificationsMessages: enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/me"] });
    },
    onError: () => toast({ title: "Failed to update notification setting", variant: "destructive" }),
  });

  const createTaskFromMsgMutation = useMutation({
    mutationFn: async () => {
      if (!taskFromMsg || !taskTitle.trim()) return;
      await apiRequest("POST", "/api/tasks", {
        title: taskTitle.trim(),
        priority: taskPriority,
        assignedToUserId: taskAssignee || null,
        sourceMessageId: taskFromMsg.messageId,
        sourceMessageText: taskFromMsg.messageText.slice(0, 500),
        jobId: taskFromMsg.jobId || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/count"] });
      toast({ title: "Task created", description: "View it in the Tasks page" });
      setTaskFromMsg(null);
      setTaskTitle("");
      setTaskPriority("medium");
      setTaskAssignee("");
    },
    onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
  });

  // File selected → open crop dialog
  const handleProfileImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingProfileCropFile(file);
    if (profileImageInputRef.current) profileImageInputRef.current.value = "";
  };

  // Crop confirmed → upload blob
  const handleProfileCropConfirm = async (blob: Blob) => {
    setPendingProfileCropFile(null);
    setIsUploadingProfile(true);
    try {
      const uploadRes = await apiRequest("POST", "/api/staff/objects/upload", {});
      const { url, key } = await uploadRes.json();
      await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      const normalizedKey = key.startsWith("/api/img") ? key : `/api/img${key.replace("/objects", "")}`;
      await apiRequest("PUT", "/api/staff/me/profile-picture", { profileImageUrl: normalizedKey });
      await refetchMe();
      toast({ title: "Profile picture updated" });
      setShowProfileDialog(false);
    } catch {
      toast({ title: "Failed to upload profile picture", variant: "destructive" });
    } finally {
      setIsUploadingProfile(false);
    }
  };

  const staffEmailSet = new Set(staffList.map(s => s.email).filter(Boolean) as string[]);

  const customerMentions = currentConvoCustomerUsers
    .filter(u => u.active && !staffEmailSet.has(u.email))
    .map(u => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      isCustomer: true,
    }));

  const allMentionCandidates = [
    ...staffList.map(s => ({ ...s, isCustomer: false })),
    ...customerMentions,
  ];

  const filteredMentions = allMentionCandidates
    .filter(s => !mentionSearch || s.name.toLowerCase().includes(mentionSearch))
    .slice(0, 8);

  const insertMention = (name: string) => {
    const handle = name.split(" ")[0]; // first word as the @handle
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart ?? newMessage.length;
    const textBeforeCursor = newMessage.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (!match) { setShowMentionDropdown(false); return; }
    const beforeMention = textBeforeCursor.slice(0, textBeforeCursor.length - match[0].length);
    const afterCursor = newMessage.slice(cursorPos);
    const newText = `${beforeMention}@${handle} ${afterCursor}`;
    setNewMessage(newText);
    setShowMentionDropdown(false);
    setMentionSearch("");
    setTimeout(() => {
      const newPos = beforeMention.length + handle.length + 2;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewMessage(val);
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (match) {
      setMentionSearch(match[1].toLowerCase());
      setShowMentionDropdown(true);
      setMentionHighlightIdx(0);
    } else {
      setShowMentionDropdown(false);
      setMentionSearch("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionDropdown && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionHighlightIdx(i => Math.min(i + 1, filteredMentions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionHighlightIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); insertMention(filteredMentions[mentionHighlightIdx].name); return; }
      if (e.key === "Escape") { e.preventDefault(); setShowMentionDropdown(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const jobUnread = jobConversations.reduce((s, c) => {
    const effective = c.unreadCount > 0 ? c.unreadCount : (flags.isManuallyUnread(`job:${c.jobId}`) ? 1 : 0);
    return s + effective;
  }, 0);
  const directUnread = directConversations.filter(c => !c.archivedByStaff).reduce((s, c) => {
    const effective = c.unreadCount > 0 ? c.unreadCount : (flags.isManuallyUnread(`direct:${c.id}`) ? 1 : 0);
    return s + effective;
  }, 0);

  // Build customer groups for tile grid
  const visibleConvos = showHidden ? jobConversations : jobConversations.filter(c => !hiddenJobIds.has(c.jobId));
  const hiddenCount = jobConversations.filter(c => hiddenJobIds.has(c.jobId)).length;
  const customerGroups = new Map<string, { customerId: string; customerName: string; customerLogoUrl: string | null; jobs: JobConversation[]; archivedJobs: JobConversation[] }>();
  visibleConvos.forEach(c => {
    if (!customerGroups.has(c.customerId)) {
      customerGroups.set(c.customerId, { customerId: c.customerId, customerName: c.customerName, customerLogoUrl: c.customerLogoUrl, jobs: [], archivedJobs: [] });
    }
    customerGroups.get(c.customerId)!.jobs.push(c);
  });
  // Include archived chats so they show in the drilled view, and include archived-only customers in the tile grid
  archivedConversations.forEach(c => {
    if (!customerGroups.has(c.customerId)) {
      customerGroups.set(c.customerId, { customerId: c.customerId, customerName: c.customerName, customerLogoUrl: c.customerLogoUrl, jobs: [], archivedJobs: [] });
    }
    customerGroups.get(c.customerId)!.archivedJobs.push(c);
  });
  const sortedGroups = Array.from(customerGroups.values()).sort((a, b) => {
    const aUnread = a.jobs.reduce((s, j) => s + (j.unreadCount > 0 ? j.unreadCount : flags.isManuallyUnread(`job:${j.jobId}`) ? 1 : 0), 0);
    const bUnread = b.jobs.reduce((s, j) => s + (j.unreadCount > 0 ? j.unreadCount : flags.isManuallyUnread(`job:${j.jobId}`) ? 1 : 0), 0);
    if (aUnread > 0 && bUnread === 0) return -1;
    if (bUnread > 0 && aUnread === 0) return 1;
    if (aUnread > 0 && bUnread > 0) {
      const aLatest = Math.max(...a.jobs.map(j => j.latestMessage ? new Date(j.latestMessage.createdAt).getTime() : 0));
      const bLatest = Math.max(...b.jobs.map(j => j.latestMessage ? new Date(j.latestMessage.createdAt).getTime() : 0));
      return bLatest - aLatest;
    }
    return a.customerName.localeCompare(b.customerName);
  });
  const unreadGroups = sortedGroups.filter(g => g.jobs.some(j => j.unreadCount > 0 || flags.isManuallyUnread(`job:${j.jobId}`)));
  const readGroups = sortedGroups.filter(g => !g.jobs.some(j => j.unreadCount > 0 || flags.isManuallyUnread(`job:${j.jobId}`)));

  const drilledGroup = drillCustomerId ? customerGroups.get(drillCustomerId) : null;

  const handleCustomerTileClick = (group: { customerId: string; customerName: string; customerLogoUrl: string | null; jobs: JobConversation[]; archivedJobs: JobConversation[] }) => {
    // Always drill into the job list so staff always see which job they're opening
    setDrillCustomerId(group.customerId);
    setLeftView("jobs");
    setDrillSearch("");
    setDrillShowArchived(false);
  };

  const renderCustomerTile = (group: { customerId: string; customerName: string; customerLogoUrl: string | null; jobs: JobConversation[]; archivedJobs: JobConversation[] }) => {
    const groupUnread = group.jobs.reduce((s, j) => {
      return s + (j.unreadCount > 0 ? j.unreadCount : flags.isManuallyUnread(`job:${j.jobId}`) ? 1 : 0);
    }, 0);
    const groupHasReminder = group.jobs.some(j => flags.hasReminder(`job:${j.jobId}`));
    const isSelectedCustomer = group.jobs.some(j => selected?.type === "job" && selected.jobId === j.jobId);
    const lastMsg = group.jobs
      .map(j => j.latestMessage)
      .filter(Boolean)
      .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime())[0];
    return (
      <button
        key={group.customerId}
        onClick={() => handleCustomerTileClick(group)}
        className={`relative rounded-md border flex flex-col items-center gap-1.5 p-3 text-center hover-elevate transition-colors ${
          isSelectedCustomer ? "border-primary bg-primary/5" : groupUnread > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
        }`}
        data-testid={`customer-tile-${group.customerId}`}
      >
        {groupUnread > 0 && (
          <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 text-[10px] z-10">
            {groupUnread}
          </Badge>
        )}
        <div className={`h-12 w-12 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm shrink-0 ${group.customerLogoUrl ? "bg-transparent" : customerColor(group.customerId)}`}>
          {group.customerLogoUrl
            ? <img src={group.customerLogoUrl} alt={group.customerName} className="h-full w-full object-contain" />
            : getInitials(group.customerName)
          }
        </div>
        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2"><DemoText>{group.customerName}</DemoText></p>
        <div className="flex items-center gap-1 flex-wrap justify-center">
          <Package className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{group.jobs.length} job{group.jobs.length !== 1 ? "s" : ""}</span>
          {group.archivedJobs.length > 0 && (
            <span className="text-[10px] text-muted-foreground/80 inline-flex items-center gap-0.5">
              <Archive className="h-2.5 w-2.5" />{group.archivedJobs.length}
            </span>
          )}
          {groupHasReminder && <Clock className="h-3 w-3 text-primary/70" />}
        </div>
        {lastMsg && (
          <p className="text-[10px] text-muted-foreground">{formatConvoTime(lastMsg.createdAt)}</p>
        )}
      </button>
    );
  };

  const handleBackToTiles = () => {
    setLeftView("tiles");
    setDrillCustomerId(null);
  };

  // When a job is selected, if we're in tile view, make sure we switch to jobs view for multi-job customers
  useEffect(() => {
    if (selected?.type === "job") {
      const convo = jobConversations.find(c => c.jobId === selected.jobId);
      if (convo && customerGroups.has(convo.customerId)) {
        const group = customerGroups.get(convo.customerId)!;
        if (group.jobs.length > 1) {
          setDrillCustomerId(convo.customerId);
          setLeftView("jobs");
        }
      }
    }
  }, [selected?.type === "job" ? selected.jobId : null]);

  const currentUserName = currentUser?.staffName || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ") || currentUser?.email;
  const currentUserInitials = getInitials(currentUserName, "ME");

  // Show left panel: always on desktop, only when no chat selected on mobile
  const showLeftPanel = !selected || window.innerWidth >= 640;
  const showChatPanel = !!selected;

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div className={`w-full sm:w-80 flex-shrink-0 border-r flex flex-col overflow-hidden ${selected ? "hidden sm:flex" : "flex"}`}>

        {/* Profile strip at top */}
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <button
            onClick={() => setShowProfileDialog(true)}
            className="relative group"
            data-testid="button-my-profile"
            title="Update your profile picture"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={currentUser?.profileImageUrl || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {currentUserInitials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="h-3 w-3 text-white" />
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{currentUserName || "Staff"}</p>
            <p className="text-[10px] text-muted-foreground truncate">{currentUser?.email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex">
            {(["job", "direct"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setSelected(null);
                  setLeftView("tiles");
                  setDrillCustomerId(null);
                  isInitialLoad.current = true;
                }}
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

        {/* New chat button */}
        <div className="px-3 py-2 border-b space-y-1.5">
          {tab === "job" ? (
            <>
              <Button size="sm" className="w-full" onClick={() => setShowMsgExisting(true)} data-testid="button-msg-existing-order">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Message Existing Order
              </Button>
              <Button size="sm" variant="outline" className="w-full" onClick={() => setShowNewOrderChat(true)} data-testid="button-new-order-chat">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create New Job
              </Button>
            </>
          ) : (
            <Button size="sm" className="w-full" onClick={() => setShowNewConvo(true)} data-testid="button-new-conversation">
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
            ) : sortedGroups.length === 0 ? (
              <EmptyState label="No job conversations" sublabel="Customer messages will appear here" />
            ) : leftView === "jobs" && drilledGroup ? (
              // ── Job picker for a specific customer ─────────────────────────
              <div className="flex flex-col h-full">
                <button
                  onClick={handleBackToTiles}
                  className="flex items-center gap-2 px-3 py-2.5 border-b text-xs text-muted-foreground hover-elevate bg-muted/30 w-full text-left"
                  data-testid="button-back-to-tiles"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <div className={`h-5 w-5 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-white text-[10px] font-bold ${drilledGroup.customerLogoUrl ? "bg-transparent" : customerColor(drilledGroup.customerId)}`}>
                    {drilledGroup.customerLogoUrl
                      ? <img src={drilledGroup.customerLogoUrl} alt={drilledGroup.customerName} className="h-full w-full object-contain" />
                      : getInitials(drilledGroup.customerName)
                    }
                  </div>
                  <span className="font-semibold text-foreground"><DemoText>{drilledGroup.customerName}</DemoText></span>
                </button>
                <div className="px-3 py-2 border-b">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      value={drillSearch}
                      onChange={(e) => setDrillSearch(e.target.value)}
                      placeholder="Search this customer's messages…"
                      className="pl-8 h-8 text-xs"
                      data-testid="input-drill-search"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {debouncedDrillSearch.length >= 2 ? (
                    <div className="p-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1.5">
                        {isSearchingDrill ? "Searching…" : `${drillSearchResults.length} result${drillSearchResults.length !== 1 ? "s" : ""}`}
                      </p>
                      {!isSearchingDrill && drillSearchResults.length === 0 && (
                        <p className="text-xs text-muted-foreground px-1 py-3">No messages match "{debouncedDrillSearch}".</p>
                      )}
                      <div className="space-y-1">
                        {drillSearchResults.map(r => {
                          const isActive = selected?.type === "job" && selected.jobId === r.jobId;
                          return (
                            <button
                              key={r.id}
                              onClick={() => setSelected({ type: "job", jobId: r.jobId })}
                              className={`w-full text-left rounded-md px-2.5 py-2 border hover-elevate ${isActive ? "border-primary bg-primary/5" : "border-border"}`}
                              data-testid={`search-result-${r.id}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-xs font-medium truncate">{r.jobName}</span>
                                  {r.isArchived && (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                                      <Archive className="h-2.5 w-2.5 mr-0.5" />Archived
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground shrink-0">{formatConvoTime(r.createdAt)}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                                {r.senderType === "staff" ? "You: " : ""}{r.message}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                  <>
                  {drilledGroup.jobs.length === 0 && drilledGroup.archivedJobs.length > 0 && (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      No active chats — see archived below.
                    </div>
                  )}
                  {drilledGroup.jobs.map(c => {
                    const isActive = selected?.type === "job" && selected.jobId === c.jobId;
                    const isHidden = hiddenJobIds.has(c.jobId);
                    return (
                      <div key={c.jobId} className={`group/jobrow flex items-center border-b border-border/30 ${isActive ? "bg-primary/8" : isHidden ? "opacity-50" : ""}`}>
                        <button
                          onClick={() => setSelected({ type: "job", jobId: c.jobId })}
                          className="flex-1 flex items-start gap-3 px-4 py-3 text-left hover-elevate min-w-0"
                          data-testid={`job-convo-${c.jobId}`}
                        >
                          <Package className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-xs font-medium truncate ${isActive ? "text-primary" : ""}`}>{c.jobName}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                {(c.unreadCount > 0 || flags.isManuallyUnread(`job:${c.jobId}`)) && (
                                  <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                                    {c.unreadCount > 0 ? c.unreadCount : 1}
                                  </Badge>
                                )}
                                {flags.hasReminder(`job:${c.jobId}`) && (
                                  <Clock className="h-3 w-3 text-primary/70" />
                                )}
                                {c.latestMessage && (
                                  <span className="text-[10px] text-muted-foreground">{formatConvoTime(c.latestMessage.createdAt)}</span>
                                )}
                              </div>
                            </div>
                            {c.latestMessage && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {c.latestMessage.senderType === "staff" ? "You: " : ""}
                                {c.latestMessage.message}
                              </p>
                            )}
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleHideJob(c.jobId); }}
                          className="shrink-0 mx-2 text-muted-foreground opacity-0 group-hover/jobrow:opacity-100 transition-opacity"
                          title={isHidden ? "Unhide" : "Hide conversation"}
                          data-testid={`button-hide-job-${c.jobId}`}
                        >
                          {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                  {drilledGroup.archivedJobs.length > 0 && (
                    <ArchivedSection
                      conversations={drilledGroup.archivedJobs}
                      selected={selected}
                      onSelect={(jId) => setSelected({ type: "job", jobId: jId })}
                      onUnarchive={(jId) => archiveConvoJobMutation.mutate({ jobId: jId, archive: false })}
                      expanded={drillShowArchived}
                      onToggle={() => setDrillShowArchived(e => !e)}
                    />
                  )}
                  </>
                  )}
                </div>
              </div>
            ) : (
              // ── Customer tile grid ─────────────────────────────────────────
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-3">
                  {sortedGroups.length === 0 ? (
                    <EmptyState label="All conversations are hidden" />
                  ) : (
                    <div className="space-y-3">
                      {unreadGroups.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <Pin className="h-3 w-3" /> New Messages
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {unreadGroups.map(group => renderCustomerTile(group))}
                          </div>
                          {readGroups.length > 0 && <div className="border-t" />}
                        </>
                      )}
                      {readGroups.length > 0 && (
                        <>
                          {unreadGroups.length > 0 && (
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">All Customers</p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            {readGroups.map(group => renderCustomerTile(group))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setShowHidden(h => !h)}
                    className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground border-t hover-elevate"
                    data-testid="button-toggle-hidden"
                  >
                    {showHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showHidden ? "Hide hidden chats" : `Show ${hiddenCount} hidden`}
                  </button>
                )}
              </div>
            )
          ) : (
            // ── Direct messages list ─────────────────────────────────────────
            isLoadingDirectConvos ? (
              <LoadingSpinner />
            ) : (() => {
              const activeDirect = directConversations.filter(c => !c.archivedByStaff);
              const archivedDirect = directConversations.filter(c => c.archivedByStaff);
              return (
                <>
                  {activeDirect.length === 0 ? (
                    <EmptyState label="No general chats" sublabel="Start a general conversation with a customer" />
                  ) : (
                    activeDirect.map(c => (
                      <ConvoRow
                        key={c.id}
                        isActive={selected?.type === "direct" && selected.conversationId === c.id}
                        title={c.customerName}
                        subtitle={c.subject}
                        unread={c.unreadCount > 0 ? c.unreadCount : (flags.isManuallyUnread(`direct:${c.id}`) ? 1 : 0)}
                        latest={c.latestMessage}
                        senderLabel={c.customerName}
                        onClick={() => setSelected({ type: "direct", conversationId: c.id })}
                        testId={`direct-convo-${c.id}`}
                        hasReminder={flags.hasReminder(`direct:${c.id}`)}
                      />
                    ))
                  )}
                  {archivedDirect.length > 0 && (
                    <ArchivedDirectSection
                      conversations={archivedDirect}
                      selectedId={selected?.type === "direct" ? selected.conversationId : null}
                      onSelect={(id) => setSelected({ type: "direct", conversationId: id })}
                      onUnarchive={(id) => unarchiveConvoMutation.mutate(id)}
                    />
                  )}
                </>
              );
            })()
          )}
        </div>
      </div>

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chat header */}
          <div className="px-3 sm:px-4 py-3 border-b bg-card/40 flex items-center gap-1.5 sm:gap-3">
            <Button variant="ghost" size="icon" className="sm:hidden shrink-0" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {selected.type === "job" ? (
              <>
                <div className={`h-9 w-9 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm shrink-0 ${customerColor(selectedJobConvo?.customerId || "")}`}>
                  {currentCustomerLogo
                    ? <img src={currentCustomerLogo} alt={selectedJobConvo?.customerName || ""} className="h-full w-full object-cover" />
                    : getInitials(selectedJobConvo?.customerName)
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedJobConvo?.jobName}</p>
                  <p className="text-xs text-muted-foreground">{selectedJobConvo?.customerName ? <DemoText>{selectedJobConvo.customerName}</DemoText> : null}</p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 px-2 sm:px-3" onClick={() => setLocation(`/staff/job/${selectedJobConvo?.jobId}`)} data-testid="button-view-job">
                  <Briefcase className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">View Job</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 px-2 sm:px-3"
                  title={selectedJobConvo?.isArchivedByStaff ? "Restore conversation to active list" : "Archive this conversation"}
                  onClick={() => {
                    if (selectedJobConvo?.isArchivedByStaff) {
                      archiveConvoJobMutation.mutate({ jobId: selectedJobConvo!.jobId, archive: false });
                    } else {
                      setConfirmArchiveJobId(selectedJobConvo!.jobId);
                    }
                  }}
                  disabled={archiveConvoJobMutation.isPending}
                  data-testid="button-archive-job-convo"
                >
                  {selectedJobConvo?.isArchivedByStaff
                    ? <><ArchiveX className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Restore</span></>
                    : <><Archive className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Archive</span></>}
                </Button>
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
              </>
            ) : (
              <>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedDirectConvo?.subject}</p>
                  <p className="text-xs text-muted-foreground">{selectedDirectConvo?.customerName ? <DemoText>{selectedDirectConvo.customerName}</DemoText> : null}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 px-2 sm:px-3"
                  title="Archive this conversation"
                  onClick={() => archiveConvoMutation.mutate(selectedDirectConvo!.id)}
                  data-testid="button-archive-convo"
                >
                  <Archive className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Archive</span>
                </Button>
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
              </>
            )}
          </div>

          {/* Pinned sample images strip */}
          {messages.some(m => m.imageUrl) && (
            <div className="border-b bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Pin className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sample Images</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {messages.filter(m => m.imageUrl).map(m => (
                  <a key={m.id} href={m.imageUrl!} target="_blank" rel="noopener noreferrer" className="block" data-testid={`pinned-sample-${m.id}`}>
                    <img src={m.imageUrl!} alt="Sample" className="h-14 w-14 rounded-md object-cover border border-border hover:opacity-80 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-6 space-y-3">
            {isLoadingMessages ? (
              <LoadingSpinner />
            ) : messages.length === 0 ? (
              <EmptyState label="No messages yet" />
            ) : (
              messages.map((msg, idx) => {
                const isStaff = msg.senderType === "staff";
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const sameGroup = prevMsg && prevMsg.senderType === msg.senderType && prevMsg.senderName === msg.senderName;
                const showAvatar = !sameGroup;
                const initials = getInitials(msg.senderName, isStaff ? "S" : "C");
                return (
                  <div key={msg.id} className={`group/msg flex items-end gap-2.5 ${isStaff ? "flex-row-reverse" : "flex-row"}`} data-testid={`message-${msg.id}`}>
                    {/* Action buttons — own (staff) messages: edit + unsend + remind */}
                    {isStaff && !(msg as any).deleted && editingMsgId !== msg.id && (
                      <div className="invisible group-hover/msg:visible flex flex-col gap-1 shrink-0">
                        {selected?.type === "job" && (
                          <button
                            type="button"
                            title="Edit message"
                            onClick={() => { setEditingMsgId(msg.id); setEditingText(msg.message || ""); }}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            data-testid={`button-edit-msg-${msg.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Unsend"
                          onClick={() => selected?.type === "direct"
                            ? unsendDirectMessageMutation.mutate(msg.id)
                            : unsendMessageMutation.mutate(msg.id)
                          }
                          disabled={unsendMessageMutation.isPending || unsendDirectMessageMutation.isPending}
                          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          data-testid={`button-unsend-${msg.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <Popover open={remindOpenMsgId === msg.id} onOpenChange={open => setRemindOpenMsgId(open ? msg.id : null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              title="Remind me"
                              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                              data-testid={`button-remind-${msg.id}`}
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-44 p-1" align="end" side="left">
                            <p className="text-[10px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wide">Remind me</p>
                            {REMIND_OPTIONS.map(opt => (
                              <button
                                key={opt.label}
                                type="button"
                                onClick={() => createReminderMutation.mutate({
                                  messageId: msg.id,
                                  messageType: selected?.type === 'direct' ? 'direct' : 'job',
                                  remindAt: opt.getDate(),
                                  messagePreview: (msg.message || "").replace(/\[FILE:[^:]+:[^\]]+\]/g, "").trim().slice(0, 120),
                                })}
                                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/60 transition-colors"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                    {/* Action buttons — incoming (customer) messages: mark unread + remind + create task */}
                    {!isStaff && !(msg as any).deleted && editingMsgId !== msg.id && (
                      <div className="invisible group-hover/msg:visible flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          title="Mark as unread"
                          onClick={() => markUnreadMutation.mutate({ messageId: msg.id, type: selected?.type === 'direct' ? 'direct' : 'job' })}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          data-testid={`button-mark-unread-${msg.id}`}
                        >
                          <MailOpen className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Create task from message"
                          onClick={() => {
                            const cleanText = (msg.message || "").replace(/\[FILE:[^:]+:[^\]]+\]/g, "").trim().slice(0, 200);
                            setTaskFromMsg({ messageId: msg.id, messageText: cleanText, jobId: selected?.type === 'job' ? selected.jobId : undefined });
                            setTaskTitle("");
                            setTaskPriority("medium");
                          }}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          data-testid={`button-create-task-from-msg-${msg.id}`}
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                        </button>
                        <Popover open={remindOpenMsgId === msg.id} onOpenChange={open => setRemindOpenMsgId(open ? msg.id : null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              title="Remind me"
                              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                              data-testid={`button-remind-${msg.id}`}
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-44 p-1" align="start" side="right">
                            <p className="text-[10px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wide">Remind me</p>
                            {REMIND_OPTIONS.map(opt => (
                              <button
                                key={opt.label}
                                type="button"
                                onClick={() => createReminderMutation.mutate({
                                  messageId: msg.id,
                                  messageType: selected?.type === 'direct' ? 'direct' : 'job',
                                  remindAt: opt.getDate(),
                                  messagePreview: (msg.message || "").replace(/\[FILE:[^:]+:[^\]]+\]/g, "").trim().slice(0, 120),
                                })}
                                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/60 transition-colors"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                    {/* Avatar + name below */}
                    <div className={`flex flex-col items-center gap-0.5 shrink-0 ${showAvatar ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                      <div className={`h-8 w-8 rounded-full overflow-hidden flex items-center justify-center border-2 border-background ${isStaff ? "bg-blue-500" : "bg-orange-400"}`}>
                        {msg.senderImageUrl ? (
                          <img src={msg.senderImageUrl} alt={msg.senderName || ""} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold leading-none text-white">
                            {initials}
                          </span>
                        )}
                      </div>
                      {msg.senderName && (
                        <span className="text-[9px] font-medium text-muted-foreground text-center leading-tight max-w-[44px] truncate">
                          {msg.senderName.split(" ")[0]}
                        </span>
                      )}
                    </div>
                    {/* Bubble */}
                    <div className={`max-w-[72%] ${editingMsgId === msg.id ? "min-w-[300px]" : ""} ${isStaff ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {msg.isInternal && showAvatar && (
                        <p className={`text-[10px] font-semibold px-1 ${isStaff ? "text-right text-muted-foreground" : "text-muted-foreground"}`}>
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                            <Lock className="h-2.5 w-2.5" /> Team only
                          </span>
                        </p>
                      )}
                      <div className={`rounded-2xl px-4 py-2.5 ${
                        (msg as any).deleted
                          ? "bg-muted border border-border rounded-br-sm"
                          : msg.isInternal
                            ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50 text-foreground rounded-br-sm"
                            : isStaff
                              ? "bg-blue-500 text-white rounded-br-sm"
                              : "bg-orange-400 text-white rounded-bl-sm"
                      }`}>
                        {(msg as any).deleted ? (
                          <p className="text-xs text-muted-foreground italic">Message deleted</p>
                        ) : editingMsgId === msg.id ? (
                          <div className="flex flex-col gap-2 w-full min-w-[260px]">
                            <textarea
                              autoFocus
                              value={editingText}
                              onChange={e => setEditingText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  if (editingText.trim()) editMessageMutation.mutate({ messageId: msg.id, message: editingText });
                                }
                                if (e.key === "Escape") { setEditingMsgId(null); setEditingText(""); }
                              }}
                              className={`text-sm w-full rounded-lg px-2 py-1.5 resize-none focus:outline-none leading-relaxed ${msg.isInternal ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700 focus:border-amber-500" : "bg-white/20 text-white placeholder:text-white/60 border border-white/30 focus:border-white/60"}`}
                              rows={Math.max(2, editingText.split("\n").length)}
                              data-testid="input-edit-message"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => { setEditingMsgId(null); setEditingText(""); }}
                                className="text-[11px] text-white/70 hover:text-white transition-colors px-2 py-0.5"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => { if (editingText.trim()) editMessageMutation.mutate({ messageId: msg.id, message: editingText }); }}
                                disabled={editMessageMutation.isPending || !editingText.trim()}
                                className="flex items-center gap-1 text-[11px] bg-white/20 hover:bg-white/30 text-white rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                                data-testid="button-save-edit-message"
                              >
                                <Check className="h-3 w-3" />
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (() => {
                          const fileRegex = /\[FILE:([^:]+):([^\]]+)\]/g;
                          const rawText = msg.message || "";
                          const fileMatches: { name: string; url: string }[] = [];
                          let m: RegExpExecArray | null;
                          while ((m = fileRegex.exec(rawText)) !== null) {
                            fileMatches.push({ name: m[1], url: m[2] });
                          }
                          const displayText = rawText.replace(/\[FILE:[^:]+:[^\]]+\]/g, "").trim();
                          const hasVisibleContent = displayText || msg.imageUrl || fileMatches.length > 0;
                          return (
                            <>
                              {displayText && (
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderMessageContent(displayText)}</p>
                              )}
                              {!hasVisibleContent && (
                                <p className="text-sm italic opacity-60">(no content)</p>
                              )}
                              {fileMatches.map((f, fi) => (
                                <a
                                  key={fi}
                                  href={`${f.url}?filename=${encodeURIComponent(f.name)}`}
                                  download={f.name}
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-2 mt-2 px-3 py-2 rounded-lg text-sm font-medium no-underline transition-opacity hover:opacity-80 ${
                                    msg.isInternal ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700" : "bg-white/20 text-white"
                                  }`}
                                >
                                  <FileText className="h-4 w-4 shrink-0" />
                                  <span className="truncate max-w-[180px]">{f.name}</span>
                                </a>
                              ))}
                            </>
                          );
                        })()}
                        {!((msg as any).deleted) && editingMsgId !== msg.id && msg.imageUrl && (
                          <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                            <img src={msg.imageUrl} alt="Sample" className="max-w-full rounded-lg max-h-48 object-contain hover:opacity-90 transition-opacity" />
                          </a>
                        )}
                        {editingMsgId !== msg.id && (
                          <div className={`flex items-center gap-1.5 mt-1 ${isStaff ? "justify-end" : ""}`}>
                            {msg.isInternal && !((msg as any).deleted) && <Lock className={`h-2.5 w-2.5 ${msg.isInternal ? "text-amber-600 dark:text-amber-400" : ""}`} />}
                            {(msg as any).editedAt && !((msg as any).deleted) && (
                              <span className={`text-[10px] italic ${msg.isInternal ? "text-amber-600/70 dark:text-amber-400/70" : "text-white/70"}`}>edited</span>
                            )}
                            <p className={`text-[10px] ${(msg as any).deleted ? "text-muted-foreground" : msg.isInternal ? "text-amber-600/70 dark:text-amber-400/70" : "text-white/70"}`}>
                              {format(new Date(msg.createdAt), "d MMM, h:mm a")}
                            </p>
                          </div>
                        )}
                      </div>
                      {/* Thumbs up reaction */}
                      {!((msg as any).deleted) && editingMsgId !== msg.id && selected?.type === "job" && (() => {
                        const thumbsUpBy: string[] = (msg as any).thumbsUpBy || [];
                        const hasReacted = currentUser?.id ? thumbsUpBy.includes(currentUser.id) : false;
                        const count = thumbsUpBy.length;
                        return (count > 0 || true) ? (
                          <button
                            type="button"
                            onClick={() => thumbsUpMutation.mutate(msg.id)}
                            className={`self-${isStaff ? "end" : "start"} mt-0.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${
                              hasReacted
                                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700"
                                : "invisible group-hover/msg:visible bg-muted/60 text-muted-foreground border border-transparent hover:border-border"
                            }`}
                            data-testid={`button-thumbs-up-${msg.id}`}
                          >
                            <ThumbsUp className={`h-3 w-3 ${hasReacted ? "fill-current" : ""}`} />
                            {count > 0 && <span>{count}</span>}
                          </button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose area */}
          <div
            ref={composeAreaRef}
            className={`border-t p-3 bg-card/40 relative transition-colors ${isDraggingOverCompose ? "bg-primary/5 border-primary" : ""}`}
          >
            {isDraggingOverCompose && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-lg border-2 border-dashed border-primary bg-primary/10 pointer-events-none">
                <div className="flex items-center gap-2 text-primary font-medium text-sm">
                  <Paperclip className="h-4 w-4" />
                  Drop files to attach
                </div>
              </div>
            )}
            {/* Internal toggle — only for job chats */}
            {selected.type === "job" && (
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={() => setIsInternal(v => !v)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    isInternal
                      ? "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-400"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-toggle-internal"
                >
                  <Lock className="h-3 w-3" />
                  {isInternal ? "Team only" : "Reply to customer"}
                </button>
                {isInternal && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                    Customer will not see this message
                  </span>
                )}
              </div>
            )}
            {/* Attachment preview */}
            {(chatImages.length > 0 || isUploadingChatImage) && (
              <div className="mb-2 flex items-start gap-2 flex-wrap">
                {chatImages.map((att, i) => (
                  <div key={att.key} className="relative">
                    {att.isImage && att.preview ? (
                      <img src={att.preview} alt="Preview" className="h-16 w-16 rounded-md object-cover border border-border" />
                    ) : (
                      <div className="h-16 w-28 rounded-md border border-border bg-muted flex flex-col items-center justify-center gap-1 px-2">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 break-all">{att.fileName}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setChatImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      data-testid={`button-remove-chat-image-${i}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {isUploadingChatImage && <span className="text-xs text-muted-foreground mt-1 self-center">Uploading…</span>}
              </div>
            )}
            <input ref={chatImageInputRef} type="file" multiple className="hidden" onChange={handleChatImageSelect} data-testid="input-chat-image-file" />
            <div className={`flex gap-2 items-end ${isInternal ? "opacity-100" : ""}`}>
              <Button
                variant="outline"
                size="icon"
                type="button"
                onClick={() => chatImageInputRef.current?.click()}
                disabled={isUploadingChatImage}
                data-testid="button-attach-chat-image"
                title="Attach file or image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <div className="relative flex-1">
                {/* @mention dropdown */}
                {showMentionDropdown && filteredMentions.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 z-50 bg-popover border border-border rounded-md shadow-md overflow-hidden" data-testid="mention-dropdown">
                    {filteredMentions.map((s, idx) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); insertMention(s.name); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${idx === mentionHighlightIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}
                        data-testid={`mention-option-${s.id}`}
                      >
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${customerColor(s.id)}`}>
                          {getInitials(s.name)}
                        </div>
                        <span>{s.name}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {s.isCustomer && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Customer</span>
                          )}
                          <span className="text-xs text-muted-foreground">@{s.name.split(" ")[0]}</span>
                        </span>
                      </button>
                    ))}
                    <div className="px-3 py-1 border-t bg-muted/30">
                      <span className="text-[10px] text-muted-foreground">↑↓ navigate · Enter select · Esc dismiss</span>
                    </div>
                  </div>
                )}
                <Textarea
                  ref={textareaRef}
                  placeholder={isInternal ? "Internal note (staff only)… type @ to mention someone" : "Reply… type @ to mention someone (Enter to send, Shift+Enter new line)"}
                  value={newMessage}
                  onChange={handleMessageChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  autoResize
                  className={`text-sm w-full ${isInternal ? "border-amber-300 focus-visible:ring-amber-400 dark:border-amber-700" : ""}`}
                  data-testid="input-staff-message"
                />
              </div>
              <Button
                onClick={handleSend}
                disabled={(!newMessage.trim() && chatImages.length === 0) || isUploadingChatImage || sendJobMessageMutation.isPending || sendDirectMessageMutation.isPending}
                size="icon"
                className={isInternal ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
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

      {/* ── Profile picture dialog ───────────────────────────────────────────── */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="max-w-sm" data-testid="dialog-profile">
          <DialogHeader>
            <DialogTitle>Your Profile</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={currentUser?.profileImageUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                  {currentUserInitials}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="text-center">
              <p className="font-semibold">{currentUserName}</p>
              <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
            </div>
            <input
              ref={profileImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfileImageSelect}
              data-testid="input-profile-image-file"
            />
            <Button
              onClick={() => profileImageInputRef.current?.click()}
              disabled={isUploadingProfile}
              variant="outline"
              className="w-full"
              data-testid="button-upload-profile-picture"
            >
              <Camera className="h-4 w-4 mr-2" />
              {isUploadingProfile ? "Uploading…" : "Change Profile Picture"}
            </Button>

            <div className="w-full border-t pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="toggle-email-notifs" className="text-sm font-medium leading-none">
                    Email notifications
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Receive an email when a customer sends you a message
                  </p>
                </div>
                <Switch
                  id="toggle-email-notifs"
                  checked={currentUser?.emailNotificationsMessages ?? false}
                  onCheckedChange={(checked) => notificationSettingsMutation.mutate(checked)}
                  disabled={notificationSettingsMutation.isPending}
                  data-testid="toggle-email-notifications"
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        file={pendingProfileCropFile}
        onConfirm={handleProfileCropConfirm}
        onCancel={() => setPendingProfileCropFile(null)}
      />

      {/* ── Archive confirmation dialog ─────────────────────────────────────── */}
      <AlertDialog open={!!confirmArchiveJobId} onOpenChange={open => { if (!open) setConfirmArchiveJobId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              The chat thread will be hidden from the main messages list and moved to the archived section. You can unarchive it at any time. The job itself is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmArchiveJobId) {
                  archiveConvoJobMutation.mutate({ jobId: confirmArchiveJobId, archive: true });
                  setConfirmArchiveJobId(null);
                }
              }}
              data-testid="button-confirm-archive"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Message Existing Order dialog ──────────────────────────────────── */}
      <Dialog open={showMsgExisting} onOpenChange={(open) => {
        setShowMsgExisting(open);
        if (!open) { setMsgExistingCustomerId(""); setMsgExistingCustomerSearch(""); setMsgExistingJobId(""); setMsgExistingText(""); }
      }}>
        <DialogContent className="max-w-lg" data-testid="dialog-msg-existing">
          <DialogHeader>
            <DialogTitle>Message Existing Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Customer *</label>
              <div className="border rounded-md overflow-hidden">
                <div className="flex items-center px-3 py-2 border-b bg-muted/30">
                  <Search className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Search customers…"
                    value={msgExistingCustomerSearch}
                    onChange={e => { setMsgExistingCustomerSearch(e.target.value); setMsgExistingCustomerId(""); setMsgExistingJobId(""); }}
                    data-testid="input-msg-existing-customer-search"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {customers
                    .filter(c => c.name.toLowerCase().includes(msgExistingCustomerSearch.toLowerCase()))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setMsgExistingCustomerId(c.id); setMsgExistingCustomerSearch(c.name); setMsgExistingJobId(""); }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${msgExistingCustomerId === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}
                        data-testid={`option-msg-existing-customer-${c.id}`}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {msgExistingCustomerId && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Order *</label>
                {customerJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders found for this customer.</p>
                ) : (
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                    {customerJobs
                      .filter(j => j.invoiceStatus !== "invoiced")
                      .sort((a, b) => (b.jobNumber ?? 0) - (a.jobNumber ?? 0))
                      .map(j => {
                        const statusLabel = (() => {
                          if (j.status === "pending_customer_approval" || j.status === "pending") return "Pending approval";
                          if (j.status === "production") return "In production";
                          if (j.status === "completed") return "Completed";
                          return j.status;
                        })();
                        return (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => setMsgExistingJobId(j.id)}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${msgExistingJobId === j.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}
                          data-testid={`option-msg-existing-job-${j.id}`}
                        >
                          <span className="font-medium truncate">{j.jobName || "Untitled job"}</span>
                          <span className={`text-xs shrink-0 ${msgExistingJobId === j.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {j.jobNumber ? `#${j.jobNumber}` : ""} · {statusLabel}
                          </span>
                        </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {msgExistingJobId && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Message *</label>
                <Textarea
                  placeholder="Type your message…"
                  autoResize
                  value={msgExistingText}
                  onChange={e => setMsgExistingText(e.target.value)}
                  data-testid="input-msg-existing-text"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMsgExisting(false)} disabled={isSendingMsgExisting}>Cancel</Button>
            <Button
              onClick={handleSendMsgExisting}
              disabled={!msgExistingJobId || !msgExistingText.trim() || isSendingMsgExisting}
              data-testid="button-send-msg-existing"
            >
              {isSendingMsgExisting ? "Sending…" : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New order chat dialog ──────────────────────────────────────────── */}
      <Dialog open={showNewOrderChat} onOpenChange={(open) => { setShowNewOrderChat(open); if (!open) resetOrderChatForm(); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-new-order-chat">
          <DialogHeader>
            <DialogTitle>Create New Job</DialogTitle>
          </DialogHeader>
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            This creates a <strong>brand new blank job</strong> in the production queue and opens its chat thread. To chat about an existing job or portal submission, click on it in the list on the left instead.
          </div>
          <ScrollArea className="max-h-[70vh] pr-1">
            <div className="space-y-4 py-1 pr-3">
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
                    {customers.filter(c => c.name.toLowerCase().includes(newOrderCustomerSearch.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setNewOrderCustomerId(c.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${newOrderCustomerId === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}
                        data-testid={`option-customer-${c.id}`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Job Name *</label>
                <Input placeholder="e.g. Polo shirts — Spring 2026" value={newOrderJobName} onChange={e => setNewOrderJobName(e.target.value)} data-testid="input-order-chat-job-name" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Include Colleagues</label>
                <div className="border rounded-md divide-y max-h-36 overflow-y-auto">
                  {staffList.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-2">No staff found</p>
                  ) : staffList.map(s => (
                    <label key={s.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm" data-testid={`option-colleague-${s.id}`}>
                      <Checkbox
                        checked={newOrderColleagues.includes(s.id)}
                        onCheckedChange={(checked) => setNewOrderColleagues(prev => checked ? [...prev, s.id] : prev.filter(id => id !== s.id))}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Message *</label>
                <Textarea placeholder="Type your opening message…" autoResize value={newOrderMessage} onChange={e => setNewOrderMessage(e.target.value)} data-testid="input-order-chat-message" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Attachments</label>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { const picked = Array.from(e.target.files || []); setNewOrderFiles(prev => [...prev, ...picked]); e.target.value = ""; }} data-testid="input-order-chat-files" />
                <DropZone onFiles={files => setNewOrderFiles(prev => [...prev, ...files])} onBrowse={() => fileInputRef.current?.click()} />
                {newOrderFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {newOrderFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileIcon name={f.name} />
                          <span className="truncate">{f.name}</span>
                          <span className="text-muted-foreground/70 shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button type="button" onClick={() => setNewOrderFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground shrink-0 ml-2" data-testid={`button-remove-file-${i}`}>
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
            <Button variant="outline" onClick={() => setShowNewOrderChat(false)} disabled={isCreatingOrderChat}>Cancel</Button>
            <Button onClick={handleCreateOrderChat} disabled={!newOrderCustomerId || !newOrderJobName.trim() || !newOrderMessage.trim() || isCreatingOrderChat} data-testid="button-start-order-chat">
              {isCreatingOrderChat ? "Creating…" : "Create Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New direct conversation dialog ────────────────────────────────────── */}
      <Dialog open={showNewConvo} onOpenChange={(open) => { setShowNewConvo(open); if (!open) { setNewSubject(""); setNewRecipientId(""); setNewRecipientSearch(""); setNewFirstMessage(""); } }}>
        <DialogContent data-testid="dialog-new-conversation">
          <DialogHeader>
            <DialogTitle>New General Chat</DialogTitle>
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
                const matchedCustomers = customers.filter(c => c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5).map(c => ({ id: c.id, name: c.name, type: "customer" as const }));
                const matchedStaff = messagingUsers.filter(u => u.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5).map(u => ({ id: u.id, name: u.name, type: "staff" as const }));
                const results = [...matchedCustomers, ...matchedStaff];
                if (results.length === 0) return <div className="border rounded-md mt-1 p-3 text-sm text-muted-foreground">No results found</div>;
                return (
                  <div className="border rounded-md mt-1 overflow-hidden max-h-48 overflow-y-auto" data-testid="list-convo-recipients">
                    {results.map(r => (
                      <button key={`${r.type}-${r.id}`} type="button" className="w-full text-left px-3 py-2 text-sm hover-elevate flex items-center gap-2" onClick={() => { setNewRecipientId(r.id); setNewRecipientType(r.type); setNewRecipientSearch(r.name); }} data-testid={`option-recipient-${r.id}`}>
                        <span className="flex-1">{r.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${r.type === "staff" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>{r.type === "staff" ? "Staff" : "Customer"}</span>
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
              <Input placeholder="e.g. Delivery update for order #123" value={newSubject} onChange={e => setNewSubject(e.target.value)} data-testid="input-convo-subject" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">First message (optional)</label>
              <Textarea placeholder="Type your opening message…" autoResize value={newFirstMessage} onChange={e => setNewFirstMessage(e.target.value)} data-testid="input-convo-first-message" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewConvo(false)}>Cancel</Button>
            <Button onClick={() => createConvoMutation.mutate()} disabled={!newSubject.trim() || !newRecipientId || createConvoMutation.isPending} data-testid="button-create-conversation">
              {createConvoMutation.isPending ? "Creating…" : "Start Conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert message to task */}
      <Dialog open={taskFromMsg !== null} onOpenChange={(open) => { if (!open) { setTaskFromMsg(null); setTaskTitle(""); setTaskPriority("medium"); setTaskAssignee(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Task from Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {taskFromMsg?.messageText && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 italic line-clamp-3">
                "{taskFromMsg.messageText}"
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="task-from-msg-title">Title</Label>
              <Input
                id="task-from-msg-title"
                placeholder="What needs to be done?"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                autoFocus
                data-testid="input-task-from-msg-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-from-msg-assignee">Assign to</Label>
              <select
                id="task-from-msg-assignee"
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="select-task-from-msg-assignee"
              >
                <option value="">Unassigned</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-from-msg-priority">Priority</Label>
              <select
                id="task-from-msg-priority"
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="select-task-from-msg-priority"
              >
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTaskFromMsg(null); setTaskTitle(""); setTaskPriority("medium"); setTaskAssignee(""); }}>Cancel</Button>
            <Button
              onClick={() => createTaskFromMsgMutation.mutate()}
              disabled={!taskTitle.trim() || createTaskFromMsgMutation.isPending}
              data-testid="button-save-task-from-msg"
            >
              {createTaskFromMsgMutation.isPending ? "Creating…" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConvoRow({ isActive, title, subtitle, unread, latest, senderLabel, onClick, testId, hasReminder }: {
  isActive: boolean;
  title: string;
  subtitle: string;
  unread: number;
  latest: { message: string; senderType: string; createdAt: string } | null;
  senderLabel: string;
  onClick: () => void;
  testId: string;
  hasReminder?: boolean;
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
            {hasReminder && <Clock className="h-3 w-3 text-primary/70" />}
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

type ArchivedSectionProps = {
  conversations: Array<{ jobId: string; jobName: string; customerName: string; unreadCount: number; latestMessage: { message: string; senderType: "customer" | "staff"; createdAt: string } | null }>;
  selected: { type: string; jobId?: string } | null;
  onSelect: (jobId: string) => void;
  onUnarchive: (jobId: string) => void;
  expanded?: boolean;
  onToggle?: () => void;
};

function ArchivedSection({ conversations, selected, onSelect, onUnarchive, expanded: expandedProp, onToggle }: ArchivedSectionProps) {
  const [expandedLocal, setExpandedLocal] = useState(false);
  const expanded = expandedProp ?? expandedLocal;
  const setExpanded = (v: boolean | ((p: boolean) => boolean)) => onToggle ? onToggle() : setExpandedLocal(v);
  return (
    <div className="border-t bg-muted/20">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover-elevate"
        data-testid="button-toggle-archived"
      >
        <Archive className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Archived Chats</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{conversations.length}</Badge>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t divide-y divide-border/40">
          {conversations.map(c => (
            <div
              key={c.jobId}
              className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover-elevate ${selected?.type === "job" && selected.jobId === c.jobId ? "bg-primary/8" : ""}`}
              onClick={() => onSelect(c.jobId)}
              data-testid={`archived-convo-${c.jobId}`}
            >
              <Package className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-muted-foreground">{c.jobName}</p>
                <p className="text-[10px] text-muted-foreground/60 truncate"><DemoText>{c.customerName}</DemoText></p>
              </div>
              {c.unreadCount > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{c.unreadCount}</Badge>
              )}
              <button
                type="button"
                title="Restore to active chats"
                onClick={e => { e.stopPropagation(); onUnarchive(c.jobId); }}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground border border-border/60 hover-elevate"
                data-testid={`button-unarchive-${c.jobId}`}
              >
                <ArchiveX className="h-3 w-3" />
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ArchivedDirectSectionProps = {
  conversations: DirectConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUnarchive: (id: string) => void;
};

function ArchivedDirectSection({ conversations, selectedId, onSelect, onUnarchive }: ArchivedDirectSectionProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-t bg-muted/20">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover-elevate"
        data-testid="button-toggle-archived-direct"
      >
        <Archive className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Archived Chats</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{conversations.length}</Badge>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t divide-y divide-border/40">
          {conversations.map(c => (
            <div
              key={c.id}
              className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover-elevate ${selectedId === c.id ? "bg-primary/8" : ""}`}
              onClick={() => onSelect(c.id)}
              data-testid={`archived-direct-convo-${c.id}`}
            >
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-muted-foreground"><DemoText>{c.customerName}</DemoText></p>
                <p className="text-[10px] text-muted-foreground/60 truncate">{c.subject}</p>
              </div>
              {c.unreadCount > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{c.unreadCount}</Badge>
              )}
              <button
                type="button"
                title="Restore to active chats"
                onClick={e => { e.stopPropagation(); onUnarchive(c.id); }}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground border border-border/60 hover-elevate"
                data-testid={`button-unarchive-direct-${c.id}`}
              >
                <ArchiveX className="h-3 w-3" />
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DropZone({ onFiles, onBrowse }: { onFiles: (files: File[]) => void; onBrowse: () => void }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onBrowse}
      data-testid="dropzone-attachments"
      className={`border-2 border-dashed rounded-lg px-4 py-5 flex flex-col items-center gap-2 cursor-pointer transition-colors select-none
        ${isDragging
          ? "border-primary bg-primary/5 text-primary"
          : "border-border hover:border-primary/50 hover:bg-muted/40 text-muted-foreground"
        }`}
    >
      <Upload className={`h-6 w-6 transition-colors pointer-events-none ${isDragging ? "text-primary" : "text-muted-foreground/60"}`} />
      <div className="text-center pointer-events-none">
        <p className="text-sm font-medium">
          {isDragging ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="text-xs mt-0.5">or <span className="text-primary underline underline-offset-2">click to browse</span></p>
      </div>
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext)) {
    return <Image className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
  }
  if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) {
    return <Film className="h-3.5 w-3.5 text-purple-500 shrink-0" />;
  }
  return <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}
