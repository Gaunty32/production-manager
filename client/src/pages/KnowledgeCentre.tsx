import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, BookOpen, Clock3, Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getKnowledgeCentreArticle,
  KNOWLEDGE_CENTRE_ARTICLES,
} from "@shared/knowledgeCentre";
import sbsLogo from "@assets/logo_transparent.png";

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
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
  const article = params?.slug ? getKnowledgeCentreArticle(params.slug) : undefined;

  useEffect(() => {
    document.title = article
      ? `${article.title} | Select Branding Solutions`
      : "Knowledge Centre | Select Branding Solutions";
  }, [article]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="container mx-auto px-4 py-12 md:py-20">
        {article ? (
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
            <p className="mb-10 border-l-4 border-primary pl-5 text-xl leading-relaxed text-muted-foreground">{article.excerpt}</p>
            <div className="space-y-6 text-lg leading-relaxed">
              {article.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <div className="mt-12 border-t pt-8">
              <Link href="/demo-access">
                <Button>Talk to the contract embroidery team <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </Link>
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
              <a
                href="/rss/knowledge-centre.xml"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                data-testid="link-knowledge-rss"
              >
                <Rss className="h-4 w-4" /> Subscribe via RSS
              </a>
            </div>
            <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-2">
              {KNOWLEDGE_CENTRE_ARTICLES.map((item) => (
                <Card key={item.slug} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex h-full flex-col p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{item.category}</p>
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