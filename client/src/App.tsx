import { Switch, Route, useLocation, Router } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import StaffPage from "@/pages/Staff";
import UsersPage from "@/pages/Users";
import Schedule from "@/pages/Schedule";
import Leaderboard from "@/pages/Leaderboard";
import InvoicingQueue from "@/pages/InvoicingQueue";
import StaffHoldingArea from "@/pages/StaffHoldingArea";
import StaffJobDetail from "@/pages/StaffJobDetail";
import ProductionDisplay from "@/pages/ProductionDisplay";
import Landing from "@/pages/Landing";
import CustomerLogin from "@/pages/CustomerLogin";
import StaffLogin from "@/pages/StaffLogin";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import CustomerDashboard from "@/pages/CustomerDashboard";
import CustomerSubmitJob from "@/pages/CustomerSubmitJob";
import CustomerPendingJobs from "@/pages/CustomerPendingJobs";
import CustomerJobDetail from "@/pages/CustomerJobDetail";
import CustomerPasswordReset from "@/pages/CustomerPasswordReset";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/Selectuniforms960_1759932224049.jpg";

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
      <Route path="/staff"><StaffPage /></Route>
      <Route path="/users"><UsersPage /></Route>
      <Route path="/schedule"><Schedule /></Route>
      <Route path="/leaderboard"><Leaderboard /></Route>
      <Route path="/production-display"><ProductionDisplay /></Route>
      <Route path="/invoicing"><InvoicingQueue /></Route>
      <Route path="/holding-area"><StaffHoldingArea /></Route>
      <Route path="/staff/job/:id"><StaffJobDetail /></Route>
      <Route path="/machine/:id"><Dashboard /></Route>
      <Route><NotFound /></Route>
    </Switch>
  );
}

function AppRouter() {
  const [location] = useLocation();
  const isCustomerPortal = location.startsWith("/customer/") || location === "/customer";
  
  const style = {
    "--sidebar-width": "16rem",
  };

  if (isCustomerPortal) {
    return <CustomerPortalApp />;
  }

  return <AuthenticatedApp style={style} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Router>
            <AppRouter />
          </Router>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function CustomerPortalApp() {
  return (
    <Switch>
      <Route path="/customer/login" component={CustomerLogin} />
      <Route path="/customer/reset-password" component={CustomerPasswordReset} />
      <Route path="/customer/submit" component={CustomerSubmitJob} />
      <Route path="/customer/pending" component={CustomerPendingJobs} />
      <Route path="/customer/job/:id" component={CustomerJobDetail} />
      <Route path="/customer/dashboard" component={CustomerDashboard} />
      <Route path="/customer" component={CustomerDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp({ style }: { style: Record<string, string> }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Show password reset pages without authentication
  if (!isAuthenticated) {
    if (location === "/forgot-password") {
      return <ForgotPassword />;
    }
    if (location === "/reset-password" || location.startsWith("/reset-password?")) {
      return <ResetPassword />;
    }
    return <StaffLogin />;
  }

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
    <SidebarProvider defaultOpen={false} style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between p-3 md:p-4 border-b sticky top-0 bg-background z-10 gap-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2 ml-1 md:ml-2 min-w-0" data-testid="app-logo">
                <img 
                  src={logoImage} 
                  alt="Select Uniforms" 
                  className="h-6 md:h-8 object-contain"
                  data-testid="logo-icon"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              <ThemeToggle />
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
      </div>
    </SidebarProvider>
  );
}
