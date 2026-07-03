import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Mail, Send, Users, Loader2, ChevronDown, FlaskConical, Eye } from "lucide-react";
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

  const { data: recipientsData, isLoading: recipientsLoading } = useQuery<RecipientsResponse>({
    queryKey: ["/api/admin/broadcast-recipients"],
    enabled: isAllowed,
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

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAllowed) {
    return (
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
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Mail className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Email All Customers</h1>
          <p className="text-sm text-muted-foreground">
            Compose a message, preview exactly what customers will receive, then send.
          </p>
        </div>
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
  );
}
