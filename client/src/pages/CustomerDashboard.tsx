import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { LogOut, Package, Clock, CheckCircle2, AlertCircle, Plus, FileText, Search, ArrowUpDown, ArrowUp, ArrowDown, Key, MessageSquare, Users, Receipt, Menu, PoundSterling, CreditCard, ShoppingCart, Phone, Mail, MessageCircle, Headphones, Lightbulb, MapPin } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import sbsLogo from "@assets/logo_transparent.png";
import { Checkbox } from "@/components/ui/checkbox";
import { PricingTableDialog } from "@/components/PricingTableDialog";
import { FeatureRequestDialog } from "@/components/FeatureRequestDialog";
import { MobileInstallBanner } from "@/components/MobileInstallBanner";
import { AppDownloadModal } from "@/components/AppDownloadModal";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { format, isPast, isToday, formatDistanceToNow } from "date-fns";
import { getMachineName } from "@shared/machines";
import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const CONTACT = {
  phone: "0113 2552694",
  phoneTel: "tel:01132552694",
  email: "info@selectbranding.co.uk",
  whatsapp: "https://wa.me/441132552694",
} as const;

type WelcomeCard = { emoji: string; greeting: string; fact: string };

function getWelcomeCard(firstName: string | null | undefined): WelcomeCard {
  const name = firstName || "there";
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);

  if (isWeekend) {
    const opts: WelcomeCard[] = [
      { emoji: "🌿", greeting: `Hi ${name}`, fact: "Working on a weekend? We're pleased to see you — but don't forget weekends are for enjoying yourself!" },
      { emoji: "☕", greeting: `Hey ${name}`, fact: "Even the best take a breather on weekends. We hope you're getting some rest too!" },
      { emoji: "🌤️", greeting: `Hi ${name}`, fact: "Dedication at its finest! Just make sure you switch off and recharge this weekend." },
    ];
    return opts[dayOfYear % opts.length];
  }

  if (hour < 8) {
    const opts: WelcomeCard[] = [
      { emoji: "🌅", greeting: `Morning ${name}`, fact: "The early bird certainly does catch the worm! You're ahead of the pack today." },
      { emoji: "☀️", greeting: `Up bright and early, ${name}`, fact: "We admire the dedication — the day is yours!" },
      { emoji: "🐓", greeting: `Good morning ${name}`, fact: "A group of roosters is called a roost. And they wake up even earlier than you!" },
    ];
    return opts[dayOfYear % opts.length];
  }

  if (hour >= 20) {
    const opts: WelcomeCard[] = [
      { emoji: "🌙", greeting: `Hi ${name}`, fact: "Working late? The moon is your colleague tonight — don't burn the candle at both ends!" },
      { emoji: "🦉", greeting: `Evening ${name}`, fact: "A group of owls is called a parliament. Wise creatures — even they know when to rest!" },
      { emoji: "⭐", greeting: `Hi ${name}`, fact: "Burning the midnight oil? Make sure you clock off soon — even stars need to rest." },
    ];
    return opts[dayOfYear % opts.length];
  }

  // Normal working hours — rotating fun facts
  const opts: WelcomeCard[] = [
    { emoji: "🦩", greeting: `Hi ${name}`, fact: "A group of flamingos is called a flamboyance. A group of owls is a parliament. A group of cats is a clowder. English is wonderful." },
    { emoji: "🐝", greeting: `Hi ${name}`, fact: "Honey bees can visit up to 2,000 flowers in a single day. That's dedication to quality we can relate to!" },
    { emoji: "🐬", greeting: `Hi ${name}`, fact: "Dolphins have names for each other — they use unique whistle sounds to call their friends. How polite!" },
    { emoji: "🦋", greeting: `Hi ${name}`, fact: "A group of butterflies is called a kaleidoscope. A group of jellyfish is a smack. Language is a delight." },
    { emoji: "🐘", greeting: `Hi ${name}`, fact: "Elephants are one of the few animals that can recognise themselves in a mirror. Quite the self-awareness!" },
    { emoji: "🦜", greeting: `Hi ${name}`, fact: "African grey parrots can learn over 1,000 words and understand context. Some are more articulate than most emails!" },
    { emoji: "🦁", greeting: `Hi ${name}`, fact: "A group of lions is called a pride, a group of crows is a murder, and a group of goldfish is a troubling. Quite the vocabulary!" },
    { emoji: "🐙", greeting: `Hi ${name}`, fact: "Octopuses have three hearts, blue blood, and nine brains (one central, one per arm). Remarkable multitaskers." },
    { emoji: "🦓", greeting: `Hi ${name}`, fact: "Every zebra's stripe pattern is unique — like a fingerprint. No two are exactly alike, much like every order we make!" },
    { emoji: "🐧", greeting: `Hi ${name}`, fact: "Penguins propose to their partners with a pebble. If accepted, they stay together for life. Romantic little creatures." },
    { emoji: "🦊", greeting: `Hi ${name}`, fact: "A group of foxes is called a skulk or an earth. A group of ravens is an unkindness. Whoever named these had opinions." },
    { emoji: "🌺", greeting: `Hi ${name}`, fact: "January is named after Janus, the Roman god who looks back at the old year and forward to the new. A natural planner!" },
    { emoji: "🌊", greeting: `Hi ${name}`, fact: "The Pacific Ocean covers more area than all the world's land combined. Puts our to-do list in perspective." },
    { emoji: "🌿", greeting: `Hi ${name}`, fact: "There are more trees on Earth than stars in the Milky Way. Over 3 trillion, in fact. Quite a forest!" },
    { emoji: "🐢", greeting: `Hi ${name}`, fact: "A group of tortoises is called a creep. Slow and steady may not win every race, but it does get the job done." },
    { emoji: "🦒", greeting: `Hi ${name}`, fact: "Giraffes only sleep around 30 minutes a day in short naps. The world's most productive sleepers." },
    { emoji: "🐺", greeting: `Hi ${name}`, fact: "Wolves howl to communicate with their pack across long distances. Basically the original group messaging." },
    { emoji: "🦋", greeting: `Hi ${name}`, fact: "The word 'fortnight' is uniquely British — from 'fourteen nights'. Two weeks, beautifully compressed." },
    { emoji: "🐋", greeting: `Hi ${name}`, fact: "Blue whales have hearts the size of a small car. Each heartbeat can be heard from up to 3km away." },
    { emoji: "🦅", greeting: `Hi ${name}`, fact: "Bald eagles mate for life and return to the same nest each year, adding to it until it can weigh over a tonne!" },
    { emoji: "🌸", greeting: `Hi ${name}`, fact: "Cherry blossom season in Japan lasts only about two weeks. Rare and beautiful things are worth paying attention to." },
  ];
  return opts[dayOfYear % opts.length];
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LineItem = {
  id: string;
  jobId: string;
  jobType: string;
  quantity: number;
  stitchCount: number | null;
  description: string | null;
  machineId: number | null;
  completed: boolean;
  logoApproved: boolean;
  estimatedPrice: number | "POA" | null;
};

type Job = {
  id: string;
  customerId: string;
  jobName: string;
  poNumber: string | null;
  quantity: number;
  goodsReceived: string | null;
  requiredDispatchDate: string | null;
  completed: boolean;
  status: string;
  notes: string | null;
  invoiceStatus: string;
  dhlTrackingNumber: string | null;
  lineItems: LineItem[];
  paymentReceived?: boolean;
  customerRequiresAdvancePayment?: boolean;
};

type CustomerUser = {
  id: string;
  customerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  customerName: string | null;
  customerLogoUrl: string | null;
  customerAddress: string | null;
  lastLoginAt: string | null;
};

function extractUkPostcode(address: string | null | undefined): string | null {
  if (!address) return null;
  const match = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
  return match ? match[1].replace(/\s+/, " ").toUpperCase() : null;
}

function dpdLocalUrl(trackingNumber: string, postcode: string | null): string {
  const base = `https://track.dpd.co.uk/search?reference=${encodeURIComponent(trackingNumber.trim())}`;
  return postcode ? `${base}&postcode=${encodeURIComponent(postcode.trim())}` : base;
}

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isImpersonating } = usePermissions();
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed">("in_progress");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "jobName" | "description" | "quantity" | "status" | "tracking">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc"); // asc = today's orders first
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ success: boolean; message: string; reference?: string } | null>(null);
  const [featureDialogOpen, setFeatureDialogOpen] = useState(false);

  // Inject live chat widget — only on customer portal, cleaned up on unmount
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://beta.leadconnectorhq.com/loader.js";
    script.setAttribute("data-resources-url", "https://beta.leadconnectorhq.com/chat-widget/loader.js");
    script.setAttribute("data-widget-id", "69b2725d6a7fad523c100573");
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
      // Remove any widget elements the loader may have injected
      document.querySelectorAll('[id^="leadconnector"], [class*="leadconnector"], [id^="chat-widget"]').forEach(el => el.remove());
    };
  }, []);

  // Helper to toggle sort on column click
  const handleColumnSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column - default direction based on column type
      setSortBy(column);
      // Date ascending = today first, others ascending = A-Z or smallest first
      setSortDirection(column === "date" ? "asc" : "asc");
    }
  };

  // Render sort indicator
  const SortIndicator = ({ column }: { column: typeof sortBy }) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const changePasswordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return await apiRequest("POST", "/api/customer-auth/change-password", data);
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully",
      });
      setChangePasswordOpen(false);
      changePasswordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  const handleChangePassword = (values: z.infer<typeof changePasswordSchema>) => {
    changePasswordMutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  };

  const { data: customerUser, isLoading: isLoadingUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  // Redirect to customer login if no valid customer session
  useEffect(() => {
    if (!isLoadingUser && !customerUser) {
      setLocation("/customer/login");
    }
  }, [isLoadingUser, customerUser, setLocation]);

  const { data: jobs = [], isLoading: isLoadingJobs } = useQuery<Job[]>({
    queryKey: ["/api/customer-portal/jobs"],
    enabled: !!customerUser,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/customer-portal/messages/unread-count"],
    enabled: !!customerUser,
    refetchInterval: 15000,
  });
  const unreadMessageCount = unreadData?.count ?? 0;

  const customerPostcode = extractUkPostcode(customerUser?.customerAddress);

  // Filter by status and search term, then sort
  const filteredJobs = jobs
    .filter(job => {
      // Status filter - the API already returns only non-pending jobs
      // A job is considered "completed" if either:
      // - job.completed is true, OR
      // - invoiceStatus is 'ready' or 'invoiced' (meaning it's been processed for invoicing)
      // This ensures customer portal matches what staff see in "Completed Orders"
      const isJobCompleted = job.completed || job.invoiceStatus === 'ready' || job.invoiceStatus === 'invoiced';
      
      if (statusFilter === "in_progress") {
        // Show jobs that are not yet completed
        if (isJobCompleted) return false;
      } else if (statusFilter === "completed") {
        // Show only completed jobs
        if (!isJobCompleted) return false;
      }
      // "all" shows everything
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const jobNameMatch = job.jobName.toLowerCase().includes(searchLower);
        const poNumberMatch = (job.poNumber ?? "").toLowerCase().includes(searchLower);
        const descriptionMatch = job.lineItems?.some(item => 
          (item.description ?? "").toLowerCase().includes(searchLower)
        ) || false;
        const notesMatch = (job.notes ?? "").toLowerCase().includes(searchLower);
        
        return jobNameMatch || poNumberMatch || descriptionMatch || notesMatch;
      }
      
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "jobName":
          comparison = a.jobName.localeCompare(b.jobName);
          break;
        
        case "description":
          // Sort by first line item description
          const aDesc = a.lineItems?.[0]?.description || a.lineItems?.[0]?.jobType || "";
          const bDesc = b.lineItems?.[0]?.description || b.lineItems?.[0]?.jobType || "";
          comparison = aDesc.localeCompare(bDesc);
          break;
        
        case "quantity":
          // Sum quantities from line items
          const aQty = a.lineItems?.reduce((sum, item) => sum + item.quantity, 0) || a.quantity;
          const bQty = b.lineItems?.reduce((sum, item) => sum + item.quantity, 0) || b.quantity;
          comparison = aQty - bQty;
          break;
        
        case "status":
          // Sort by completion status, then by urgency
          const getStatusPriority = (job: Job) => {
            if (job.completed) return 3;
            const isOverdue = job.requiredDispatchDate && isPast(new Date(job.requiredDispatchDate)) && !isToday(new Date(job.requiredDispatchDate));
            const isDueToday = job.requiredDispatchDate && isToday(new Date(job.requiredDispatchDate));
            if (isOverdue) return 0;
            if (isDueToday) return 1;
            return 2;
          };
          comparison = getStatusPriority(a) - getStatusPriority(b);
          break;
        
        case "tracking":
          // Sort by tracking number presence and value
          const aTracking = a.dhlTrackingNumber || "";
          const bTracking = b.dhlTrackingNumber || "";
          comparison = aTracking.localeCompare(bTracking);
          break;
        
        case "date":
        default:
          // Sort by dispatch date - ascending means today/soonest first
          if (!a.requiredDispatchDate && !b.requiredDispatchDate) {
            comparison = 0;
          } else if (!a.requiredDispatchDate) {
            comparison = 1; // No date goes to end
          } else if (!b.requiredDispatchDate) {
            comparison = -1;
          } else {
            comparison = new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime();
          }
          break;
      }
      
      // Apply sort direction
      return sortDirection === "desc" ? -comparison : comparison;
    });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/customer-auth/logout", {});
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation("/customer/login");
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const payMutation = useMutation({
    mutationFn: async (lineItemIds: string[]) => {
      const res = await apiRequest("POST", "/api/customer-portal/stripe/pay-jobs", { lineItemIds });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.chargeResult?.success) {
        setPaymentResult({ success: true, message: `Payment of £${data.totalIncVat.toFixed(2)} was successful.`, reference: data.reference });
        setSelectedLineItemIds(new Set());
      } else {
        setPaymentResult({ success: false, message: data.chargeResult?.error || "Payment failed. Please try again." });
      }
    },
    onError: (error: any) => {
      setPaymentResult({ success: false, message: error.message || "Payment failed. Please try again." });
    },
  });

  // Helpers for multi-select payment
  const toggleLineItem = (id: string) => {
    setSelectedLineItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allJobs: Job[] = jobs || [];
  const payableLineItems = filteredJobs.flatMap(j =>
    (j.lineItems || []).filter(li => typeof li.estimatedPrice === "number")
  );

  const allPayableLineItems = allJobs.flatMap(j =>
    (j.lineItems || []).filter(li => typeof li.estimatedPrice === "number")
  );
  const selectedSubtotal = allPayableLineItems
    .filter(li => selectedLineItemIds.has(li.id))
    .reduce((sum, li) => sum + (li.estimatedPrice as number), 0);
  const selectedVat = selectedSubtotal * 0.2;
  const selectedTotal = selectedSubtotal + selectedVat;

  const allPayableSelected = payableLineItems.length > 0 && payableLineItems.every(li => selectedLineItemIds.has(li.id));
  const somePayableSelected = payableLineItems.some(li => selectedLineItemIds.has(li.id));

  const toggleAllPayable = () => {
    if (allPayableSelected) {
      setSelectedLineItemIds(new Set());
    } else {
      setSelectedLineItemIds(new Set(payableLineItems.map(li => li.id)));
    }
  };

  const VAT_RATE = 0.2;
  const EstimatedCostCell = ({ price }: { price: number | "POA" | null | undefined }) => {
    if (price === null || price === undefined) return <span className="text-muted-foreground text-sm">—</span>;
    if (price === "POA") return <span className="text-muted-foreground text-sm">POA</span>;
    const vatAmount = price * VAT_RATE;
    const total = price + vatAmount;
    return (
      <div className="text-right leading-snug">
        <div className="text-xs text-muted-foreground">£{price.toFixed(2)} ex. VAT</div>
        <div className="text-xs text-muted-foreground">+ £{vatAmount.toFixed(2)} VAT</div>
        <div className="font-semibold text-sm">£{total.toFixed(2)}</div>
      </div>
    );
  };

  const getStatusBadge = (job: Job) => {
    // A job is considered "completed" if either:
    // - job.completed is true, OR
    // - invoiceStatus is 'ready' or 'invoiced' (meaning it's been processed for invoicing)
    const isJobCompleted = job.completed || job.invoiceStatus === 'ready' || job.invoiceStatus === 'invoiced';
    
    if (isJobCompleted) {
      return (
        <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    }

    // Awaiting advance payment — not yet in production
    if (job.customerRequiresAdvancePayment && !job.paymentReceived) {
      return (
        <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200">
          <Clock className="h-3 w-3 mr-1" />
          Awaiting Payment
        </Badge>
      );
    }

    const isOverdue = job.requiredDispatchDate && isPast(new Date(job.requiredDispatchDate)) && !isToday(new Date(job.requiredDispatchDate));
    const isDueToday = job.requiredDispatchDate && isToday(new Date(job.requiredDispatchDate));

    if (isOverdue) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Overdue
        </Badge>
      );
    }

    if (isDueToday) {
      return (
        <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
          <Clock className="h-3 w-3 mr-1" />
          Due Today
        </Badge>
      );
    }

    return (
      <Badge variant="secondary">
        <Clock className="h-3 w-3 mr-1" />
        In Progress
      </Badge>
    );
  };

  if (isLoadingUser || isLoadingJobs) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {customerUser && !isImpersonating && <AppDownloadModal userId={customerUser.id} />}

      {/* Impersonation Banner - only shown when staff is viewing as customer */}
      {isImpersonating && customerUser && (
        <ImpersonationBanner customerEmail={customerUser.email} />
      )}
      
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Left: logo or title */}
            <div className="flex items-center gap-3 min-w-0">
              {customerUser?.customerLogoUrl ? (
                <img
                  src={customerUser.customerLogoUrl}
                  alt={customerUser.customerName || "Customer logo"}
                  className="h-24 max-w-[360px] object-contain"
                  data-testid="img-customer-logo"
                />
              ) : (
                <span className="font-bold text-base truncate">Customer Portal</span>
              )}
            </div>

            {/* Desktop nav buttons — hidden on mobile */}
            <div className="hidden md:flex items-center gap-2">
              <PricingTableDialog />
              <Button
                variant="outline"
                onClick={() => setChangePasswordOpen(true)}
                data-testid="button-change-password"
              >
                <Key className="h-4 w-4 mr-2" />
                Change Password
              </Button>
              <Button
                variant="outline"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>

            {/* Mobile hamburger menu */}
            <div className="flex md:hidden items-center gap-2">
              {unreadMessageCount > 0 && (
                <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/messages")} className="relative" data-testid="button-messages-mobile">
                  <MessageSquare className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center font-medium">
                    {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                  </span>
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive animate-ping opacity-75" />
                </Button>
              )}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-menu-mobile">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <SheetHeader className="mb-4">
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setLocation("/customer/messages")} data-testid="menu-messages">
                      <MessageSquare className="h-4 w-4" />
                      Messages
                      {unreadMessageCount > 0 && (
                        <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1 text-xs">{unreadMessageCount}</Badge>
                      )}
                    </Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setLocation("/customer/pending")} data-testid="menu-pending">
                      <FileText className="h-4 w-4" />
                      Pending Submissions
                    </Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setLocation("/customer/documents")} data-testid="menu-documents">
                      <FileText className="h-4 w-4" />
                      Documents
                    </Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setLocation("/customer/invoices")} data-testid="menu-invoices">
                      <Receipt className="h-4 w-4" />
                      Invoices
                    </Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setLocation("/customer/team")} data-testid="menu-team">
                      <Users className="h-4 w-4" />
                      My Team
                    </Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setLocation("/customer/payment-methods")} data-testid="menu-payment-methods">
                      <CreditCard className="h-4 w-4" />
                      Payment Cards
                    </Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setLocation("/customer/delivery-address")} data-testid="menu-delivery-address">
                      <MapPin className="h-4 w-4" />
                      Delivery Address
                    </Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setFeatureDialogOpen(true)} data-testid="menu-suggest-feature">
                      <Lightbulb className="h-4 w-4" />
                      Suggest a Feature
                    </Button>
                    <Separator className="my-2" />
                    <PricingTableDialog />
                    <Button variant="ghost" className="justify-start gap-3 h-11" onClick={() => setChangePasswordOpen(true)} data-testid="menu-change-password">
                      <Key className="h-4 w-4" />
                      Change Password
                    </Button>
                    <Button variant="ghost" className="justify-start gap-3 h-11 text-destructive" onClick={handleLogout} disabled={logoutMutation.isPending} data-testid="menu-logout">
                      <LogOut className="h-4 w-4" />
                      Logout
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 pb-24 md:pb-8">

        {/* Logo hero */}
        <div className="flex justify-center mb-6">
          <img
            src={sbsLogo}
            alt="Select Branding Solutions"
            className="object-contain"
            style={{ maxHeight: "100px", maxWidth: "360px", width: "100%" }}
            data-testid="img-sbs-logo-hero"
          />
        </div>

        {/* Contact Us section */}
        <div className="mb-6">
          <h2 className="text-center text-lg font-semibold mb-3" data-testid="heading-contact-us">Contact Us</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {/* Phone */}
            <a
              href={CONTACT.phoneTel}
              className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2 transition-colors"
              data-testid="contact-phone"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
                <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-xs text-muted-foreground mt-0.5">{CONTACT.phone}</p>
              </div>
            </a>

            {/* Email */}
            <a
              href={`mailto:${CONTACT.email}`}
              className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2 transition-colors"
              data-testid="contact-email"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
                <Mail className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground mt-0.5 break-all">{CONTACT.email}</p>
              </div>
            </a>

            {/* Message via app */}
            <button
              onClick={() => setLocation("/customer/messages")}
              className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2 transition-colors"
              data-testid="contact-message"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Message Us</p>
                <p className="text-xs text-muted-foreground mt-0.5">via the app</p>
              </div>
            </button>

            {/* WhatsApp */}
            <a
              href={CONTACT.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2 transition-colors"
              data-testid="contact-whatsapp"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <SiWhatsapp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">WhatsApp</p>
                <p className="text-xs text-muted-foreground mt-0.5">Chat with us</p>
              </div>
            </a>

            {/* Live Chat */}
            <button
              onClick={() => setLocation("/customer/messages")}
              className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-center hover-elevate active-elevate-2 transition-colors col-span-2 sm:col-span-1"
              data-testid="contact-live-chat"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <Headphones className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Live Chat</p>
                <p className="text-xs text-muted-foreground mt-0.5">We're here to help</p>
              </div>
            </button>
          </div>
        </div>

        {/* Greeting card */}
        {customerUser && (() => {
          const card = getWelcomeCard(customerUser.firstName);
          const lastLogin = customerUser.lastLoginAt ? new Date(customerUser.lastLoginAt) : null;
          return (
            <div className="flex items-start gap-4 rounded-xl bg-muted/50 border border-border p-4 mb-6" data-testid="card-welcome-greeting">
              <span className="text-3xl leading-none mt-0.5 shrink-0" role="img" aria-label="greeting icon">{card.emoji}</span>
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-base leading-tight">{card.greeting}</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{card.fact}</p>
                {lastLogin && (
                  <p className="text-xs text-muted-foreground/70 mt-2" data-testid="text-last-login">
                    Last signed in {formatDistanceToNow(lastLogin, { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        <div className="mb-6 flex flex-col gap-4">
          {/* Desktop action buttons — hidden on mobile (bottom nav handles it) */}
          <div className="hidden md:flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => setLocation("/customer/submit")}
              data-testid="button-submit-job"
            >
              <Plus className="h-4 w-4 mr-2" />
              Submit New Job
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/customer/pending")}
              data-testid="button-view-pending"
            >
              <FileText className="h-4 w-4 mr-2" />
              Pending Submissions
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/customer/documents")}
              data-testid="button-view-documents"
            >
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/customer/messages")}
              data-testid="button-view-messages"
              className="relative"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Messages
              {unreadMessageCount > 0 && (
                <>
                  <Badge
                    variant="destructive"
                    className="ml-1.5 h-5 min-w-5 px-1 text-xs"
                    data-testid="badge-unread-messages"
                  >
                    {unreadMessageCount}
                  </Badge>
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive animate-ping opacity-75" />
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/customer/team")}
              data-testid="button-view-team"
            >
              <Users className="h-4 w-4 mr-2" />
              My Team
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/customer/invoices")}
              data-testid="button-view-invoices"
            >
              <Receipt className="h-4 w-4 mr-2" />
              Invoices
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/customer/payment-methods")}
              data-testid="button-view-payment-methods"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Payment Cards
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/customer/delivery-address")}
              data-testid="button-view-delivery-address"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Delivery Address
            </Button>
            <Button
              variant="outline"
              onClick={() => setFeatureDialogOpen(true)}
              data-testid="button-suggest-feature"
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              Suggest a Feature
            </Button>
          </div>

          {/* Mobile: submit button */}
          <div className="md:hidden">
            <Button
              className="w-full"
              onClick={() => setLocation("/customer/submit")}
              data-testid="button-submit-job-mobile"
            >
              <Plus className="h-4 w-4 mr-2" />
              Submit New Job
            </Button>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Production Queue</h2>
            <p className="text-sm text-muted-foreground">
              View the status and progress of your orders in production
            </p>
          </div>

          {/* Search and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
              {/* Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>

              {/* Sort Dropdown */}
              <Select value={sortBy} onValueChange={(value: any) => {
                setSortBy(value);
                // Reset direction based on column type
                setSortDirection(value === "date" ? "asc" : "asc");
              }}>
                <SelectTrigger className="w-full sm:w-48" data-testid="select-sort">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date" data-testid="sort-date">Production Date</SelectItem>
                  <SelectItem value="jobName" data-testid="sort-jobname">Job Name</SelectItem>
                  <SelectItem value="description" data-testid="sort-description">Item Description</SelectItem>
                  <SelectItem value="quantity" data-testid="sort-quantity">Quantity</SelectItem>
                  <SelectItem value="status" data-testid="sort-status">Status</SelectItem>
                  <SelectItem value="tracking" data-testid="sort-tracking">Tracking</SelectItem>
                </SelectContent>
              </Select>
              {/* Sort Direction Toggle */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
                title={sortDirection === "asc" ? "Ascending (earliest first)" : "Descending (latest first)"}
                data-testid="button-toggle-sort-direction"
              >
                {sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
            
            {/* Status Tabs */}
            <Tabs value={statusFilter} onValueChange={(value) => { setStatusFilter(value as any); setSelectedLineItemIds(new Set()); }}>
              <TabsList data-testid="tabs-status-filter">
                <TabsTrigger value="in_progress" data-testid="tab-in-progress">
                  In Progress
                </TabsTrigger>
                <TabsTrigger value="completed" data-testid="tab-completed">
                  Completed
                </TabsTrigger>
                <TabsTrigger value="all" data-testid="tab-all">
                  All Orders
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Payment required notice — shown when any visible jobs are awaiting payment */}
        {(() => {
          const awaitingJobs = (statusFilter === "completed" ? [] : allJobs).filter(
            j => j.customerRequiresAdvancePayment && !j.paymentReceived &&
                 !j.completed && j.invoiceStatus !== 'ready' && j.invoiceStatus !== 'invoiced'
          );
          if (awaitingJobs.length === 0) return null;
          const awaitingLineItems = awaitingJobs.flatMap(j => j.lineItems || []);
          const totalEx = awaitingLineItems.reduce((s, li) => s + (typeof li.estimatedPrice === "number" ? li.estimatedPrice : 0), 0);
          const totalVat = totalEx * 0.2;
          const totalInc = totalEx + totalVat;
          return (
            <div className="mb-4 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-orange-900 dark:text-orange-100 text-sm">
                    Payment required before production begins
                  </p>
                  <p className="text-xs text-orange-800 dark:text-orange-200 mt-0.5">
                    {awaitingJobs.length} order{awaitingJobs.length !== 1 ? 's' : ''} ({awaitingJobs.map(j => j.jobName).join(', ')}) {awaitingJobs.length !== 1 ? 'are' : 'is'} on hold pending advance payment by BACS.
                    Once payment is received and confirmed, production will be scheduled.
                  </p>
                  <div className="mt-2 text-xs text-orange-800 dark:text-orange-200 space-y-0.5">
                    <p className="font-semibold">BACS Payment Details:</p>
                    <p>Account name: <span className="font-medium">Select Branding Solutions Ltd</span></p>
                    <p>Sort code: <span className="font-medium">04-06-05</span></p>
                    <p>Account number: <span className="font-medium">30422879</span></p>
                    <p className="mt-1 text-orange-700 dark:text-orange-300">Please use your company name as the payment reference.</p>
                  </div>
                </div>
                {totalEx > 0 && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-orange-700 dark:text-orange-300">£{totalEx.toFixed(2)} ex. VAT</p>
                    <p className="text-xs text-orange-700 dark:text-orange-300">+ £{totalVat.toFixed(2)} VAT</p>
                    <p className="font-bold text-orange-900 dark:text-orange-100 text-sm">£{totalInc.toFixed(2)} total due</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {jobs.length === 0 ? "No orders found" : `No ${statusFilter.replace('_', ' ')} orders`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile Card Layout - Hidden on md and above */}
            <div className="md:hidden space-y-4">
              {filteredJobs.map((job) => {
                const lineItems = job.lineItems || [];
                
                return (
                  <Card key={job.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{job.jobName}</CardTitle>
                      {job.poNumber && (
                        <p className="text-sm text-muted-foreground">PO: {job.poNumber}</p>
                      )}
                      {job.notes && (
                        <p className="text-sm text-muted-foreground mt-1">Note: {job.notes}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {getStatusBadge(job)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Job-level info */}
                      <div className="pb-3 border-b">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Production Date</p>
                          <p className="text-sm font-medium">
                            {job.requiredDispatchDate
                              ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                              : "Not set"}
                          </p>
                        </div>
                      </div>

                      {/* Tracking Info for Completed Jobs */}
                      {job.completed && job.dhlTrackingNumber && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-1">DPD Local Tracking Number</p>
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={dpdLocalUrl(job.dhlTrackingNumber, customerPostcode)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono font-semibold text-primary hover:underline"
                              data-testid={`link-tracking-mobile-${job.id}`}
                            >
                              {job.dhlTrackingNumber}
                            </a>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(job.dhlTrackingNumber || "");
                                toast({
                                  title: "Copied!",
                                  description: "Tracking number copied to clipboard",
                                });
                              }}
                              data-testid={`button-copy-tracking-${job.id}`}
                            >
                              <span className="text-xs">Copy</span>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Line Items */}
                      {lineItems.length > 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold">Line Items:</p>
                          {lineItems.map((lineItem, index) => (
                            <div key={lineItem.id} className="bg-muted/50 rounded-lg p-3">
                              <div className="flex items-start gap-3">
                                {typeof lineItem.estimatedPrice === "number" && (
                                  <Checkbox
                                    checked={selectedLineItemIds.has(lineItem.id)}
                                    onCheckedChange={() => toggleLineItem(lineItem.id)}
                                    data-testid={`checkbox-mobile-lineitem-${lineItem.id}`}
                                    className="mt-0.5 shrink-0"
                                  />
                                )}
                                <div className="flex items-start justify-between gap-2 flex-1">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{lineItem.jobType}</p>
                                    {lineItem.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {lineItem.description}
                                      </p>
                                    )}
                                    {lineItem.stitchCount ? (
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {lineItem.stitchCount.toLocaleString()} stitches
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-semibold mb-1">Qty: {lineItem.quantity}</p>
                                    <EstimatedCostCell price={lineItem.estimatedPrice} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          <p className="text-[11px] text-muted-foreground">
                            Estimated costs include VAT and are based on the quantity and stitch count provided. Final invoice may differ if these change. Carriage is charged separately.
                          </p>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Quantity: {job.quantity}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Desktop Table Layout - Hidden on mobile, shown on md and above */}
            <Card className="hidden md:block">
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" data-testid="header-select">
                      {payableLineItems.length > 0 && (
                        <Checkbox
                          checked={allPayableSelected}
                          onCheckedChange={toggleAllPayable}
                          data-testid="checkbox-select-all"
                          aria-label="Select all payable items"
                          className={somePayableSelected && !allPayableSelected ? "opacity-50" : ""}
                        />
                      )}
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleColumnSort("jobName")}
                      data-testid="header-jobname"
                    >
                      <div className="flex items-center">
                        Job Name
                        <SortIndicator column="jobName" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleColumnSort("description")}
                      data-testid="header-description"
                    >
                      <div className="flex items-center">
                        Item Description
                        <SortIndicator column="description" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="text-right cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleColumnSort("quantity")}
                      data-testid="header-quantity"
                    >
                      <div className="flex items-center justify-end">
                        Quantity
                        <SortIndicator column="quantity" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right" data-testid="header-cost">
                      <div className="flex flex-col items-end leading-tight">
                        <span>Est. Cost</span>
                        <span className="text-[10px] font-normal text-muted-foreground">(inc. VAT, exc. carriage)</span>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleColumnSort("date")}
                      data-testid="header-date"
                    >
                      <div className="flex items-center">
                        Production Date
                        <SortIndicator column="date" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleColumnSort("status")}
                      data-testid="header-status"
                    >
                      <div className="flex items-center">
                        Status
                        <SortIndicator column="status" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleColumnSort("tracking")}
                      data-testid="header-tracking"
                    >
                      <div className="flex items-center">
                        Tracking
                        <SortIndicator column="tracking" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => {
                    const lineItems = job.lineItems || [];
                    
                    if (lineItems.length === 0) {
                      // Show job even if no line items
                      return (
                        <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                          <TableCell className="w-10" />
                          <TableCell className="font-medium" data-testid={`text-jobname-${job.id}`}>
                            {job.jobName}
                            {job.poNumber && (
                              <span className="text-xs text-muted-foreground ml-2">
                                (PO: {job.poNumber})
                              </span>
                            )}
                            {job.notes && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Note: {job.notes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <TableCell className="text-right">{job.quantity}</TableCell>
                          <TableCell className="text-right"><EstimatedCostCell price={null} /></TableCell>
                          <TableCell data-testid={`text-dispatch-${job.id}`}>
                            {job.requiredDispatchDate
                              ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                              : "Not set"}
                          </TableCell>
                          <TableCell>{getStatusBadge(job)}</TableCell>
                          <TableCell>
                            {job.completed && job.dhlTrackingNumber ? (
                              <a
                                href={dpdLocalUrl(job.dhlTrackingNumber, customerPostcode)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-mono text-primary hover:underline"
                                data-testid={`link-tracking-${job.id}`}
                              >
                                {job.dhlTrackingNumber}
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    
                    // Show one row per line item
                    return lineItems.map((lineItem, index) => (
                      <TableRow
                        key={lineItem.id}
                        data-testid={`row-lineitem-${lineItem.id}`}
                        className={index > 0 ? "border-t-0" : ""}
                      >
                        <TableCell className="w-10">
                          {typeof lineItem.estimatedPrice === "number" && (
                            <Checkbox
                              checked={selectedLineItemIds.has(lineItem.id)}
                              onCheckedChange={() => toggleLineItem(lineItem.id)}
                              data-testid={`checkbox-lineitem-${lineItem.id}`}
                              aria-label={`Select ${lineItem.jobType} line item`}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <span data-testid={`text-jobname-${job.id}-${index}`}>{job.jobName}</span>
                          {index === 0 && job.poNumber && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (PO: {job.poNumber})
                            </span>
                          )}
                          {index === 0 && job.notes && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Note: {job.notes}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{lineItem.jobType}</div>
                            {lineItem.description && (
                              <div className="text-xs text-muted-foreground">
                                {lineItem.description}
                              </div>
                            )}
                            {lineItem.stitchCount ? (
                              <div className="text-xs text-muted-foreground">
                                {lineItem.stitchCount.toLocaleString()} stitches
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{lineItem.quantity}</TableCell>
                        <TableCell className="text-right" data-testid={`text-cost-${lineItem.id}`}>
                          <EstimatedCostCell price={lineItem.estimatedPrice} />
                        </TableCell>
                        <TableCell data-testid={`text-dispatch-${job.id}-${index}`}>
                          {job.requiredDispatchDate
                            ? format(new Date(job.requiredDispatchDate), "MMM d, yyyy")
                            : <span className="text-muted-foreground">Not set</span>
                          }
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(job)}
                        </TableCell>
                        <TableCell>
                          {index === 0 && job.completed && job.dhlTrackingNumber ? (
                            <a
                              href={dpdLocalUrl(job.dhlTrackingNumber, customerPostcode)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-primary hover:underline"
                              data-testid={`link-tracking-${job.id}`}
                            >
                              {job.dhlTrackingNumber}
                            </a>
                          ) : (
                            index === 0 && <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ));
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
          <p className="hidden md:block text-xs text-muted-foreground mt-2 px-1">
            Estimated costs include VAT (20%) and are based on the quantity and stitch count provided at submission. The final invoice may differ if quantities or stitch counts change after production. Carriage is charged separately based on number of boxes.
          </p>
          </>
        )}
      </main>

      {/* Sticky Pay Now bar */}
      {selectedLineItemIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg px-4 py-3">
          <div className="max-w-screen-xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <span className="font-medium text-sm">
                {selectedLineItemIds.size} item{selectedLineItemIds.size !== 1 ? "s" : ""} selected
              </span>
              <span className="text-muted-foreground text-sm hidden sm:inline">·</span>
              <div className="hidden sm:block text-sm">
                <span className="text-muted-foreground">£{selectedSubtotal.toFixed(2)} ex. VAT + £{selectedVat.toFixed(2)} VAT = </span>
                <span className="font-semibold">£{selectedTotal.toFixed(2)} total</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedLineItemIds(new Set())} data-testid="button-clear-selection">
                Clear
              </Button>
              <Button size="sm" onClick={() => { setPaymentResult(null); setPayDialogOpen(true); }} data-testid="button-pay-now">
                <CreditCard className="w-4 h-4 mr-2" />
                Pay Now — £{selectedTotal.toFixed(2)}
              </Button>
            </div>
          </div>
          {/* Mobile total breakdown */}
          <div className="sm:hidden text-xs text-muted-foreground mt-1 max-w-screen-xl mx-auto">
            £{selectedSubtotal.toFixed(2)} ex. VAT + £{selectedVat.toFixed(2)} VAT = £{selectedTotal.toFixed(2)} inc. VAT
          </div>
        </div>
      )}

      {/* Pay Now Confirmation Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={(open) => { setPayDialogOpen(open); if (!open) setPaymentResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paymentResult ? (paymentResult.success ? "Payment Successful" : "Payment Failed") : "Confirm Payment"}
            </DialogTitle>
            <DialogDescription>
              {paymentResult
                ? paymentResult.success
                  ? "Your card has been charged successfully."
                  : "There was a problem processing your payment."
                : "Your saved card on file will be charged for the following items."}
            </DialogDescription>
          </DialogHeader>

          {!paymentResult ? (
            <>
              {/* Items breakdown */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {allJobs.flatMap(j => (j.lineItems || []).filter(li => selectedLineItemIds.has(li.id))).map(li => {
                  const job = allJobs.find(j => j.lineItems?.some(l => l.id === li.id));
                  const price = li.estimatedPrice as number;
                  return (
                    <div key={li.id} className="flex items-start justify-between gap-2 text-sm">
                      <div>
                        <div className="font-medium">{job?.jobName}</div>
                        <div className="text-muted-foreground text-xs">{li.jobType} · Qty {li.quantity}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">£{price.toFixed(2)} ex. VAT</div>
                        <div className="font-medium">£{(price * 1.2).toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal ex. VAT</span><span>£{selectedSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>VAT (20%)</span><span>£{selectedVat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span><span>£{selectedTotal.toFixed(2)}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">Carriage is not included and will be invoiced separately.</p>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => payMutation.mutate(Array.from(selectedLineItemIds))}
                  disabled={payMutation.isPending}
                  data-testid="button-confirm-pay"
                >
                  {payMutation.isPending ? "Processing…" : `Pay £${selectedTotal.toFixed(2)}`}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className={`rounded-md p-4 text-sm ${paymentResult.success ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200" : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200"}`}>
                {paymentResult.message}
                {paymentResult.reference && (
                  <div className="text-xs mt-1 opacity-75">Reference: {paymentResult.reference}</div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setPayDialogOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new password.
            </DialogDescription>
          </DialogHeader>
          <Form {...changePasswordForm}>
            <form onSubmit={changePasswordForm.handleSubmit(handleChangePassword)} className="space-y-4">
              <FormField
                control={changePasswordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your current password" 
                        {...field} 
                        data-testid="input-current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={changePasswordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your new password" 
                        {...field} 
                        data-testid="input-new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={changePasswordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Confirm your new password" 
                        {...field} 
                        data-testid="input-confirm-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setChangePasswordOpen(false);
                    changePasswordForm.reset();
                  }}
                  data-testid="button-cancel-change-password"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={changePasswordMutation.isPending}
                  data-testid="button-submit-change-password"
                >
                  {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Mobile bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-card flex items-stretch h-16" data-testid="nav-bottom-mobile">
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate"
          onClick={() => setLocation("/customer/dashboard")}
          data-testid="nav-orders"
        >
          <Package className="h-5 w-5" />
          <span>Orders</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate relative"
          onClick={() => setLocation("/customer/messages")}
          data-testid="nav-messages"
        >
          <span className="relative">
            <MessageSquare className="h-5 w-5" />
            {unreadMessageCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center font-medium">
                {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
              </span>
            )}
          </span>
          <span>Messages</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate"
          onClick={() => setLocation("/customer/invoices")}
          data-testid="nav-invoices"
        >
          <Receipt className="h-5 w-5" />
          <span>Invoices</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate"
          onClick={() => setLocation("/customer/submit")}
          data-testid="nav-submit"
        >
          <Plus className="h-5 w-5" />
          <span>New Job</span>
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground hover-elevate"
          onClick={() => setLocation("/customer/team")}
          data-testid="nav-team"
        >
          <Users className="h-5 w-5" />
          <span>My Team</span>
        </button>
      </nav>
      {/* PWA install prompt — shows on mobile when not yet installed */}
      {!isImpersonating && <MobileInstallBanner />}
      <FeatureRequestDialog
        open={featureDialogOpen}
        onOpenChange={setFeatureDialogOpen}
        submitterType="customer"
        endpoint="/api/customer-portal/feature-requests"
      />
    </div>
  );
}
