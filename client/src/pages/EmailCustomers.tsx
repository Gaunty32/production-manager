import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mail, Send, Users, Loader2, ChevronDown, FlaskConical, Eye, CalendarClock, BookOpen, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isSuperAdmin } from "@shared/schema";

interface Recipient {
  email: string;
  firstName: string | null;
  lastName: string | null;
  customerName: string;
}

interface RecipientsResponse {
  count: number;
  recipients: Recipient[];
}

interface SendResult {
  test: boolean;
  sent: number;
  failed: number;
  failures?: string[];
}

interface CampaignTag { id: string; name: string }
interface CampaignArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
}
interface CampaignCustomer {
  id: string;
  name: string;
  users: Array<{ id: string; email: string; firstName: string | null; lastName: string | null }>;
}
interface CampaignRun {
  id: string;
  slotKey: string;
  status: string;
  tagName: string;
  articleTitle: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  startedAt: string;
}
interface CampaignConfigResponse {
  config: {
    enabled: boolean;
    audienceSource: "highlevel_tag" | "customers";
    tagId: string | null;
    tagName: string | null;
    customerSelectionMode: "all" | "selected";
    selectedCustomerIds: string[];
    excludedCustomerUserIds: string[];
    articleSlug: string | null;
    subject: string | null;
    intro: string;
  };
  history: CampaignRun[];
  nextSend: string;
  schedule: string;
}

export default function EmailCustomers() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isAllowed = isSuperAdmin(user?.role);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [lastResult, setLastResult] = useState<SendResult | null>(null);
  const [campaignEnabled, setCampaignEnabled] = useState(false);
  const [campaignTagId, setCampaignTagId] = useState("");
  const [campaignAudienceSource, setCampaignAudienceSource] = useState<"highlevel_tag" | "customers">("highlevel_tag");
  const [customerSelectionMode, setCustomerSelectionMode] = useState<"all" | "selected">("all");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [excludedCustomerUserIds, setExcludedCustomerUserIds] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [campaignArticleSlug, setCampaignArticleSlug] = useState("");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignTestEmail, setCampaignTestEmail] = useState("");
  const [campaignPreviewHtml, setCampaignPreviewHtml] = useState("");
  const [campaignRecipientCount, setCampaignRecipientCount] = useState<number | null>(null);

  const { data: recipientsData, isLoading: recipientsLoading } = useQuery<RecipientsResponse>({
    queryKey: ["/api/admin/broadcast-recipients"],
    enabled: isAllowed,
  });

  const { data: campaignData, isLoading: campaignLoading } = useQuery<CampaignConfigResponse>({
    queryKey: ["/api/admin/highlevel-campaign/config"],
    enabled: isAllowed,
    staleTime: 0,
  });
  const { data: tagsData, isLoading: tagsLoading, refetch: refetchTags } = useQuery<{ tags: CampaignTag[] }>({
    queryKey: ["/api/admin/highlevel-campaign/tags"],
    enabled: isAllowed,
    staleTime: 0,
    retry: false,
  });
  const { data: articlesData, isLoading: articlesLoading } = useQuery<{ articles: CampaignArticle[] }>({
    queryKey: ["/api/admin/highlevel-campaign/articles"],
    enabled: isAllowed,
    staleTime: 0,
  });
  const { data: customerAudienceData, isLoading: customerAudienceLoading } = useQuery<{ customers: CampaignCustomer[]; recipientCount: number }>({
    queryKey: ["/api/admin/highlevel-campaign/customer-recipients"],
    enabled: isAllowed,
    staleTime: 0,
  });

  useEffect(() => {
    if (!campaignData?.config) return;
    setCampaignEnabled(campaignData.config.enabled);
    setCampaignAudienceSource(campaignData.config.audienceSource || "highlevel_tag");
    setCampaignTagId(campaignData.config.tagId || "");
    setCustomerSelectionMode(campaignData.config.customerSelectionMode || "all");
    setSelectedCustomerIds(campaignData.config.selectedCustomerIds || []);
    setExcludedCustomerUserIds(campaignData.config.excludedCustomerUserIds || []);
    setCampaignArticleSlug(campaignData.config.articleSlug || "");
    setCampaignSubject(campaignData.config.subject || "");
  }, [campaignData]);

  useEffect(() => {
    const article = articlesData?.articles.find((item) => item.slug === campaignArticleSlug);
    if (article && !campaignSubject.trim()) setCampaignSubject(article.title);
  }, [campaignArticleSlug, articlesData, campaignSubject]);

  const previewCampaignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/highlevel-campaign/preview", {
        audienceSource: campaignAudienceSource,
        tagId: campaignAudienceSource === "customers" ? "existing-customers" : campaignTagId,
        customerSelectionMode,
        selectedCustomerIds,
        excludedCustomerUserIds,
        articleSlug: campaignArticleSlug,
      });
      return res.json() as Promise<{ html: string; recipientCount: number }>;
    },
    onSuccess: (result) => {
      setCampaignPreviewHtml(result.html);
      setCampaignRecipientCount(result.recipientCount);
    },
    onError: (err: any) => toast({ title: "Preview unavailable", description: err?.message || "Could not load the HighLevel audience.", variant: "destructive" }),
  });

  const saveCampaignMutation = useMutation({
    mutationFn: async () => {
      const tag = tagsData?.tags.find((item) => item.id === campaignTagId);
      const res = await apiRequest("PUT", "/api/admin/highlevel-campaign/config", {
        enabled: campaignEnabled,
        audienceSource: campaignAudienceSource,
        tagId: campaignAudienceSource === "customers" ? "existing-customers" : campaignTagId,
        tagName: campaignAudienceSource === "customers" ? "Existing customers" : tag?.name || "",
        customerSelectionMode,
        selectedCustomerIds,
        excludedCustomerUserIds,
        articleSlug: campaignArticleSlug,
        subject: campaignSubject,
        intro: "",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/highlevel-campaign/config"] });
      toast({ title: campaignEnabled ? "Weekly campaign enabled" : "Campaign saved and paused", description: campaignEnabled ? "The next email will send on Sunday at 17:00 London time." : "No weekly emails will send while the campaign is paused." });
    },
    onError: (err: any) => toast({ title: "Could not save campaign", description: err?.message || "Please check the selections.", variant: "destructive" }),
  });

  const testCampaignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/highlevel-campaign/test", {
        to: campaignTestEmail,
        audienceSource: campaignAudienceSource,
        tagId: campaignAudienceSource === "customers" ? "existing-customers" : campaignTagId,
        articleSlug: campaignArticleSlug,
        subject: campaignSubject,
      });
      return res.json();
    },
    onSuccess: () => toast({ title: "Test email sent", description: `A test copy was sent to ${campaignTestEmail}.` }),
    onError: (err: any) => toast({ title: "Test email failed", description: err?.message || "Please try again.", variant: "destructive" }),
  });

  // Live preview (debounced)
  useEffect(() => {
    if (!isAllowed) return;
    const t = setTimeout(async () => {
      try {
        const res = await apiRequest("POST", "/api/admin/broadcast-preview", { message });
        const data = await res.json();
        setPreviewHtml(data.html || "");
      } catch {
        // preview failure is non-critical
      }
    }, 400);
    return () => clearTimeout(t);
  }, [message, isAllowed]);

  const sendMutation = useMutation({
    mutationFn: async (payload: { subject: string; message: string; testEmail?: string }) => {
      const res = await apiRequest("POST", "/api/admin/broadcast-email", payload);
      return (await res.json()) as SendResult;
    },
    onSuccess: (result) => {
      setLastResult(result);
      if (result.test) {
        toast({ title: "Test email sent", description: `A test copy was sent to ${testEmail}.` });
      } else {
        toast({
          title: "Broadcast sent",
          description: `Sent to ${result.sent} recipient${result.sent === 1 ? "" : "s"}${result.failed ? `, ${result.failed} failed` : ""}.`,
          variant: result.failed ? "destructive" : "default",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const canSend = subject.trim().length > 0 && message.trim().length > 0;
  const recipientCount = recipientsData?.count ?? 0;
  const canConfigureCampaign = Boolean(
    (campaignAudienceSource === "customers" || campaignTagId) &&
    (campaignAudienceSource !== "customers" || customerSelectionMode === "all" || selectedCustomerIds.length > 0) &&
    campaignArticleSlug &&
    campaignSubject.trim(),
  );
  const filteredCampaignCustomers = (customerAudienceData?.customers || []).filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.users.some((person) => `${person.firstName || ""} ${person.lastName || ""} ${person.email}`.toLowerCase().includes(customerSearch.toLowerCase())),
  );

  if (authLoading) {
    return (
      <div className="h-full overflow-auto">
        <div className="container mx-auto px-4 py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="h-full overflow-auto">
        <div className="container mx-auto px-4 py-12 max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access restricted</CardTitle>
              <CardDescription data-testid="text-access-restricted">
                Only super admins can send emails to all customers.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Mail className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Customer Emails</h1>
          <p className="text-sm text-muted-foreground">
            Schedule a weekly Knowledge Centre campaign or send a one-off message.
          </p>
        </div>
      </div>

      <Card data-testid="card-weekly-article-campaign">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarClock className="h-5 w-5" />
                Weekly HighLevel article campaign
              </CardTitle>
              <CardDescription className="mt-1">
                Choose a HighLevel tag and Knowledge Centre article. One email sends every Sunday at 17:00 Europe/London.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="campaign-enabled">{campaignEnabled ? "Enabled" : "Paused"}</Label>
              <Switch id="campaign-enabled" checked={campaignEnabled} onCheckedChange={setCampaignEnabled} data-testid="switch-campaign-enabled" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {campaignLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading campaign…</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Recipients</Label>
                  <Select value={campaignAudienceSource} onValueChange={(value: "highlevel_tag" | "customers") => { setCampaignAudienceSource(value); setCampaignRecipientCount(null); setCampaignPreviewHtml(""); }}>
                    <SelectTrigger data-testid="select-campaign-audience-source"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="highlevel_tag">Contacts with a HighLevel tag</SelectItem>
                      <SelectItem value="customers">Existing customer portal users</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {campaignAudienceSource === "highlevel_tag" ? (
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>HighLevel tag</Label>
                      <Button variant="ghost" size="sm" onClick={() => refetchTags()} disabled={tagsLoading} data-testid="button-refresh-highlevel-tags">
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${tagsLoading ? "animate-spin" : ""}`} /> Refresh
                      </Button>
                    </div>
                    <Select value={campaignTagId} onValueChange={(value) => { setCampaignTagId(value); setCampaignRecipientCount(null); setCampaignPreviewHtml(""); }}>
                      <SelectTrigger data-testid="select-highlevel-tag"><SelectValue placeholder={tagsLoading ? "Loading tags…" : "Select a tag"} /></SelectTrigger>
                      <SelectContent>
                        {(tagsData?.tags || []).map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {campaignRecipientCount == null ? "Preview to check the current audience size." : `${campaignRecipientCount} unique contact${campaignRecipientCount === 1 ? "" : "s"} currently have this tag.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 md:col-span-2 rounded-md border p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Customer selection</Label>
                        <Select value={customerSelectionMode} onValueChange={(value: "all" | "selected") => { setCustomerSelectionMode(value); setCampaignRecipientCount(null); setCampaignPreviewHtml(""); }}>
                          <SelectTrigger data-testid="select-customer-selection-mode"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All active customers</SelectItem>
                            <SelectItem value="selected">Only selected customers</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="campaign-customer-search">Find a company or person</Label>
                        <Input id="campaign-customer-search" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search customers…" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tick the people who should receive the email. Untick an individual to exclude them, even when their company is selected.
                    </p>
                    <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                      {customerAudienceLoading ? (
                        <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading customers…</div>
                      ) : filteredCampaignCustomers.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">No matching customers.</div>
                      ) : filteredCampaignCustomers.map((customer) => {
                        const companyIncluded = customerSelectionMode === "all" || selectedCustomerIds.includes(customer.id);
                        return (
                          <div key={customer.id} className="p-3 space-y-2">
                            <label className="flex items-center gap-2 font-medium text-sm">
                              <Checkbox
                                checked={companyIncluded}
                                disabled={customerSelectionMode === "all"}
                                onCheckedChange={(checked) => {
                                  setSelectedCustomerIds((current) => checked
                                    ? Array.from(new Set(current.concat(customer.id)))
                                    : current.filter((id) => id !== customer.id));
                                  setCampaignRecipientCount(null);
                                  setCampaignPreviewHtml("");
                                }}
                              />
                              {customer.name}
                            </label>
                            {companyIncluded && (
                              <div className="grid gap-2 pl-6 sm:grid-cols-2">
                                {customer.users.map((person) => {
                                  const included = !excludedCustomerUserIds.includes(person.id);
                                  const name = `${person.firstName || ""} ${person.lastName || ""}`.trim();
                                  return (
                                    <label key={person.id} className="flex items-start gap-2 text-sm">
                                      <Checkbox
                                        checked={included}
                                        onCheckedChange={(checked) => {
                                          setExcludedCustomerUserIds((current) => checked
                                            ? current.filter((id) => id !== person.id)
                                            : Array.from(new Set(current.concat(person.id))));
                                          setCampaignRecipientCount(null);
                                          setCampaignPreviewHtml("");
                                        }}
                                      />
                                      <span><span className="block">{name || person.email}</span>{name && <span className="block text-xs text-muted-foreground">{person.email}</span>}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {campaignRecipientCount == null ? "Preview to confirm the final recipient count." : `${campaignRecipientCount} unique customer portal recipient${campaignRecipientCount === 1 ? "" : "s"} selected.`}
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Knowledge Centre article</Label>
                  <Select value={campaignArticleSlug} onValueChange={(value) => { setCampaignArticleSlug(value); const article = articlesData?.articles.find((item) => item.slug === value); if (article) setCampaignSubject(article.title); setCampaignPreviewHtml(""); }}>
                    <SelectTrigger data-testid="select-campaign-article"><SelectValue placeholder={articlesLoading ? "Loading articles…" : "Select an article"} /></SelectTrigger>
                    <SelectContent>
                      {(articlesData?.articles || []).map((article) => <SelectItem key={article.slug} value={article.slug}>{article.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="campaign-subject">Email subject</Label>
                  <Input id="campaign-subject" value={campaignSubject} onChange={(event) => setCampaignSubject(event.target.value)} maxLength={200} data-testid="input-campaign-subject" />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" disabled={!canConfigureCampaign || previewCampaignMutation.isPending} onClick={() => previewCampaignMutation.mutate()} data-testid="button-preview-campaign">
                  {previewCampaignMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />} Preview & count audience
                </Button>
                <Button disabled={!canConfigureCampaign || saveCampaignMutation.isPending} onClick={() => saveCampaignMutation.mutate()} data-testid="button-save-campaign">
                  {saveCampaignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save campaign
                </Button>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Send a safe test</CardTitle><CardDescription>This sends only to the email address entered below.</CardDescription></CardHeader>
                  <CardContent className="flex gap-2 flex-wrap">
                    <Input type="email" placeholder="you@selectbranding.co.uk" value={campaignTestEmail} onChange={(event) => setCampaignTestEmail(event.target.value)} className="flex-1 min-w-52" data-testid="input-campaign-test-email" />
                    <Button variant="outline" disabled={!canConfigureCampaign || !campaignTestEmail.trim() || testCampaignMutation.isPending} onClick={() => testCampaignMutation.mutate()} data-testid="button-send-campaign-test">
                      {testCampaignMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send test
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Schedule status</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">{campaignData?.config.enabled ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />} <strong>{campaignData?.config.enabled ? "Enabled" : "Paused"}</strong></div>
                    <p className="text-muted-foreground">Next scheduled time: {campaignData?.nextSend || "Sunday at 17:00"}</p>
                    <p className="text-xs text-muted-foreground">Saving while paused keeps your selections but sends nothing.</p>
                  </CardContent>
                </Card>
              </div>

              {campaignPreviewHtml && (
                <div className="space-y-2">
                  <Label>Campaign preview</Label>
                  <iframe title="Campaign preview" srcDoc={campaignPreviewHtml} sandbox="" className="w-full h-[620px] rounded-md border bg-white" data-testid="iframe-campaign-preview" />
                </div>
              )}

              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2"><BookOpen className="h-4 w-4" /> Campaign history</h3>
                {(campaignData?.history || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No scheduled campaigns have sent yet.</p>
                ) : (
                  <div className="rounded-md border divide-y">
                    {campaignData!.history.map((run) => (
                      <div key={run.id} className="p-3 flex items-center justify-between gap-3 flex-wrap text-sm">
                        <div><p className="font-medium">{run.articleTitle}</p><p className="text-xs text-muted-foreground">{run.slotKey} · {run.tagName}</p></div>
                        <div className="text-right"><Badge variant={run.status === "sent" ? "secondary" : run.status === "sending" ? "outline" : "destructive"}>{run.status}</Badge><p className="text-xs text-muted-foreground mt-1">{run.sentCount} sent{run.failedCount ? ` · ${run.failedCount} failed` : ""}</p></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold">One-off customer broadcast</h2>
        <p className="text-sm text-muted-foreground">The existing manual email tool remains available below.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Compose */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compose</CardTitle>
              <CardDescription>
                Each customer receives their own copy, personally addressed with their first name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="broadcast-subject">Subject</Label>
                <Input
                  id="broadcast-subject"
                  placeholder="e.g. Christmas opening hours"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  data-testid="input-broadcast-subject"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="broadcast-message">Message</Label>
                <Textarea
                  id="broadcast-message"
                  placeholder="Write your message here. Line breaks are kept in the email."
                  value={message}
                  rows={10}
                  onChange={(e) => setMessage(e.target.value)}
                  data-testid="input-broadcast-message"
                />
                <p className="text-xs text-muted-foreground">
                  A greeting ("Hi [first name],") and the Select Branding sign-off are added automatically.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <FlaskConical className="h-4 w-4" />
                Send a test first
              </CardTitle>
              <CardDescription>Send yourself a copy to check it before emailing everyone.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Input
                  type="email"
                  placeholder="you@selectbranding.co.uk"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="flex-1 min-w-48"
                  data-testid="input-test-email"
                />
                <Button
                  variant="outline"
                  disabled={!canSend || !testEmail.trim() || sendMutation.isPending}
                  onClick={() => sendMutation.mutate({ subject, message, testEmail: testEmail.trim() })}
                  data-testid="button-send-test"
                >
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
                  Send test
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <Users className="h-4 w-4" />
                Recipients
                {!recipientsLoading && (
                  <Badge variant="secondary" data-testid="badge-recipient-count">{recipientCount}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                All active customer portal users. Duplicate email addresses are only sent one copy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Collapsible open={recipientsOpen} onOpenChange={setRecipientsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="button-toggle-recipients">
                    <ChevronDown className={`h-4 w-4 mr-1.5 transition-transform ${recipientsOpen ? "rotate-180" : ""}`} />
                    {recipientsOpen ? "Hide list" : "Show list"}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border divide-y">
                    {recipientsData?.recipients.map((r) => (
                      <div key={r.email} className="px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap" data-testid={`row-recipient-${r.email}`}>
                        <span className="truncate">
                          {[r.firstName, r.lastName].filter(Boolean).join(" ") || r.email}
                          <span className="text-muted-foreground ml-2">{r.email}</span>
                        </span>
                        {r.customerName && <span className="text-xs text-muted-foreground shrink-0">{r.customerName}</span>}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="w-full"
                    disabled={!canSend || recipientCount === 0 || sendMutation.isPending}
                    data-testid="button-send-all"
                  >
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Send to all {recipientCount} customer{recipientCount === 1 ? "" : "s"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send this email to everyone?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will email all {recipientCount} active customer portal users with the subject
                      {" "}<strong>"{subject}"</strong>. This cannot be undone. We recommend sending yourself a test first.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-send">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => sendMutation.mutate({ subject, message })}
                      data-testid="button-confirm-send"
                    >
                      Yes, send to everyone
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {sendMutation.isPending && (
                <p className="text-sm text-muted-foreground" data-testid="text-sending-status">
                  Sending... this can take a little while for a large list. Please keep this page open.
                </p>
              )}

              {lastResult && !lastResult.test && (
                <div className="text-sm space-y-1" data-testid="text-send-result">
                  <p>
                    Sent to <strong>{lastResult.sent}</strong> recipient{lastResult.sent === 1 ? "" : "s"}
                    {lastResult.failed ? `, ${lastResult.failed} failed:` : "."}
                  </p>
                  {lastResult.failures && lastResult.failures.length > 0 && (
                    <ul className="text-destructive list-disc pl-5">
                      {lastResult.failures.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Eye className="h-4 w-4" />
              Preview
            </CardTitle>
            <CardDescription>
              {subject.trim() ? (
                <>Subject: <span className="font-medium text-foreground">{subject}</span></>
              ) : (
                "This is exactly what customers will receive (example name shown)."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewHtml ? (
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="w-full h-[600px] rounded-md border bg-white"
                data-testid="iframe-email-preview"
              />
            ) : (
              <div className="h-[600px] rounded-md border flex items-center justify-center text-sm text-muted-foreground">
                Start typing a message to see the preview
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
