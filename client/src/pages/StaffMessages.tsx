import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ImageCropDialog } from "@/components/ImageCropDialog";

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
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("job");
  const [selected, setSelected] = useState<Selected>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCustomerMsgCount = useRef(0);
  const isInitialLoad = useRef(true);

  // Left panel navigation
  const [leftView, setLeftView] = useState<LeftView>("tiles");
  const [drillCustomerId, setDrillCustomerId] = useState<string | null>(null);

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
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
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
    refetchInterval: 15000,
  });
  const jobConversations = allJobConversations.filter(c => !c.isArchivedByStaff);
  const archivedConversations = allJobConversations.filter(c => c.isArchivedByStaff);

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
  const currentCustomerId = selected?.type === "job" ? selectedJobConvo?.customerId : selectedDirectConvo?.customerId;
  const currentCustomerLogo = customers.find(c => c.id === currentCustomerId)?.logoUrl ?? null;

  // Auto-select first conversation per tab on load
  useEffect(() => {
    if (tab === "direct" && directConversations.length > 0 && !directId) {
      setSelected({ type: "direct", conversationId: directConversations[0].id });
    }
  }, [tab, directConversations, directId]);

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
      await apiRequest("PATCH", `/api/staff/direct-conversations/${id}`, { status: "archived" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/direct-conversations"] });
      setSelected(null);
    },
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
        const uploadRes = await apiRequest("POST", "/api/staff/objects/upload", {});
        const { url, key } = await uploadRes.json();
        await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        const normalizedKey = `/api/img${key.replace("/objects", "")}`;
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

  const handleComposeDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setIsDraggingOverCompose(true);
  };

  const handleComposeDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOverCompose(false);
    }
  };

  const handleComposeDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverCompose(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) await uploadFiles(files);
  };

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
      const normalizedKey = `/api/img${key.replace("/objects", "")}`;
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

  const filteredMentions = staffList
    .filter(s => !mentionSearch || s.name.toLowerCase().includes(mentionSearch))
    .slice(0, 6);

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

  const jobUnread = jobConversations.reduce((s, c) => s + c.unreadCount, 0);
  const directUnread = directConversations.reduce((s, c) => s + c.unreadCount, 0);

  // Build customer groups for tile grid
  const visibleConvos = showHidden ? jobConversations : jobConversations.filter(c => !hiddenJobIds.has(c.jobId));
  const hiddenCount = jobConversations.filter(c => hiddenJobIds.has(c.jobId)).length;
  const customerGroups = new Map<string, { customerId: string; customerName: string; customerLogoUrl: string | null; jobs: JobConversation[] }>();
  visibleConvos.forEach(c => {
    if (!customerGroups.has(c.customerId)) {
      customerGroups.set(c.customerId, { customerId: c.customerId, customerName: c.customerName, customerLogoUrl: c.customerLogoUrl, jobs: [] });
    }
    customerGroups.get(c.customerId)!.jobs.push(c);
  });
  const sortedGroups = Array.from(customerGroups.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));

  const drilledGroup = drillCustomerId ? customerGroups.get(drillCustomerId) : null;

  const handleCustomerTileClick = (group: { customerId: string; customerName: string; customerLogoUrl: string | null; jobs: JobConversation[] }) => {
    // Always drill into the job list so staff always see which job they're opening
    setDrillCustomerId(group.customerId);
    setLeftView("jobs");
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
            ) : jobConversations.length === 0 ? (
              <div className="flex flex-col h-full">
                <EmptyState label="No active job conversations" sublabel="Customer messages will appear here" />
                {archivedConversations.length > 0 && (
                  <ArchivedSection
                    conversations={archivedConversations}
                    selected={selected}
                    onSelect={(jId) => setSelected({ type: "job", jobId: jId })}
                    onUnarchive={(jId) => archiveConvoJobMutation.mutate({ jobId: jId, archive: false })}
                  />
                )}
              </div>
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
                  <span className="font-semibold text-foreground">{drilledGroup.customerName}</span>
                </button>
                <div className="flex-1 overflow-y-auto">
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
                                {c.unreadCount > 0 && (
                                  <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{c.unreadCount}</Badge>
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
                </div>
              </div>
            ) : (
              // ── Customer tile grid ─────────────────────────────────────────
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-3">
                  {sortedGroups.length === 0 ? (
                    <EmptyState label="All conversations are hidden" />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {sortedGroups.map(group => {
                        const groupUnread = group.jobs.reduce((s, j) => s + j.unreadCount, 0);
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
                              isSelectedCustomer ? "border-primary bg-primary/5" : "border-border bg-card"
                            }`}
                            data-testid={`customer-tile-${group.customerId}`}
                          >
                            {groupUnread > 0 && (
                              <Badge
                                variant="destructive"
                                className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 text-[10px] z-10"
                              >
                                {groupUnread}
                              </Badge>
                            )}
                            <div className={`h-12 w-12 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm shrink-0 ${group.customerLogoUrl ? "bg-transparent" : customerColor(group.customerId)}`}>
                              {group.customerLogoUrl
                                ? <img src={group.customerLogoUrl} alt={group.customerName} className="h-full w-full object-contain" />
                                : getInitials(group.customerName)
                              }
                            </div>
                            <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{group.customerName}</p>
                            <div className="flex items-center gap-1">
                              <Package className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">{group.jobs.length} job{group.jobs.length !== 1 ? "s" : ""}</span>
                            </div>
                            {lastMsg && (
                              <p className="text-[10px] text-muted-foreground">{formatConvoTime(lastMsg.createdAt)}</p>
                            )}
                          </button>
                        );
                      })}
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
                    {showHidden ? "Hide archived" : `Show ${hiddenCount} archived`}
                  </button>
                )}
                {archivedConversations.length > 0 && (
                  <ArchivedSection
                    conversations={archivedConversations}
                    selected={selected}
                    onSelect={(jId) => setSelected({ type: "job", jobId: jId })}
                    onUnarchive={(jId) => archiveConvoJobMutation.mutate({ jobId: jId, archive: false })}
                  />
                )}
              </div>
            )
          ) : (
            // ── Direct messages list ─────────────────────────────────────────
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

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat header */}
          <div className="px-4 py-3 border-b bg-card/40 flex items-center gap-3">
            <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setSelected(null)}>
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
                  <p className="text-xs text-muted-foreground">{selectedJobConvo?.customerName}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLocation(`/staff/job/${selectedJobConvo?.jobId}`)} data-testid="button-view-job">
                  View Job
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={selectedJobConvo?.isArchivedByStaff ? "Unarchive conversation" : "Archive conversation"}
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
                  {selectedJobConvo?.isArchivedByStaff ? <ArchiveX className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
              </>
            ) : (
              <>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedDirectConvo?.subject}</p>
                  <p className="text-xs text-muted-foreground">{selectedDirectConvo?.customerName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => archiveConvoMutation.mutate(selectedDirectConvo!.id)}
                  data-testid="button-archive-convo"
                >
                  <Archive className="h-4 w-4" />
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
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-3">
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
                    {/* Action buttons — edit + unsend, staff messages only, visible on hover */}
                    {isStaff && selected?.type === "job" && !(msg as any).deleted && editingMsgId !== msg.id && (
                      <div className="invisible group-hover/msg:visible flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          title="Edit message"
                          onClick={() => { setEditingMsgId(msg.id); setEditingText(msg.message || ""); }}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          data-testid={`button-edit-msg-${msg.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Unsend"
                          onClick={() => unsendMessageMutation.mutate(msg.id)}
                          disabled={unsendMessageMutation.isPending}
                          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          data-testid={`button-unsend-${msg.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {/* Avatar + name below */}
                    <div className={`flex flex-col items-center gap-0.5 shrink-0 ${showAvatar ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                      <div className={`h-8 w-8 rounded-full overflow-hidden flex items-center justify-center border-2 border-background ${isStaff ? "bg-blue-500" : "bg-orange-400"}`}>
                        {isStaff && msg.senderImageUrl ? (
                          <img src={msg.senderImageUrl} alt={msg.senderName || ""} className="h-full w-full object-cover" />
                        ) : !isStaff && currentCustomerLogo ? (
                          <img src={currentCustomerLogo} alt={msg.senderName || ""} className="h-full w-full object-cover" />
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
                    <div className={`max-w-[72%] ${isStaff ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
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
                          <div className="flex flex-col gap-2 min-w-[200px]">
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
                          return (
                            <>
                              {displayText && (
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderMessageContent(displayText)}</p>
                              )}
                              {fileMatches.map((f, fi) => (
                                <a
                                  key={fi}
                                  href={f.url}
                                  target="_blank"
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
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose area */}
          <div
            className={`border-t p-3 bg-card/40 relative transition-colors ${isDraggingOverCompose ? "bg-primary/5 border-primary" : ""}`}
            onDragOver={handleComposeDragOver}
            onDragEnter={handleComposeDragOver}
            onDragLeave={handleComposeDragLeave}
            onDrop={handleComposeDrop}
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
                        <span className="text-xs text-muted-foreground ml-auto">@{s.name.split(" ")[0]}</span>
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
                  rows={2}
                  className={`resize-none text-sm w-full ${isInternal ? "border-amber-300 focus-visible:ring-amber-400 dark:border-amber-700" : ""}`}
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
                  rows={3}
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
                <Textarea placeholder="Type your opening message…" rows={3} value={newOrderMessage} onChange={e => setNewOrderMessage(e.target.value)} data-testid="input-order-chat-message" />
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
              <Textarea placeholder="Type your opening message…" rows={3} value={newFirstMessage} onChange={e => setNewFirstMessage(e.target.value)} data-testid="input-convo-first-message" />
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

type ArchivedSectionProps = {
  conversations: Array<{ jobId: string; jobName: string; customerName: string; unreadCount: number; latestMessage: { message: string; senderType: "customer" | "staff"; createdAt: string } | null }>;
  selected: { type: string; jobId?: string } | null;
  onSelect: (jobId: string) => void;
  onUnarchive: (jobId: string) => void;
};

function ArchivedSection({ conversations, selected, onSelect, onUnarchive }: ArchivedSectionProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-t">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground hover-elevate"
        data-testid="button-toggle-archived"
      >
        <Archive className="h-3 w-3" />
        {expanded ? "Hide archived" : `Show ${conversations.length} archived`}
      </button>
      {expanded && (
        <div className="border-t divide-y">
          {conversations.map(c => (
            <div
              key={c.jobId}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover-elevate ${selected?.type === "job" && selected.jobId === c.jobId ? "bg-accent" : ""}`}
              onClick={() => onSelect(c.jobId)}
              data-testid={`archived-convo-${c.jobId}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-muted-foreground">{c.jobName}</p>
                <p className="text-[10px] text-muted-foreground/60 truncate">{c.customerName}</p>
              </div>
              {c.unreadCount > 0 && (
                <span className="text-[10px] font-bold text-blue-500">{c.unreadCount}</span>
              )}
              <button
                type="button"
                title="Unarchive"
                onClick={e => { e.stopPropagation(); onUnarchive(c.jobId); }}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                data-testid={`button-unarchive-${c.jobId}`}
              >
                <ArchiveX className="h-3.5 w-3.5" />
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
      <Upload className={`h-6 w-6 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground/60"}`} />
      <div className="text-center">
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
