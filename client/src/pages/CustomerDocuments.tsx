import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  FileText,
  ExternalLink,
  ArrowLeft,
  FolderOpen,
  Tag,
  BookOpen,
  ShieldCheck,
  PoundSterling,
} from "lucide-react";
import { format } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
import type { CustomerDocument } from "@shared/schema";

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ElementType; accent: string; badge: string }
> = {
  pricing: {
    label: "Pricing",
    icon: PoundSterling,
    accent: "bg-emerald-50 dark:bg-emerald-950/40",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  guides: {
    label: "Guides",
    icon: BookOpen,
    accent: "bg-violet-50 dark:bg-violet-950/40",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  },
  policies: {
    label: "Policies",
    icon: ShieldCheck,
    accent: "bg-blue-50 dark:bg-blue-950/40",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  general: {
    label: "General",
    icon: Tag,
    accent: "bg-slate-50 dark:bg-slate-900/40",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

const DEFAULT_META = CATEGORY_META.general;

function DocumentCard({ doc }: { doc: CustomerDocument }) {
  return (
    <Card
      className="hover-elevate group cursor-pointer border"
      onClick={() => window.open(doc.driveUrl, "_blank", "noopener,noreferrer")}
      data-testid={`document-card-${doc.id}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">
                {doc.title}
              </h4>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
            </div>
            {doc.description && (
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {doc.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground/70 mt-3 font-medium">
              Added {format(new Date(doc.createdAt), "d MMM yyyy")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CustomerDocuments() {
  const [, setLocation] = useLocation();
  const { isImpersonating } = usePermissions();

  const { data: documents = [], isLoading } = useQuery<CustomerDocument[]>({
    queryKey: ["/api/customer-portal/documents"],
  });

  const { data: currentUser } = useQuery<{
    email: string;
    customerName: string | null;
  }>({
    queryKey: ["/api/customer-portal/auth/user"],
  });

  const groupedDocuments = documents.reduce(
    (acc, doc) => {
      const category = doc.category || "general";
      if (!acc[category]) acc[category] = [];
      acc[category].push(doc);
      return acc;
    },
    {} as Record<string, CustomerDocument[]>
  );

  const categoryOrder = ["pricing", "guides", "policies", "general"];
  const sortedCategories = Object.keys(groupedDocuments).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <div className="min-h-screen bg-background">
      {isImpersonating && currentUser && (
        <ImpersonationBanner customerEmail={currentUser.email} />
      )}

      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/customer/dashboard")}
            data-testid="button-back-to-portal"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <span className="font-semibold text-sm">Documents</span>
        </div>
      </header>

      <div className="bg-gradient-to-br from-primary/8 via-background to-primary/4 border-b">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <FolderOpen className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Important Documents</h1>
              <p className="text-muted-foreground mt-0.5">
                Access price lists, policies, and helpful guides
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-sm">Loading documents…</p>
          </div>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <FileText className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="font-medium text-muted-foreground">
                No documents available yet.
              </p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Check back soon — we'll add useful resources here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-10">
            {sortedCategories.map((category) => {
              const meta = CATEGORY_META[category] ?? DEFAULT_META;
              const Icon = meta.icon;
              const docs = groupedDocuments[category];
              return (
                <section key={category}>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center ${meta.accent}`}
                    >
                      <Icon className="h-4 w-4 text-foreground/70" />
                    </div>
                    <h2 className="text-base font-semibold">{meta.label}</h2>
                    <Badge
                      className={`text-xs font-normal ${meta.badge} no-default-active-elevate`}
                    >
                      {docs.length} {docs.length === 1 ? "document" : "documents"}
                    </Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {docs.map((doc) => (
                      <DocumentCard key={doc.id} doc={doc} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
