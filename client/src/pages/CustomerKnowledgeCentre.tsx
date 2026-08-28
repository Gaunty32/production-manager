import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, BookOpen, Clock3, LogOut } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerPortalBanner } from "@/components/CustomerPortalBanner";
import { useToast } from "@/hooks/use-toast";
import type { KnowledgeCentreArticle } from "@shared/knowledgeCentre";
import sbsLogo from "@assets/logo_transparent.png";

type CustomerUser = {
  id: string;
  customerName: string | null;
  customerLogoUrl: string | null;
};

export default function CustomerKnowledgeCentre() {
  const [, setLocation] = useLocation();
  const [, articleParams] = useRoute("/customer/knowledge-centre/:slug");
  const { toast } = useToast();

  const { data: customerUser, isLoading: isLoadingUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer-auth/user"],
  });

  const { data: knowledgeData, isLoading: isLoadingArticles } = useQuery<{
    articles?: KnowledgeCentreArticle[];
  }>({
    queryKey: ["/api/knowledge-centre/external"],
    enabled: !!customerUser,
    staleTime: 5 * 60 * 1000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/customer-auth/logout", {}),
    onSuccess: () => {
      window.location.href = "/customer/login";
    },
    onError: () => {
      toast({
        title: "Logout failed",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isLoadingUser && !customerUser) {
      setLocation("/customer/login");
    }
  }, [customerUser, isLoadingUser, setLocation]);

  useEffect(() => {
    document.title = articleParams?.slug
      ? "Knowledge Centre article | Select Branding Solutions"
      : "Knowledge Centre | Select Branding Solutions";
  }, [articleParams?.slug]);

  if (isLoadingUser || !customerUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const articles = knowledgeData?.articles || [];
  const article = articleParams?.slug
    ? articles.find((item) => item.slug === articleParams.slug)
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {customerUser.customerLogoUrl ? (
                <img
                  src={customerUser.customerLogoUrl}
                  alt={customerUser.customerName || "Customer logo"}
                  className="h-16 max-w-[240px] object-contain"
                />
              ) : (
                <span className="truncate font-bold">Customer Portal</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" onClick={() => setLocation("/customer/dashboard")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Back to Portal</span>
                <span className="sm:hidden">Back</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-12">
        <CustomerPortalBanner className="mb-6" />

        {articleParams?.slug ? (
          <article className="mx-auto max-w-3xl">
            <Button
              variant="ghost"
              className="mb-6 px-0"
              onClick={() => setLocation("/customer/knowledge-centre")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Knowledge Centre
            </Button>

            {isLoadingArticles ? (
              <p className="text-sm text-muted-foreground">Loading article...</p>
            ) : article ? (
              <>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                  {article.category}
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
                  {article.title}
                </h1>
                <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    {new Date(article.publishedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-4 w-4" />
                    {article.readTime}
                  </span>
                </div>
                {article.imageUrl && (
                  <img
                    src={article.imageUrl}
                    alt=""
                    className="mt-8 aspect-[16/9] w-full rounded-xl object-cover"
                    decoding="async"
                  />
                )}
                <p className="mt-8 border-l-4 border-primary pl-5 text-lg leading-relaxed text-muted-foreground">
                  {article.excerpt}
                </p>
                <div className="mt-8 space-y-5 text-base leading-relaxed md:text-lg">
                  {article.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border bg-card p-6">
                <h1 className="text-xl font-semibold">Article not found</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  This article is no longer available in the Knowledge Centre.
                </p>
              </div>
            )}
          </article>
        ) : (
          <>
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                Select Branding Solutions
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
                Knowledge Centre
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
                Practical advice from Select Branding Solutions, including the latest
                articles from our RSS feed.
              </p>
            </div>

            {isLoadingArticles ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Loading articles...
              </div>
            ) : articles.length === 0 ? (
              <div className="mx-auto mt-12 max-w-xl rounded-lg border bg-card p-8 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  New advice will appear here soon.
                </p>
              </div>
            ) : (
              <div className="mx-auto mt-10 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
                {articles.map((item) => (
                  <Card key={item.slug} className="overflow-hidden transition-shadow hover:shadow-md">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="aspect-[16/9] w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <CardContent className="flex h-full flex-col p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {item.category}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold">{item.title}</h2>
                      <p className="mt-3 flex-1 leading-relaxed text-muted-foreground">
                        {item.excerpt}
                      </p>
                      <div className="mt-5 flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock3 className="h-4 w-4" />
                          {item.readTime}
                        </span>
                        <Link href={`/customer/knowledge-centre/${item.slug}`}>
                          <Button variant="outline" size="sm">
                            Read article
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t">
        <div className="container mx-auto flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
          <img src={sbsLogo} alt="Select Branding Solutions" className="h-7 object-contain" />
          <span>Knowledge Centre</span>
        </div>
      </footer>
    </div>
  );
}