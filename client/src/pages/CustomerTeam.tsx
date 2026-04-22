import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, UserPlus, KeyRound, UserCheck, UserX, Users } from "lucide-react";
import { format } from "date-fns";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { usePermissions } from "@/hooks/usePermissions";

type TeamMember = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  active: boolean;
  profileImageUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

const addMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

function getInitials(member: TeamMember) {
  if (member.firstName && member.lastName) return `${member.firstName[0]}${member.lastName[0]}`.toUpperCase();
  if (member.firstName) return member.firstName.slice(0, 2).toUpperCase();
  return member.email.slice(0, 2).toUpperCase();
}

function getFullName(member: TeamMember) {
  return [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
}

export default function CustomerTeam() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isImpersonating } = usePermissions();

  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);

  const { data: me } = useQuery<{ id: string }>({ queryKey: ["/api/customer-portal/me"] });

  const { data: team = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/customer-portal/team"],
  });

  const addForm = useForm<z.infer<typeof addMemberSchema>>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  const resetForm = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const addMutation = useMutation({
    mutationFn: (data: z.infer<typeof addMemberSchema>) =>
      apiRequest("POST", "/api/customer-portal/team", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/team"] });
      toast({ title: "Team member added", description: "They can now log in to the portal." });
      setShowAdd(false);
      addForm.reset();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to add team member", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/customer-portal/team/${id}/active`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/team"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to update access", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiRequest("POST", `/api/customer-portal/team/${id}/reset-password`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/team"] });
      toast({ title: "Password reset", description: "They will be asked to set a new password on next login." });
      setResetTarget(null);
      resetForm.reset();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to reset password", variant: "destructive" });
    },
  });

  return (
    <div style={{ minHeight: "100dvh" }} className="bg-background flex flex-col">
      <ImpersonationBanner />

      <div className="container mx-auto px-4 py-6 max-w-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/customer/dashboard")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">My Team</h1>
            <p className="text-sm text-muted-foreground">Manage who can access your customer portal</p>
          </div>
          <Button onClick={() => setShowAdd(true)} data-testid="button-add-member">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>

        {/* Team list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : team.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" />
            <p className="text-sm">No team members yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {team.map(member => {
              const isMe = me?.id === member.id;
              return (
                <Card key={member.id} data-testid={`card-member-${member.id}`}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-11 w-11 flex-shrink-0">
                      {member.profileImageUrl && <AvatarImage src={member.profileImageUrl} />}
                      <AvatarFallback className="text-sm font-semibold">{getInitials(member)}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{getFullName(member)}</span>
                        {isMe && <Badge variant="secondary" className="text-xs">You</Badge>}
                        <Badge variant={member.active ? "default" : "outline"} className="text-xs">
                          {member.active ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>
                      {member.lastLoginAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last login {format(new Date(member.lastLoginAt), "d MMM yyyy")}
                        </p>
                      )}
                    </div>

                    {!isMe && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          title={member.active ? "Disable access" : "Enable access"}
                          data-testid={`button-toggle-${member.id}`}
                          onClick={() => toggleMutation.mutate({ id: member.id, active: !member.active })}
                          disabled={toggleMutation.isPending}
                        >
                          {member.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          title="Reset password"
                          data-testid={`button-reset-${member.id}`}
                          onClick={() => { setResetTarget(member); resetForm.reset(); }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Member Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(d => addMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={addForm.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl><Input {...field} data-testid="input-first-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={addForm.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl><Input {...field} data-testid="input-last-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={addForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl><Input type="email" {...field} data-testid="input-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={addForm.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temporary Password</FormLabel>
                  <FormControl><Input type="password" {...field} data-testid="input-password" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={addMutation.isPending} data-testid="button-save-member">
                  {addMutation.isPending ? "Adding..." : "Add Member"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={v => { if (!v) setResetTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password — {resetTarget ? getFullName(resetTarget) : ""}</DialogTitle>
          </DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(d => resetMutation.mutate({ id: resetTarget!.id, password: d.password }))} className="space-y-4">
              <FormField control={resetForm.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl><Input type="password" {...field} data-testid="input-new-password" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={resetForm.control} name="confirmPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl><Input type="password" {...field} data-testid="input-confirm-password" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <p className="text-xs text-muted-foreground">They will be prompted to change this on their next login.</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={resetMutation.isPending} data-testid="button-confirm-reset">
                  {resetMutation.isPending ? "Saving..." : "Reset Password"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
