import { Home, ClipboardList, Cog, Users, UserCog, Calendar, ShieldCheck, Trophy, FileText, Inbox, Monitor, BarChart3, CalendarClock, MessageSquare, Package } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { MACHINE_NAMES } from "@shared/machines";
import { useAuth } from "@/hooks/useAuth";
import { isSuperAdmin, canViewPrices } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import type { Job } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

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

const machineItems = [
  { title: MACHINE_NAMES[1], url: "/machine/1", icon: Cog },
  { title: MACHINE_NAMES[2], url: "/machine/2", icon: Cog },
  { title: MACHINE_NAMES[3], url: "/machine/3", icon: Cog },
  { title: MACHINE_NAMES[4], url: "/machine/4", icon: Cog },
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

  const pendingCount = pendingJobs.length;
  const unreadMessageCount = unreadData?.count ?? 0;

  return (
    <Sidebar>
      <SidebarContent>
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
              {machineItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} onClick={handleNavClick} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
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
