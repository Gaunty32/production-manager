import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, BookOpen, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { KnowledgeCentreArticle } from "@shared/knowledgeCentre";
import sbsLogo from "@assets/logo_transparent.png";
import { PublicPhoneBar } from "@/components/PublicPhoneBar";

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <PublicPhoneBar />
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="shrink-0">
          <img src={sbsLogo} alt="Select Branding Solutions" className="h-9 object-contain" />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          <Link href="/#services" className="text-muted-foreground hover:text-foreground">Services</Link>
          <Link href="/demo-access" className="text-muted-foreground hover:text-foreground">Contract Embroidery</Link>
          <Link href="/knowledge-centre" className="text-foreground">Knowledge Centre</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/customer/login" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">Customer Sign In</Link>
          <Link href="/#contact">
            <Button size="sm">Get a Quote</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function KnowledgeCentre() {
  const [, params] = useRoute("/knowledge-centre/:slug");
  const [externalArticles, setExternalArticles] = useState<KnowledgeCentreArticle[]>([]);
  const [externalLoaded, setExternalLoaded] = useState(false);
  const article = params?.slug
    ? externalArticles.find((item) => item.slug === params.slug)
    : undefined;
  const articles = externalArticles;

  useEffect(() => {
    let active = true;
    fetch("/api/knowledge-centre/external")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("RSS import unavailable")))
      .then((data: { articles?: KnowledgeCentreArticle[] }) => {
        if (active) {
          setExternalArticles(data.articles || []);
          setExternalLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setExternalArticles([]);
          setExternalLoaded(true);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.title = article
      ? `${article.title} | Select Branding Solutions`
      : "Knowledge Centre | Select Branding Solutions";
  }, [article]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="container mx-auto px-4 py-12 md:py-20">
        {params?.slug && !article && !externalLoaded ? (
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
            Loading article...
          </div>
        ) : article ? (
          <article className="mx-auto max-w-3xl">
            <Link href="/knowledge-centre" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to Knowledge Centre
            </Link>
            <div className="mb-8 space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">{article.category}</p>
              <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{article.title}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{new Date(article.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1"><Clock3 className="h-4 w-4" /> {article.readTime}</span>
              </div>
            </div>
            {article.imageUrl && (
              <img
                src={article.imageUrl}
                alt=""
                className="mb-10 aspect-[16/9] w-full rounded-xl object-cover"
                decoding="async"
              />
            )}
            <p className="mb-10 border-l-4 border-primary pl-5 text-xl leading-relaxed text-muted-foreground">{article.excerpt}</p>
            <div className="space-y-6 text-lg leading-relaxed">
              {article.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <div className="mt-12 border-t pt-8">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                  See it in action
                </p>
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                  Take a tour of our production setup
                </h2>
                <p className="text-muted-foreground">
                  See how our contract embroidery team supports growing workwear and merchandise businesses.
                </p>
              </div>
              <div className="mt-6 aspect-video overflow-hidden rounded-xl border bg-black shadow-lg">
                <iframe
                  src="https://www.youtube.com/embed/6HE3NCGQMfg"
                  title="Select Branding Solutions production tour"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
              <div className="mt-6">
                <Link href="/demo-access#book-call">
                  <Button>
                    Book a Discovery Call <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </article>
        ) : (
          <>
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Select Branding Solutions</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">Knowledge Centre</h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
                Practical guidance for businesses buying, selling and producing branded workwear, sportswear, uniforms and merchandise.
              </p>
            </div>
            <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-2">
              {articles.map((item) => (
                <Card key={item.slug} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex h-full flex-col p-6">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="mb-5 aspect-[16/9] w-full rounded-lg object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                      {item.category}
                      {item.source === "external" && <span className="ml-2 text-muted-foreground">· Latest</span>}
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold">{item.title}</h2>
                    <p className="mt-3 flex-1 leading-relaxed text-muted-foreground">{item.excerpt}</p>
                    <div className="mt-6 flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" /> {item.readTime}</span>
                      <Link href={`/knowledge-centre/${item.slug}`} data-testid={`link-article-${item.slug}`}>
                        <Button variant="outline" size="sm">Read article <ArrowRight className="ml-2 h-4 w-4" /></Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
      <footer className="border-t">
        <div className="container mx-auto flex flex-col items-center gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:justify-between">
          <div className="flex items-center gap-3">
            <img src={sbsLogo} alt="Select Branding Solutions" className="h-7 object-contain" />
            <span>© {new Date().getFullYear()} Select Branding Solutions Ltd</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <a href="mailto:info@selectbranding.co.uk" className="hover:text-foreground">info@selectbranding.co.uk</a>
          </div>
        </div>
      </footer>
    </div>
  );
}