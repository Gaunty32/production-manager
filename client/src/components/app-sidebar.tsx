import { Home, ClipboardList, Cog, Users, UserCog, Calendar, ShieldCheck, Trophy, FileText, Inbox, Monitor, BarChart3, CalendarClock, MessageSquare, Package, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
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
import { isSuperAdmin, canViewPrices } from "@shared/schema";
import type { Machine } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import type { Job } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import logoImage from "@assets/logo_transparent.png";

const menuItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "All Orders", url: "/orders", icon: ClipboardList },
  { title: "Holding Area", url: "/holding-area", icon: Inbox },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Samples", url: "/samples", icon: Package },
  { title: "Invoicing", url: "/invoicing", icon: FileText },
  { title: "Schedule", url: "/schedule", icon: Calendar },
  { title: "Holidays", url: "/holidays", icon: CalendarClock },
  { title: "Leaderboard", url: "/leaderboard", icon: Trophy },
  { title: "Weekly Reports", url: "/reports/weekly", icon: BarChart3 },
  { title: "Production Display", url: "/production-display", icon: Monitor },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Staff", url: "/staff", icon: UserCog },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isUserSuperAdmin = isSuperAdmin(user?.role);
  const userCanViewPrices = canViewPrices(user?.role);
  const { isMobile, setOpenMobile } = useSidebar();

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const { data: pendingJobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/staff/jobs/pending"],
    refetchInterval: 30000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/staff/messages/unread-count"],
    refetchInterval: 15000,
  });

  const { data: machines = [] } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    refetchInterval: 60000,
  });

  const pendingCount = pendingJobs.length;
  const unreadMessageCount = unreadData?.count ?? 0;

  return (
    <Sidebar>
      <SidebarHeader className="p-2 border-b flex-shrink-0">
        <Link href="/" onClick={handleNavClick} data-testid="link-logo-home">
          <img
            src={logoImage}
            alt="Select Branding Solutions"
            className="w-full object-contain"
            style={{ maxHeight: "56px" }}
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
                  if (item.url === "/invoicing" || item.url === "/reports/weekly") {
                    return userCanViewPrices;
                  }
                  return true;
                })
                .map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url} onClick={handleNavClick} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.url === "/holding-area" && pendingCount > 0 && (
                          <Badge 
                            variant="destructive" 
                            className="ml-auto h-5 min-w-5 px-1.5 text-xs"
                            data-testid="badge-holding-area-count"
                          >
                            {pendingCount}
                          </Badge>
                        )}
                        {item.url === "/messages" && unreadMessageCount > 0 && (
                          <Badge
                            variant="destructive"
                            className="ml-auto h-5 min-w-5 px-1.5 text-xs"
                            data-testid="badge-messages-unread-count"
                          >
                            {unreadMessageCount}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
    </Sidebar>
  );
}
