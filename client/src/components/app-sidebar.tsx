import { Home, ClipboardList, Cog, Users, UserCog, Calendar, ShieldCheck, Trophy, FileText, Inbox, BarChart3, CalendarClock, MessageSquare, Package, Settings, Sparkles, MonitorSmartphone, Lightbulb, CheckSquare, Palette, Sun, Tv, ShoppingCart, Mail } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { isSuperAdmin, canViewPrices, canViewReports } from "@shared/schema";
import type { Machine } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import type { Job } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef } from "react";
import { FeatureRequestDialog } from "@/components/FeatureRequestDialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation as useWouterLocation } from "wouter";
import logoImage from "@assets/logo_transparent.png";

const menuItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "All Orders", url: "/orders", icon: ClipboardList },
  { title: "Holding Area", url: "/holding-area", icon: Inbox },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
  { title: "Samples", url: "/samples", icon: Package },
  { title: "Invoicing", url: "/invoicing", icon: FileText },
  { title: "Schedule", url: "/schedule", icon: Calendar },
  { title: "Holidays", url: "/holidays", icon: CalendarClock },
  { title: "Leaderboard", url: "/leaderboard", icon: Trophy },
  { title: "Weekly Reports", url: "/reports/weekly", icon: BarChart3 },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Staff", url: "/staff", icon: UserCog },
  { title: "Casual Shifts", url: "/summer-shifts", icon: Sun },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [, navigate] = useWouterLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const isUserSuperAdmin = isSuperAdmin(user?.role);
  const userCanViewPrices = canViewPrices(user?.role);
  const { isMobile, setOpenMobile } = useSidebar();
  const [featureDialogOpen, setFeatureDialogOpen] = useState(false);
  const prevUnreadRef = useRef<number | null>(null);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const { data: pendingJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/staff/jobs/pending"],
    refetchInterval: 30000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/staff/messages/unread-count"],
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const { data: taskCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/tasks/count"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    refetchInterval: 60000,
  });

  const pendingCount = pendingJobs.length;
  const unreadMessageCount = unreadData?.count ?? 0;
  const openTaskCount = taskCountData?.count ?? 0;

  // Show a toast notification when new unread messages arrive while not on the Messages page
  useEffect(() => {
    const count = unreadData?.count ?? 0;
    if (prevUnreadRef.current !== null && count > prevUnreadRef.current && location !== "/messages") {
      const newCount = count - prevUnreadRef.current;
      toast({
        title: `${newCount} new message${newCount > 1 ? "s" : ""}`,
        description: "Click to go to Messages",
        action: (
          <button
            className="text-sm font-medium underline"
            onClick={() => navigate("/messages")}
          >
            View
          </button>
        ) as any,
        duration: 6000,
      });
    }
    prevUnreadRef.current = count;
  }, [unreadData?.count, location, toast, navigate]);

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-2 border-b flex-shrink-0">
        <Link href="/" onClick={handleNavClick} data-testid="link-logo-home">
          <img
            src={logoImage}
            alt="Select Branding Solutions"
            className="w-full object-contain"
            data-testid="logo-sidebar"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto" style={{ overflowY: 'auto' }}>
        <SidebarGroup>
          <SidebarGroupLabel>Production Manager</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems
                .filter(item => {
                  if (item.url === "/invoicing") {
                    return userCanViewPrices;
                  }
                  if (item.url === "/reports/weekly") {
                    return canViewReports(user?.role);
                  }
                  return true;
                })
                .map((item) => {
                  const holdingBadgeCount = item.url === "/holding-area" ? pendingCount : 0;
                  const messagesBadgeCount = item.url === "/messages" ? unreadMessageCount : 0;
                  const tasksBadgeCount = item.url === "/tasks" ? openTaskCount : 0;
                  const destructiveBadgeCount = holdingBadgeCount || messagesBadgeCount;
                  const secondaryBadgeCount = tasksBadgeCount;

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={location === item.url}>
                        <Link href={item.url} onClick={handleNavClick} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
                          <div className="relative flex-shrink-0">
                            <item.icon className="h-4 w-4" />
                            {destructiveBadgeCount > 0 && (
                              <span
                                className="hidden group-data-[collapsible=icon]:flex absolute -top-1.5 -right-1.5 h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-0.5"
                                data-testid={`badge-icon-${item.url.replace('/', '')}`}
                              >
                                {destructiveBadgeCount > 99 ? "99+" : destructiveBadgeCount}
                              </span>
                            )}
                            {secondaryBadgeCount > 0 && (
                              <span
                                className="hidden group-data-[collapsible=icon]:flex absolute -top-1.5 -right-1.5 h-4 min-w-4 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold px-0.5"
                                data-testid={`badge-icon-tasks`}
                              >
                                {secondaryBadgeCount > 99 ? "99+" : secondaryBadgeCount}
                              </span>
                            )}
                          </div>
                          <span className="flex-1">{item.title}</span>
                          {holdingBadgeCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="ml-auto h-5 min-w-5 px-1.5 text-xs group-data-[collapsible=icon]:hidden"
                              data-testid="badge-holding-area-count"
                            >
                              {holdingBadgeCount}
                            </Badge>
                          )}
                          {messagesBadgeCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="ml-auto h-5 min-w-5 px-1.5 text-xs group-data-[collapsible=icon]:hidden"
                              data-testid="badge-messages-unread-count"
                            >
                              {messagesBadgeCount}
                            </Badge>
                          )}
                          {tasksBadgeCount > 0 && (
                            <Badge
                              variant="secondary"
                              className="ml-auto h-5 min-w-5 px-1.5 text-xs group-data-[collapsible=icon]:hidden"
                              data-testid="badge-tasks-open-count"
                            >
                              {tasksBadgeCount}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              {isUserSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/users"}>
                    <Link href="/users" onClick={handleNavClick} data-testid="link-user-management">
                      <ShieldCheck className="h-4 w-4" />
                      <span>User Management</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isUserSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/dashboard-tv-setup"}>
                    <Link href="/dashboard-tv-setup" onClick={handleNavClick} data-testid="link-dashboard-tv-setup">
                      <Tv className="h-4 w-4" />
                      <span>TV Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isUserSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/email-customers"}>
                    <Link href="/email-customers" onClick={handleNavClick} data-testid="link-email-customers">
                      <Mail className="h-4 w-4" />
                      <span>Email Customers</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Resources</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/thread-library"}>
                  <Link href="/thread-library" onClick={handleNavClick} data-testid="link-thread-library">
                    <Palette className="h-4 w-4" />
                    <span>Thread Colours</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/purchasing"}>
                  <Link href="/purchasing" onClick={handleNavClick} data-testid="link-purchasing">
                    <ShoppingCart className="h-4 w-4" />
                    <span>Purchasing</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Machines</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/machines"}>
                  <Link href="/machines" onClick={handleNavClick} data-testid="link-machine-settings">
                    <Settings className="h-4 w-4" />
                    <span>Machine Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {machines.map((machine) => (
                <SidebarMenuItem key={machine.id}>
                  <SidebarMenuButton asChild isActive={location === `/machine/${machine.id}`}>
                    <Link href={`/machine/${machine.id}`} onClick={handleNavClick} data-testid={`link-machine-${machine.id}`}>
                      <div className="relative flex-shrink-0">
                        <Cog className="h-4 w-4" />
                        <span
                          className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-sidebar-background ${machine.isActive ? "bg-green-500" : "bg-muted-foreground"}`}
                          title={machine.isActive ? "Online" : "Offline"}
                        />
                      </div>
                      <span className={machine.isActive ? "" : "text-muted-foreground"}>{machine.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setFeatureDialogOpen(true)} data-testid="button-suggest-feature">
              <Lightbulb className="h-4 w-4" />
              <span>Suggest a Feature</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isUserSuperAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/feature-requests" onClick={handleNavClick} data-testid="link-feature-requests">
                  <Settings className="h-4 w-4" />
                  <span>Feature Requests</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/demo-access" onClick={handleNavClick} data-testid="link-landing-page">
                <Sparkles className="h-4 w-4" />
                <span>Landing Page</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/portal-preview" onClick={handleNavClick} data-testid="link-portal-preview">
                <MonitorSmartphone className="h-4 w-4" />
                <span>Portal Preview</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <FeatureRequestDialog
        open={featureDialogOpen}
        onOpenChange={setFeatureDialogOpen}
        submitterType="staff"
        endpoint="/api/feature-requests"
      />
    </Sidebar>
  );
}
