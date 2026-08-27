import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import DemoAccess from "@/pages/DemoAccess";

const KnowledgeCentre = lazy(() => import("@/pages/KnowledgeCentre"));
const Privacy = lazy(() => import("@/pages/Privacy"));

function LoadingPage() {
  return <div className="min-h-screen bg-background" />;
}

function PublicHome() {
  return <DemoAccess publicNav />;
}

function PublicRoutes() {
  return (
    <Switch>
      <Route path="/demo-access"><DemoAccess /></Route>
      <Route path="/knowledge-centre/:slug" component={KnowledgeCentre} />
      <Route path="/knowledge-centre" component={KnowledgeCentre} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/"><PublicHome /></Route>
    </Switch>
  );
}

export default function PublicApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ErrorBoundary>
          <Suspense fallback={<LoadingPage />}>
            <Router>
              <PublicRoutes />
            </Router>
          </Suspense>
          <Toaster />
        </ErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}