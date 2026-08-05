import { Plus, Trash2, Pencil, UserX, UserCheck, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StaffFormDialog } from "@/components/StaffFormDialog";
import { CasualStaffManager } from "@/components/CasualStaffManager";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

export default function StaffPage() {
  const { toast } = useToast();
  const [staffToDelete, setStaffToDelete] = useState<string | null>(null);
  const [staffToEdit, setStaffToEdit] = useState<Staff | null>(null);
  const [staffToInvite, setStaffToInvite] = useState<Staff | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: staffData = [], isLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  // Sort staff alphabetically by name, active members first
  const staff = [...staffData].sort((a, b) => {
    const aActive = a.active !== false;
    const bActive = b.active !== false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (!a.name || !b.name) return 0;
    return a.name.localeCompare(b.name);
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/staff", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: "Success",
        description: "Staff member added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add staff member",
        variant: "destructive",
      });
    },
  });

  const updateStaffMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/staff/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: "Success",
        description: "Staff member updated successfully",
      });
      setStaffToEdit(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update staff member",
        variant: "destructive",
      });
    },
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/staff/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: "Success",
        description: "Staff member deleted successfully",
      });
      setStaffToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete staff member",
        variant: "destructive",
      });
      setStaffToDelete(null);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const res = await apiRequest("POST", `/api/staff/${id}/app-invite`, { email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: "Invite sent",
        description: "They've been emailed a set-password link and instructions for adding the app to their phone.",
      });
      setStaffToInvite(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Could not send invite",
        description: error.message || "Failed to send app invite",
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/staff/${id}`, { active });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: variables.active ? "Staff member re-enabled" : "Staff member disabled",
        description: variables.active
          ? "They can be assigned to work again."
          : "They're hidden from assignment lists, but all their history is kept.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update staff member",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string) => {
    setStaffToDelete(id);
  };

  const confirmDelete = () => {
    if (staffToDelete) {
      deleteStaffMutation.mutate(staffToDelete);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Regular Staff</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your permanent team members
            </p>
          </div>
          <StaffFormDialog
            trigger={
              <Button data-testid="button-add-staff">
                <Plus className="h-4 w-4 mr-2" />
                Add Staff Member
              </Button>
            }
            onSubmit={(data) => createStaffMutation.mutate(data)}
          />
        </div>

        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Staff Name
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-muted-foreground">
                      No staff members found. Click 'Add Staff Member' to create one.
                    </td>
                  </tr>
                ) : (
                  staff.map((staffMember) => {
                    const isActive = staffMember.active !== false;
                    return (
                    <tr key={staffMember.id} className={`hover-elevate ${isActive ? "" : "opacity-60"}`} data-testid={`row-staff-${staffMember.id}`}>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{staffMember.name}</span>
                          {!isActive && (
                            <Badge variant="secondary" data-testid={`badge-inactive-${staffMember.id}`}>Disabled</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setStaffToEdit(staffMember)}
                            data-testid={`button-edit-staff-${staffMember.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate({ id: staffMember.id, active: !isActive })}
                            disabled={toggleActiveMutation.isPending}
                            data-testid={`button-toggle-active-${staffMember.id}`}
                          >
                            {isActive ? (
                              <><UserX className="h-4 w-4 mr-1" /> Disable</>
                            ) : (
                              <><UserCheck className="h-4 w-4 mr-1" /> Re-enable</>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setStaffToInvite(staffMember);
                              setInviteEmail(staffMember.email || "");
                            }}
                            data-testid={`button-invite-staff-${staffMember.id}`}
                          >
                            <Smartphone className="h-4 w-4 mr-1" /> App invite
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(staffMember.id)}
                            data-testid={`button-delete-staff-${staffMember.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog open={staffToInvite !== null} onOpenChange={(open) => !open && setStaffToInvite(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Send app invite{staffToInvite ? ` to ${staffToInvite.name}` : ""}</DialogTitle>
              <DialogDescription>
                They'll get an email explaining what the app is for, a link to set their password,
                and instructions for adding it to their phone's home screen. Their login is created
                automatically if they don't have one yet.
              </DialogDescription>
            </DialogHeader>
            <div>
              <label className="text-sm font-medium block mb-1">Their email address</label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                data-testid="input-invite-email"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStaffToInvite(null)}>Cancel</Button>
              <Button
                onClick={() => staffToInvite && inviteMutation.mutate({ id: staffToInvite.id, email: inviteEmail.trim() })}
                disabled={inviteMutation.isPending || !inviteEmail.includes("@")}
                data-testid="button-send-invite"
              >
                {inviteMutation.isPending ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={staffToDelete !== null} onOpenChange={(open) => !open && setStaffToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
              <AlertDialogDescription>
                Deleting permanently removes this person's production history — their completed
                work records, leaderboard stats, shifts, and holidays will all be erased. This
                cannot be undone.
                <br /><br />
                If they've left the company, use <strong>Disable</strong> instead — that hides
                them from assignment lists but keeps all their history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {staffToEdit && (
          <StaffFormDialog
            open={true}
            onOpenChange={(open) => !open && setStaffToEdit(null)}
            staff={staffToEdit}
            onSubmit={(data) => updateStaffMutation.mutate({ id: staffToEdit.id, data })}
          />
        )}

        <div className="mt-10">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Casual Staff</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Add casual workers who claim machine shifts on their phones. They're separate from your regular team above.
            </p>
          </div>
          <CasualStaffManager />
        </div>
      </div>
    </div>
  );
}
