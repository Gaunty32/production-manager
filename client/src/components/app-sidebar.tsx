import { Home, ClipboardList, Cog, Users, UserCog, Calendar, ShieldCheck, Trophy } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { MACHINE_NAMES } from "@shared/machines";
import { useAuth } from "@/hooks/useAuth";
import { isSuperAdmin } from "@shared/schema";

const menuItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "All Orders", url: "/orders", icon: ClipboardList },
  { title: "Schedule", url: "/schedule", icon: Calendar },
  { title: "Leaderboard", url: "/leaderboard", icon: Trophy },
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

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Production Manager</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isUserSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/users"}>
                    <Link href="/users" data-testid="link-user-management">
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
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
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
