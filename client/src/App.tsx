import { Switch, Route, useLocation, Router, Redirect } from "wouter";
import { staffJobPath } from "@shared/staff-job-links";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useVersionCheck } from "@/hooks/use-version-check";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { StaffImpersonationBanner } from "@/components/StaffImpersonationBanner";
import DemoAccess from "@/pages/DemoAccess";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DemoModeContext } from "@/lib/demoMode";
import { FlaskConical } from "lucide-react";
import { MobileInstallBanner } from "@/components/MobileInstallBanner";
import { AppDownloadModal } from "@/components/AppDownloadModal";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Customers = lazy(() => import("@/pages/Customers"));
const TeamPage = lazy(() => import("@/pages/Team"));
const EmailCustomers = lazy(() => import("@/pages/EmailCustomers"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const InvoicingQueue = lazy(() => import("@/pages/InvoicingQueue"));
const StaffHoldingArea = lazy(() => import("@/pages/StaffHoldingArea"));
const WeeklyReports = lazy(() => import("@/pages/WeeklyReports"));
const StaffJobDetail = lazy(() => import("@/pages/StaffJobDetail"));
const HolidayManagement = lazy(() => import("@/pages/HolidayManagement"));
const CustomerLogin = lazy(() => import("@/pages/CustomerLogin"));
const StaffLogin = lazy(() => import("@/pages/StaffLogin"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const CustomerDashboard = lazy(() => import("@/pages/CustomerDashboard"));
const CustomerKnowledgeCentre = lazy(() => import("@/pages/CustomerKnowledgeCentre"));
const CustomerSubmitJob = lazy(() => import("@/pages/CustomerSubmitJob"));
const CustomerPendingJobs = lazy(() => import("@/pages/CustomerPendingJobs"));
const CustomerJobDetail = lazy(() => import("@/pages/CustomerJobDetail"));
const CustomerDocuments = lazy(() => import("@/pages/CustomerDocuments"));
const CustomerThreadLibrary = lazy(() => import("@/pages/CustomerThreadLibrary"));
const CustomerPasswordReset = lazy(() => import("@/pages/CustomerPasswordReset"));
const CustomerInbox = lazy(() => import("@/pages/CustomerInbox"));
const CustomerTeam = lazy(() => import("@/pages/CustomerTeam"));
const CustomerInviteAccept = lazy(() => import("@/pages/CustomerInviteAccept"));
const CustomerInvoices = lazy(() => import("@/pages/CustomerInvoices"));
const StaffMessages = lazy(() => import("@/pages/StaffMessages"));
const StaffSamples = lazy(() => import("@/pages/StaffSamples"));
const CustomerSamples = lazy(() => import("@/pages/CustomerSamples"));
const DemoPortal = lazy(() => import("@/pages/DemoPortal"));
const ContractEmbroideryPreview = lazy(() => import("@/pages/ContractEmbroideryPreview"));
const KnowledgeCentre = lazy(() => import("@/pages/KnowledgeCentre"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const MachineManagement = lazy(() => import("@/pages/MachineManagement"));
const CustomerPaymentMethods = lazy(() => import("@/pages/CustomerPaymentMethods"));
const CustomerDeliveryAddress = lazy(() => import("@/pages/CustomerDeliveryAddress"));
const ThreadColourChart = lazy(() => import("@/pages/ThreadColourChart"));
const PortalPreview = lazy(() => import("@/pages/PortalPreview"));
const FeatureRequests = lazy(() => import("@/pages/FeatureRequests"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const SummerShifts = lazy(() => import("@/pages/SummerShifts"));
const Purchasing = lazy(() => import("@/pages/Purchasing"));
const AllocationBoard = lazy(() => import("@/pages/AllocationBoard"));
const MyQueue = lazy(() => import("@/pages/MyQueue"));
const CasualLogin = lazy(() => import("@/pages/CasualLogin"));
const CasualSetPin = lazy(() => import("@/pages/CasualSetPin"));
const CasualDashboard = lazy(() => import("@/pages/CasualDashboard"));
const DashboardTv = lazy(() => import("@/pages/DashboardTv"));
const DashboardTvSetup = lazy(() => import("@/pages/DashboardTvSetup"));
const NotFound = lazy(() => import("@/pages/not-found"));

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Allow guest access - no authentication required
  return <Component />;
}

function StaffRouter() {
  return (
    <Switch>
      {/* Staff Portal Routes */}
      <Route path="/"><Dashboard /></Route>
      <Route path="/dashboard"><Dashboard /></Route>
      <Route path="/orders"><Dashboard /></Route>
      <Route path="/customers"><Customers /></Route>
      <Route path="/team"><TeamPage /></Route>
      <Route path="/staff"><Redirect to="/team?tab=staff" /></Route>
      <Route path="/users"><Redirect to="/team?tab=logins" /></Route>
      <Route path="/email-customers"><EmailCustomers /></Route>
      <Route path="/schedule"><Schedule /></Route>
      <Route path="/holidays"><HolidayManagement /></Route>
      <Route path="/leaderboard"><Leaderboard /></Route>
      <Route path="/allocation"><AllocationBoard /></Route>
      <Route path="/my-queue"><MyQueue /></Route>
      <Route path="/invoicing"><InvoicingQueue /></Route>
      <Route path="/reports/weekly"><WeeklyReports /></Route>
      <Route path="/holding-area"><StaffHoldingArea /></Route>
      <Route path="/messages"><StaffMessages /></Route>
      <Route path="/samples"><StaffSamples /></Route>
      <Route path="/staff/job/:id"><StaffJobDetail /></Route>
      <Route path="/jobs/:id">{params => <Redirect to={staffJobPath(params.id)} />}</Route>
      <Route path="/machines"><MachineManagement /></Route>
      <Route path="/machine/:id"><Dashboard /></Route>
      <Route path="/feature-requests"><FeatureRequests /></Route>
      <Route path="/tasks"><Tasks /></Route>
      <Route path="/summer-shifts"><SummerShifts /></Route>
      <Route path="/purchasing"><Purchasing /></Route>
      <Route path="/thread-library"><ThreadColourChart /></Route>
      <Route path="/dashboard-tv-setup"><DashboardTvSetup /></Route>
      {/* Customer portal paths — render without staff chrome */}
      <Route path="/customer/:rest*"><CustomerPortalApp /></Route>
      <Route><NotFound /></Route>
    </Switch>
  );
}

function StaffLoginGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (isAuthenticated) return null;
  return <StaffLogin />;
}

function AppRouter() {
  useVersionCheck();

  // Always prevent the browser's default file-open behaviour during drag operations.
  // Drop zones handle their own files; this just stops the browser navigating away.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <>
      <Switch>
        {/* Public Routes - No Authentication Required */}
        <Route path="/dashboard-tv" component={DashboardTv} />
        <Route path="/portal-preview" component={PortalPreview} />
        <Route path="/staff-login" component={StaffLoginGate} />
        <Route path="/demo-access">
          <DemoAccess />
        </Route>
        <Route path="/demo-access-preview" component={ContractEmbroideryPreview} />
        <Route path="/knowledge-centre/:slug" component={KnowledgeCentre} />
        <Route path="/knowledge-centre" component={KnowledgeCentre} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/demo" component={DemoPortal} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/customer/invite" component={CustomerInviteAccept} />

        {/* Casual / Summer Staff Portal Routes - mobile, public */}
        <Route path="/casual/login" component={CasualLogin} />
        <Route path="/casual/set-pin" component={CasualSetPin} />
        <Route path="/casual" component={CasualDashboard} />

        {/* Customer Portal Routes */}
        <Route path="/customer/:rest*">
          <CustomerPortalApp />
        </Route>

        <Route path="/">
          <AuthenticatedApp style={style} />
        </Route>
        
        {/* Authenticated Staff Routes - handles all non-specific paths */}
        <Route>
          <AuthenticatedApp style={style} />
        </Route>
      </Switch>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoading />}>
              <Router>
                <AppRouter />
              </Router>
            </Suspense>
          </ErrorBoundary>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

function CustomerPortalApp() {
  const [location] = useLocation();
  const isPublicCustomerRoute =
    location.startsWith("/customer/login") ||
    location.startsWith("/customer/reset-password") ||
    location.startsWith("/customer/invite");

  const routes = (
    <Switch>
      <Route path="/customer/login" component={CustomerLogin} />
      <Route path="/customer/reset-password" component={CustomerPasswordReset} />
      <Route path="/customer/submit" component={CustomerSubmitJob} />
      <Route path="/customer/pending" component={CustomerPendingJobs} />
      <Route path="/customer/job/:id" component={CustomerJobDetail} />
      <Route path="/customer/documents" component={CustomerDocuments} />
      <Route path="/customer/messages" component={CustomerInbox} />
      <Route path="/customer/team" component={CustomerTeam} />
      <Route path="/customer/invoices" component={CustomerInvoices} />
      <Route path="/customer/samples" component={CustomerSamples} />
      <Route path="/customer/payment-methods" component={CustomerPaymentMethods} />
      <Route path="/customer/delivery-address" component={CustomerDeliveryAddress} />
      <Route path="/customer/knowledge-centre/:slug" component={CustomerKnowledgeCentre} />
      <Route path="/customer/knowledge-centre" component={CustomerKnowledgeCentre} />
      <Route path="/customer/thread-library" component={CustomerThreadLibrary} />
      <Route path="/customer/dashboard" component={CustomerDashboard} />
      <Route path="/customer" component={CustomerDashboard} />
      <Route component={NotFound} />
    </Switch>
  );

  return isPublicCustomerRoute ? routes : <CustomerAuthGate>{routes}</CustomerAuthGate>;
}

function CustomerAuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "authenticated">("checking");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/customer-auth/user", { credentials: "include" })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setStatus("authenticated");
          return;
        }
        const returnPath = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/customer/login?redirect=${encodeURIComponent(returnPath)}`);
      })
      .catch(() => {
        if (!cancelled) {
          const returnPath = `${window.location.pathname}${window.location.search}`;
          window.location.replace(`/customer/login?redirect=${encodeURIComponent(returnPath)}`);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (status === "checking") return <PageLoading />;
  return <>{children}</>;
}

function AuthenticatedApp({ style }: { style: Record<string, string> }) {
  const { isAuthenticated, isLoading, user, isStaffImpersonating, realUser } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();
  const isMarketingHostname =
    window.location.hostname === "www.selectbranding.co.uk" ||
    window.location.hostname === "selectbranding.co.uk";

  // If the URL is a customer portal path, render the customer portal without staff chrome.
  // This handles client-side navigation to /customer/... while the staff app is mounted.
  if (!isLoading && location.startsWith("/customer/")) {
    return <CustomerPortalApp />;
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Keep the public website on the marketing domain. The production domain is
    // the operational portal, so anonymous visitors there must see staff login.
    if (location === "/" && isMarketingHostname) {
      return <DemoAccess publicNav />;
    }
    return <StaffLogin />;
  }

  const isDemoMode = user?.role === "demo";

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/staff-auth/logout", {});
      window.location.href = "/";
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <DemoModeContext.Provider value={isDemoMode}>
      <SidebarProvider defaultOpen={true} style={style as React.CSSProperties}>
        <div className="flex h-screen h-dvh w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            {isDemoMode && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 shrink-0" data-testid="banner-demo-mode">
                <FlaskConical className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Demo Mode — Customer names and financial figures have been anonymised
                </p>
              </div>
            )}
            {isStaffImpersonating && user && realUser && (
              <StaffImpersonationBanner impersonatedUser={user as any} realUser={realUser as any} />
            )}
            <header className="flex items-center justify-between p-3 md:p-4 border-b sticky top-0 bg-background z-10 gap-2">
              <div className="flex items-center gap-2 md:gap-3">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
              </div>
              <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid="button-user-menu">
                      <Avatar className="h-7 w-7 md:h-8 md:w-8">
                        <AvatarImage src={user?.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {user?.email?.[0]?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={handleLogout}
                      data-testid="button-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <main className="flex-1 overflow-hidden">
              <StaffRouter />
            </main>
          </div>
          {user && <AppDownloadModal userId={user.id} />}
        </div>
        {!isDemoMode && !isStaffImpersonating && (
          <MobileInstallBanner description="Pin the production dashboard to your taskbar for instant access — no App Store needed." />
        )}
      </SidebarProvider>
    </DemoModeContext.Provider>
  );
}
