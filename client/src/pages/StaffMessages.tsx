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
  EyeOff,
  Eye,
  ImagePlus,
  Pin,
  Lock,
  Camera,
  User,
  Upload,
  FileText,
  Image,
  Film,
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
  const [chatImages, setChatImages] = useState<{ key: string; preview: string }[]>([]);
  const [isUploadingChatImage, setIsUploadingChatImage] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [pendingProfileCropFile, setPendingProfileCropFile] = useState<File | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: currentUser, refetch: refetchMe } = useQuery<CurrentUser>({
    queryKey: ["/api/staff/me"],
  });

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
    const images = [...chatImages];
    const text = newMessage.trim();
    if ((!text && images.length === 0) || !selected) return;
    setNewMessage("");
    setChatImages([]);
    images.forEach(img => URL.revokeObjectURL(img.preview));
    if (images.length === 0) {
      const payload = { message: text, isInternal };
      if (selected.type === "job") sendJobMessageMutation.mutate(payload);
      else sendDirectMessageMutation.mutate(payload);
    } else {
      for (let i = 0; i < images.length; i++) {
        const payload = { message: i === 0 ? (text || " ") : " ", imageUrl: images[i].key, isInternal };
        try {
          if (selected.type === "job") await sendJobMessageMutation.mutateAsync(payload);
          else await sendDirectMessageMutation.mutateAsync(payload);
        } catch { break; }
      }
    }
  };

  const handleChatImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsUploadingChatImage(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        const uploadRes = await apiRequest("POST", "/api/staff/objects/upload", {});
        const { url, key } = await uploadRes.json();
        await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
        const normalizedKey = `/api/img${key.replace("/objects", "")}`;
        return { key: normalizedKey, preview: previewUrl };
      }));
      setChatImages(prev => [...prev, ...uploaded]);
    } catch {
      toast({ title: "Failed to upload image(s)", variant: "destructive" });
    } finally {
      setIsUploadingChatImage(false);
      if (chatImageInputRef.current) chatImageInputRef.current.value = "";
    }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    if (group.jobs.length === 1) {
      setSelected({ type: "job", jobId: group.jobs[0].jobId });
    } else {
      setDrillCustomerId(group.customerId);
      setLeftView("jobs");
    }
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
        <div className="px-3 py-2 border-b">
          {tab === "job" ? (
            <Button size="sm" className="w-full" onClick={() => setShowNewOrderChat(true)} data-testid="button-new-order-chat">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Order Chat
            </Button>
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
              <EmptyState label="No job conversations yet" sublabel="Customer messages will appear here" />
            ) : leftView === "jobs" && drilledGroup ? (
              // ── Job picker for a specific customer ─────────────────────────
              <div className="flex flex-col h-full">
                <button
                  onClick={handleBackToTiles}
                  className="flex items-center gap-2 px-3 py-2.5 border-b text-xs text-muted-foreground hover-elevate bg-muted/30 w-full text-left"
                  data-testid="button-back-to-tiles"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <div className={`h-5 w-5 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-white text-[10px] font-bold ${customerColor(drilledGroup.customerId)}`}>
                    {drilledGroup.customerLogoUrl
                      ? <img src={drilledGroup.customerLogoUrl} alt={drilledGroup.customerName} className="h-full w-full object-cover" />
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
                            <div className={`h-12 w-12 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm shrink-0 ${customerColor(group.customerId)}`}>
                              {group.customerLogoUrl
                                ? <img src={group.customerLogoUrl} alt={group.customerName} className="h-full w-full object-cover" />
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
                  <div key={msg.id} className={`flex items-end gap-2.5 ${isStaff ? "flex-row-reverse" : "flex-row"}`} data-testid={`message-${msg.id}`}>
                    {/* Avatar */}
                    <div className={`h-8 w-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center border-2 border-background ${showAvatar ? "opacity-100" : "opacity-0 pointer-events-none"} ${isStaff ? "bg-blue-500" : "bg-orange-400"}`}>
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
                    {/* Bubble */}
                    <div className={`max-w-[72%] ${isStaff ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {showAvatar && msg.senderName && (
                        <p className={`text-[10px] font-semibold px-1 ${isStaff ? "text-right text-muted-foreground" : "text-muted-foreground"}`}>
                          {msg.senderName}
                          {msg.isInternal && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                              <Lock className="h-2.5 w-2.5" /> Team only
                            </span>
                          )}
                        </p>
                      )}
                      <div className={`rounded-2xl px-4 py-2.5 ${
                        msg.isInternal
                          ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50 text-foreground rounded-br-sm"
                          : isStaff
                            ? "bg-blue-500 text-white rounded-br-sm"
                            : "bg-orange-400 text-white rounded-bl-sm"
                      }`}>
                        {msg.message.trim() && (
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.message}</p>
                        )}
                        {msg.imageUrl && (
                          <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                            <img src={msg.imageUrl} alt="Sample" className="max-w-full rounded-lg max-h-48 object-contain hover:opacity-90 transition-opacity" />
                          </a>
                        )}
                        <div className={`flex items-center gap-1.5 mt-1 ${isStaff ? "justify-end" : ""}`}>
                          {msg.isInternal && <Lock className={`h-2.5 w-2.5 ${msg.isInternal ? "text-amber-600 dark:text-amber-400" : ""}`} />}
                          <p className={`text-[10px] ${msg.isInternal ? "text-amber-600/70 dark:text-amber-400/70" : "text-white/70"}`}>
                            {format(new Date(msg.createdAt), "d MMM, h:mm a")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose area */}
          <div className="border-t p-3 bg-card/40">
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
            {/* Image preview */}
            {(chatImages.length > 0 || isUploadingChatImage) && (
              <div className="mb-2 flex items-start gap-2 flex-wrap">
                {chatImages.map((img, i) => (
                  <div key={img.key} className="relative">
                    <img src={img.preview} alt="Preview" className="h-16 w-16 rounded-md object-cover border border-border" />
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
            <input ref={chatImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleChatImageSelect} data-testid="input-chat-image-file" />
            <div className={`flex gap-2 items-end ${isInternal ? "opacity-100" : ""}`}>
              <Button
                variant="outline"
                size="icon"
                type="button"
                onClick={() => chatImageInputRef.current?.click()}
                disabled={isUploadingChatImage}
                data-testid="button-attach-chat-image"
                title="Attach image"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Textarea
                placeholder={isInternal ? "Internal note (staff only)…" : "Reply… (Enter to send, Shift+Enter for new line)"}
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className={`resize-none text-sm ${isInternal ? "border-amber-300 focus-visible:ring-amber-400 dark:border-amber-700" : ""}`}
                data-testid="input-staff-message"
              />
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

      {/* ── New order chat dialog ──────────────────────────────────────────── */}
      <Dialog open={showNewOrderChat} onOpenChange={(open) => { setShowNewOrderChat(open); if (!open) resetOrderChatForm(); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-new-order-chat">
          <DialogHeader>
            <DialogTitle>New Order Chat</DialogTitle>
          </DialogHeader>
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
              {isCreatingOrderChat ? "Creating…" : "Start Chat"}
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
