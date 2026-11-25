import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, Clock3, ExternalLink, Facebook, Image as ImageIcon, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { FacebookArticleRecord, FacebookSharingStatus } from "@shared/facebookArticleSharing";

const statusQueryKey = ["/api/admin/facebook-articles"];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

function articleStatusLabel(status: FacebookArticleRecord["status"]) {
  return {
    published: "Published",
    already_shared: "Already shared",
    blocked: "Blocked",
    publishing: "Publishing",
    review: "Held for review",
    rejected: "Rejected",
  }[status];
}

function statusTone(status: FacebookArticleRecord["status"]) {
  if (status === "published" || status === "already_shared") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "review" || status === "rejected" || status === "blocked") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-sky-50 text-sky-900 border-sky-200";
}

export default function FacebookArticleSharing() {
  const { toast } = useToast();
  const [confirmSoroStopped, setConfirmSoroStopped] = useState(false);
  const [retryConfirmations, setRetryConfirmations] = useState<Record<string, boolean>>({});
  const { data: status, isLoading, isError, error, refetch, isFetching } = useQuery<FacebookSharingStatus>({
    queryKey: statusQueryKey,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/facebook-articles");
      return response.json();
    },
  });

  const applyStatus = (nextStatus: FacebookSharingStatus) => {
    queryClient.setQueryData(statusQueryKey, nextStatus);
  };

  const checkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/facebook-articles/check", {});
      return response.json() as Promise<FacebookSharingStatus>;
    },
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      toast({ title: "Safe check complete", description: "No article was published by this check." });
    },
    onError: (mutationError: Error) => {
      queryClient.invalidateQueries({ queryKey: statusQueryKey });
      toast({ title: "Could not check articles", description: mutationError.message, variant: "destructive" });
    },
  });

  const configMutation = useMutation({
    mutationFn: async (config: { enabled: boolean; soroSharingStopped: boolean }) => {
      const response = await apiRequest("PUT", "/api/admin/facebook-articles/config", config);
      return response.json() as Promise<FacebookSharingStatus>;
    },
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      setConfirmSoroStopped(false);
      toast({
        title: nextStatus.enabled ? "Article sharing enabled" : "Article sharing paused",
        description: nextStatus.enabled
          ? "Only new eligible articles will be considered. Existing articles are excluded."
          : "Publishing is paused. Daily read-only checks continue.",
      });
    },
    onError: (mutationError: Error) => toast({ title: "Could not save sharing settings", description: mutationError.message, variant: "destructive" }),
  });

  const retryMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await apiRequest("POST", "/api/admin/facebook-articles/retry", {
        key,
        confirmNotPublished: true,
      });
      return response.json() as Promise<FacebookSharingStatus>;
    },
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      setRetryConfirmations({});
      toast({ title: "Retry queued for the next check", description: "It can be considered at the next 09:00 Europe/London check or catch-up. This button does not publish immediately." });
    },
    onError: (mutationError: Error) => toast({ title: "Could not retry article", description: mutationError.message, variant: "destructive" }),
  });

  const toggleSharing = (enabled: boolean) => {
    if (!status || configMutation.isPending) return;
    if (enabled && !confirmSoroStopped) {
      toast({
        title: "Confirmation required",
        description: "Confirm that Soro article auto-sharing has actually been stopped before enabling this integration.",
        variant: "destructive",
      });
      return;
    }
    configMutation.mutate({
      enabled,
      soroSharingStopped: enabled ? confirmSoroStopped : status.soroSharingStopped,
    });
  };

  const recent = status?.recent ?? [];

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm" data-testid="card-facebook-article-sharing">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eaf1f8] text-[#315b7d]">
              <Facebook className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-lg">Facebook article sharing</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Share newly published Knowledge Centre articles once, with a clear audit trail.
              </CardDescription>
            </div>
          </div>
          {status && (
            <Badge variant="outline" className={status.enabled ? "w-fit border-emerald-300 bg-emerald-50 text-emerald-800" : "w-fit border-slate-300 bg-white text-slate-700"}>
              <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${status.enabled ? "bg-emerald-600" : "bg-slate-400"}`} />
              {status.enabled ? "Sharing enabled" : "Sharing paused"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-4 sm:p-6">
        {isLoading ? (
          <div className="space-y-4" aria-label="Loading Facebook sharing settings">
            <div className="h-16 animate-pulse rounded-md bg-slate-100" />
            <div className="h-28 animate-pulse rounded-md bg-slate-100" />
            <div className="h-20 animate-pulse rounded-md bg-slate-100" />
          </div>
        ) : isError || !status ? (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">Facebook sharing status is unavailable.</p>
                <p className="mt-1 break-words text-red-800">{error instanceof Error ? error.message : "Check your connection and try again."}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="shrink-0">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Try again
            </Button>
          </div>
        ) : (
          <>
            <section aria-labelledby="facebook-connection-title">
              <h3 id="facebook-connection-title" className="mb-3 text-sm font-semibold text-slate-900">Connection and configuration</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Facebook Page</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{status.configured ? status.pageName || "Configured — run a safe check" : "Not configured"}</p>
                  {status.configured && status.pageId && <p className="mt-0.5 text-xs text-slate-500">Page ID: {status.pageId}</p>}
                  {!status.configured && <p className="mt-1 text-xs text-slate-600">Page connection is required before sharing can run.</p>}
                </div>
                <div className="rounded-lg border border-slate-200 p-3.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Daily read-only check</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">09:00 Europe/London</p>
                  <p className="mt-0.5 text-xs text-slate-600">If the app is offline at that time, it catches up when the app resumes.</p>
                </div>
              </div>
            </section>

            <div className="rounded-lg border border-slate-200 bg-[#f7f9fb] p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#315b7d]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Prevent duplicate posts</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Before enabling, stop Soro&apos;s article auto-sharing and confirm it here. First activation sets a baseline and excludes every article already in the feed—there is no backlog.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-slate-800">
                    <Checkbox
                      checked={confirmSoroStopped}
                      onCheckedChange={(checked) => setConfirmSoroStopped(checked === true)}
                      disabled={configMutation.isPending}
                      aria-label="Confirm Soro article auto-sharing has actually been stopped"
                      className="mt-0.5"
                    />
                    <span>I confirm Soro article auto-sharing has actually been stopped.</span>
                  </label>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Automatic publishing</p>
                  <p className="text-xs text-slate-600">
                    {status.enabled ? "Paused status stops publishing, not the daily read-only checks." : "New eligible articles only; existing feed articles remain excluded."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={status.enabled ? "outline" : "default"}
                  onClick={() => toggleSharing(!status.enabled)}
                  disabled={configMutation.isPending || (!status.enabled && (!status.configured || status.development || !confirmSoroStopped))}
                  className="w-full shrink-0 sm:w-auto"
                  data-testid="button-toggle-facebook-sharing"
                >
                  {configMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : status.enabled ? null : <Check className="h-4 w-4" />}
                  {configMutation.isPending ? "Saving…" : status.enabled ? "Pause sharing" : "Enable sharing"}
                </Button>
              </div>
              {!status.configured && !status.enabled && (
                <p className="mt-3 text-xs text-amber-800">Enable is unavailable until Facebook page configuration is complete.</p>
              )}
            </div>

            {status.development && (
              <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3.5 py-3 text-sm text-sky-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p><strong>Development environment:</strong> checks can preview and record results, but this environment never publishes to Facebook.</p>
              </div>
            )}

            {status.lastError && (
              <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
                <p className="font-medium">Latest service issue</p>
                <p className="mt-1 break-words">{status.lastError}</p>
              </div>
            )}

            <section aria-labelledby="facebook-preview-title">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 id="facebook-preview-title" className="text-sm font-semibold text-slate-900">Safe article preview</h3>
                  <p className="mt-0.5 text-xs text-slate-600">Check now only reads and previews. The preview may be an existing baseline article, not an article queued to publish.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => checkMutation.mutate()}
                  disabled={checkMutation.isPending}
                  className="w-full sm:w-auto"
                  data-testid="button-check-facebook-articles"
                >
                  {checkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {checkMutation.isPending ? "Checking…" : "Check now"}
                </Button>
              </div>
              {status.preview ? (
                <article className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid sm:grid-cols-[168px_1fr]">
                    <div className="flex min-h-36 items-center justify-center overflow-hidden bg-slate-100 sm:min-h-full">
                      {status.preview.imageUrl ? (
                        <img src={status.preview.imageUrl} alt="" className="h-40 w-full object-cover sm:h-full" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-xs text-slate-500"><ImageIcon className="h-6 w-6" aria-hidden="true" />No article image</div>
                      )}
                    </div>
                    <div className="min-w-0 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Article preview</p>
                      <h4 className="mt-1 text-base font-semibold leading-snug text-slate-900">{status.preview.title}</h4>
                      <p className="mt-2 whitespace-pre-line text-sm leading-5 text-slate-600">{status.preview.paragraph}</p>
                      <p className="mt-3 whitespace-pre-line break-words text-xs text-slate-500">{status.preview.message}</p>
                      <a
                        href={status.preview.articleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex max-w-full items-center gap-1.5 break-all text-sm font-medium text-[#315b7d] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        View article <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                </article>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  No article preview is available yet. Run a safe check to see the current candidate.
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Last checked: {formatDate(status.lastCheckedAt)}</span>
                {status.initializedAt && <span>Baseline set: {formatDate(status.initializedAt)}</span>}
                {status.activatedAt && <span>Activated: {formatDate(status.activatedAt)}</span>}
              </div>
            </section>

            <section aria-labelledby="facebook-recent-title">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 id="facebook-recent-title" className="text-sm font-semibold text-slate-900">Recent results</h3>
                  <p className="mt-0.5 text-xs text-slate-600">Review a post before retrying any held or rejected article.</p>
                </div>
                <span className="text-xs text-slate-500">{recent.length} {recent.length === 1 ? "record" : "records"}</span>
              </div>
              {recent.length ? (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {recent.map((record) => (
                    <li key={record.key} className="space-y-3 p-3.5 sm:p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <a href={record.articleUrl} target="_blank" rel="noreferrer" className="break-words text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-700">
                            {record.title}
                          </a>
                          <p className="mt-1 text-xs text-slate-500">Updated {formatDate(record.updatedAt)}</p>
                        </div>
                        <Badge variant="outline" className={`w-fit shrink-0 ${statusTone(record.status)}`}>{articleStatusLabel(record.status)}</Badge>
                      </div>
                      {(record.error || record.facebookPostId) && (
                        <p className="break-words text-xs text-slate-600">
                          {record.error ? `Issue: ${record.error}` : `Facebook post ID: ${record.facebookPostId}`}
                        </p>
                      )}
                      {(record.status === "review" || record.status === "rejected") && (
                        <div className="rounded-md bg-amber-50 p-3">
                          <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-amber-950">
                            <Checkbox
                              checked={retryConfirmations[record.key] === true}
                              onCheckedChange={(checked) => setRetryConfirmations((current) => ({ ...current, [record.key]: checked === true }))}
                              disabled={retryMutation.isPending}
                              className="mt-0.5"
                              aria-label={`Confirm Facebook was checked and ${record.title} was not published`}
                            />
                            <span>I checked Facebook and confirmed this article was not published.</span>
                          </label>
                          <p className="mt-2 text-xs leading-5 text-amber-900">Retry makes it eligible at the next 09:00 Europe/London check or catch-up. It does not publish immediately.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full sm:w-auto"
                            onClick={() => retryMutation.mutate(record.key)}
                            disabled={!retryConfirmations[record.key] || retryMutation.isPending}
                          >
                            {retryMutation.isPending && retryMutation.variables === record.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            {retryMutation.isPending && retryMutation.variables === record.key ? "Retrying…" : "Retry article"}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  No sharing results yet. A safe check will establish the initial feed baseline and show its result here.
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
