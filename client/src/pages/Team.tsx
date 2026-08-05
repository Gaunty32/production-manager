import { useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { isSuperAdmin } from "@shared/schema";
import StaffSection from "@/pages/Staff";
import UsersSection from "@/pages/Users";
import { CasualStaffManager } from "@/components/CasualStaffManager";

const VALID_TABS = ["staff", "casual", "logins"] as const;
type TeamTab = (typeof VALID_TABS)[number];

export default function TeamPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user?.role);
  const search = useSearch();
  const [, navigate] = useLocation();
  // The tab is a pure function of the URL: missing/invalid values fall back
  // to "staff", and "logins" is only honoured for super admins.
  const requested = new URLSearchParams(search).get("tab") as TeamTab | null;
  const tab: TeamTab =
    requested && VALID_TABS.includes(requested) && !(requested === "logins" && !superAdmin)
      ? requested
      : "staff";

  // If the URL claims a tab the viewer can't see (or an invalid one), rewrite
  // it so refresh/back behaviour matches what's on screen.
  useEffect(() => {
    if (requested && requested !== tab) {
      navigate(`/team?tab=${tab}`, { replace: true });
    }
  }, [requested, tab, navigate]);

  const changeTab = (value: string) => {
    navigate(`/team?tab=${value}`, { replace: true });
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Staff members, casual workers, and who can log in
          </p>
        </div>
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="staff" data-testid="tab-team-staff">Staff</TabsTrigger>
            <TabsTrigger value="casual" data-testid="tab-team-casual">Casual Staff</TabsTrigger>
            {superAdmin && (
              <TabsTrigger value="logins" data-testid="tab-team-logins">Logins &amp; Roles</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="staff">
            <StaffSection />
          </TabsContent>
          <TabsContent value="casual">
            <CasualStaffManager />
          </TabsContent>
          {superAdmin && (
            <TabsContent value="logins">
              <UsersSection />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
