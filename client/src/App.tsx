import { Switch, Route, useLocation } from "wouter";
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
import Landing from "@/pages/Landing";
import CustomerLogin from "@/pages/CustomerLogin";
import CustomerDashboard from "@/pages/CustomerDashboard";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";
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

function Router() {
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
      <Route path="/invoicing"><InvoicingQueue /></Route>
      <Route path="/machine/:id"><Dashboard /></Route>
      <Route><NotFound /></Route>
    </Switch>
  );
}

export default function App() {
  const [location] = useLocation();
  // Fix: Only match /customer/* routes, not /customers
  const isCustomerPortal = location.startsWith("/customer/") || location === "/customer";
  
  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          {isCustomerPortal ? (
            <CustomerPortalApp />
          ) : (
            <AuthenticatedApp style={style} />
          )}
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
      <Route path="/customer/dashboard" component={CustomerDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp({ style }: { style: Record<string, string> }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Always show the full app with sidebar (guest access enabled)
  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2 ml-2" data-testid="app-logo">
                <img 
                  src={logoImage} 
                  alt="Select Uniforms" 
                  className="h-8 object-contain"
                  data-testid="logo-icon"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid="button-user-menu">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {user?.email?.[0]?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => window.location.href = "/api/logout"}
                      data-testid="button-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => window.location.href = "/api/login"}
                  data-testid="button-login-header"
                >
                  Sign In
                </Button>
              )}
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
