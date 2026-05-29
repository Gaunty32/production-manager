import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImageCropDialog } from "@/components/ImageCropDialog";
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
import { ArrowLeft, UserPlus, Mail, UserCheck, UserX, Users, Camera, Trash2 } from "lucide-react";
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
  const [addDialogError, setAddDialogError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [uploadingForId, setUploadingForId] = useState<string | null>(null);
  const [isUploadingPic, setIsUploadingPic] = useState(false);
  const picInputRef = useRef<HTMLInputElement>(null);

  const { data: me } = useQuery<{ id: string }>({ queryKey: ["/api/customer-portal/me"] });

  const { data: team = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/customer-portal/team"],
  });

  const addForm = useForm<z.infer<typeof addMemberSchema>>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { firstName: "", lastName: "", email: "" },
  });

  const addMutation = useMutation({
    mutationFn: (data: z.infer<typeof addMemberSchema>) =>
      apiRequest("POST", "/api/customer-portal/team", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/team"] });
      toast({ title: "Invitation sent", description: "They'll receive an email to set their password and access the portal." });
      setShowAdd(false);
      setAddDialogError(null);
      addForm.reset();
    },
    onError: (e: any) => {
      const msg = e.message || "Failed to add team member";
      if (msg.toLowerCase().includes("already a member")) {
        setAddDialogError("This person is already a member of your team. You can resend their invite link using the button next to their name in the list below.");
      } else {
        setAddDialogError(msg);
      }
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

  const sendInviteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/customer-portal/team/${id}/send-invite`, {}),
    onSuccess: () => {
      toast({ title: "Reset link sent", description: "They'll receive an email with a link to set a new password." });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to send reset link", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/customer-portal/team/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/team"] });
      setConfirmDeleteId(null);
      toast({ title: "Team member removed" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message || "Failed to remove team member", variant: "destructive" });
    },
  });

  const openPickerForMember = (memberId: string) => {
    setUploadingForId(memberId);
    picInputRef.current?.click();
  };

  const handlePicFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingCropFile(file);
    if (picInputRef.current) picInputRef.current.value = "";
  };

  const handleCropConfirm = async (blob: Blob) => {
    setPendingCropFile(null);
    setIsUploadingPic(true);
    try {
      const uploadRes = await apiRequest("POST", "/api/customer-portal/objects/upload", {});
      const { url, key } = await uploadRes.json();
      await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      const normalizedKey = key.startsWith("/api/img") ? key : `/api/img${key.replace("/objects", "")}`;
      const isOwnPic = !uploadingForId || uploadingForId === me?.id;
      if (isOwnPic) {
        await apiRequest("PUT", "/api/customer-portal/me/profile-picture", { profileImageUrl: normalizedKey });
      } else {
        await apiRequest("PUT", `/api/customer-portal/team/${uploadingForId}/profile-picture`, { profileImageUrl: normalizedKey });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/team"] });
      toast({ title: "Profile picture updated" });
    } catch {
      toast({ title: "Failed to upload profile picture", variant: "destructive" });
    } finally {
      setIsUploadingPic(false);
      setUploadingForId(null);
    }
  };

  return (
    <div style={{ minHeight: "100dvh" }} className="bg-background flex flex-col">
      <ImpersonationBanner />

      {/* Hidden file input */}
      <input
        ref={picInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePicFileSelect}
        data-testid="input-profile-pic"
      />
      <ImageCropDialog
        file={pendingCropFile}
        onConfirm={handleCropConfirm}
        onCancel={() => setPendingCropFile(null)}
      />

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
                    <button
                      type="button"
                      className="relative h-11 w-11 flex-shrink-0 rounded-full group focus:outline-none"
                      onClick={() => openPickerForMember(member.id)}
                      disabled={isUploadingPic}
                      title="Change profile picture"
                      data-testid={`button-change-avatar-${member.id}`}
                    >
                      <Avatar className="h-11 w-11">
                        {member.profileImageUrl && <AvatarImage src={member.profileImageUrl} />}
                        <AvatarFallback className="text-sm font-semibold">{getInitials(member)}</AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="h-4 w-4 text-white" />
                      </div>
                    </button>

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
                          title="Send password reset link"
                          data-testid={`button-reset-${member.id}`}
                          onClick={() => sendInviteMutation.mutate(member.id)}
                          disabled={sendInviteMutation.isPending}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          title="Remove team member"
                          data-testid={`button-delete-${member.id}`}
                          onClick={() => setConfirmDeleteId(member.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove{" "}
            <span className="font-medium text-foreground">
              {confirmDeleteId ? getFullName(team.find(m => m.id === confirmDeleteId)!) : ""}
            </span>{" "}
            from your team. They will no longer be able to access the portal.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) { setAddDialogError(null); addForm.reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            They'll receive an email with a link to set their own password and access the portal.
          </p>
          {addDialogError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {addDialogError}
            </div>
          )}
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(d => { setAddDialogError(null); addMutation.mutate(d); })} className="space-y-4">
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={addMutation.isPending} data-testid="button-save-member">
                  {addMutation.isPending ? "Sending invite…" : "Send Invitation"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
