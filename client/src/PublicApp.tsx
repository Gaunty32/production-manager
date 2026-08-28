import { lazy, Suspense, useEffect } from "react";
import { Route, Router, Switch } from "wouter";
import DemoAccess from "@/pages/DemoAccess";

const KnowledgeCentre = lazy(() => import("@/pages/KnowledgeCentre"));
const Privacy = lazy(() => import("@/pages/Privacy"));

declare global {
  interface Window {
    __staffAuthPreflight?: Promise<Response>;
    __staffAuthSnapshot?: boolean | null;
  }
}

function LoadingPage() {
  return <div className="min-h-screen bg-background" />;
}

function PublicHome() {
  useEffect(() => {
    if (window.__staffAuthSnapshot === false) return;
    if (window.__staffAuthSnapshot === true) {
      window.location.replace("/dashboard");
      return;
    }
    let active = true;
    const request = window.__staffAuthPreflight || fetch("/api/staff-auth/user", {
      credentials: "include",
      cache: "no-store",
    });
    request.then((response) => {
      if (active && response.ok) {
        // Switch from the lightweight public entry to the full planner entry.
        window.location.replace("/dashboard");
      }
    }).catch(() => {
      // Anonymous visitors should continue to see the public homepage.
    });
    return () => { active = false; };
  }, []);

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
    <Suspense fallback={<LoadingPage />}>
      <Router>
        <PublicRoutes />
      </Router>
    </Suspense>
  );
}