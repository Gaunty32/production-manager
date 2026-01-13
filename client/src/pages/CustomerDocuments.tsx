import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { FileText, ExternalLink, ArrowLeft, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";
import type { CustomerDocument } from "@shared/schema";

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  pricing: "Pricing",
  policies: "Policies",
  guides: "Guides",
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  pricing: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200",
  policies: "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200",
  guides: "bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-200",
};

export default function CustomerDocuments() {
  const [, setLocation] = useLocation();
  const { isImpersonating } = usePermissions();

  const { data: documents = [], isLoading } = useQuery<CustomerDocument[]>({
    queryKey: ["/api/customer-portal/documents"],
  });

  const { data: currentUser } = useQuery<{ email: string; customerName: string | null }>({
    queryKey: ["/api/customer-portal/auth/user"],
  });

  const groupedDocuments = documents.reduce((acc, doc) => {
    const category = doc.category || "general";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(doc);
    return acc;
  }, {} as Record<string, CustomerDocument[]>);

  const categoryOrder = ["pricing", "guides", "policies", "general"];
  const sortedCategories = Object.keys(groupedDocuments).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  return (
    <div className="min-h-screen bg-background">
      {isImpersonating && currentUser && <ImpersonationBanner customerEmail={currentUser.email} />}
      
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/customer/dashboard")}
              data-testid="button-back-to-portal"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Documents</h1>
              {currentUser?.customerName && (
                <p className="text-sm text-muted-foreground">{currentUser.customerName}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Important Documents</h2>
              <p className="text-muted-foreground">
                Access price lists, policies, and helpful guides
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents available at this time.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {sortedCategories.map((category) => (
              <div key={category}>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Badge className={CATEGORY_COLORS[category] || CATEGORY_COLORS.general}>
                    {CATEGORY_LABELS[category] || category}
                  </Badge>
                  <span className="text-muted-foreground text-sm font-normal">
                    ({groupedDocuments[category].length} {groupedDocuments[category].length === 1 ? "document" : "documents"})
                  </span>
                </h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {groupedDocuments[category].map((doc) => (
                    <Card 
                      key={doc.id} 
                      className="hover-elevate group cursor-pointer"
                      onClick={() => window.open(doc.driveUrl, "_blank", "noopener,noreferrer")}
                      data-testid={`document-card-${doc.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium truncate group-hover:text-primary transition-colors">
                                {doc.title}
                              </h4>
                              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </div>
                            {doc.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {doc.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              Added {format(new Date(doc.createdAt), "dd MMM yyyy")}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
