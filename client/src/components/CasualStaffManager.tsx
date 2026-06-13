import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Copy, Send, Trash2 } from "lucide-react";

interface CasualStaffRow {
  id: string;
  firstName: string;
  lastName?: string | null;
  mobileNumber: string;
  active: boolean;
  hasPin: boolean;
  inviteSentAt?: string | null;
  staffId?: string | null;
}

interface StaffRow {
  id: string;
  name: string;
}

const NONE = "__none__";

export function CasualStaffManager() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [staffId, setStaffId] = useState<string>(NONE);
  const [inviteLink, setInviteLink] = useState<{ url: string; whatsappSent: boolean } | null>(null);

  const { data: staff = [], isLoading } = useQuery<CasualStaffRow[]>({ queryKey: ["/api/casual-staff"] });
  const { data: allocationStaff = [] } = useQuery<StaffRow[]>({ queryKey: ["/api/staff"] });
  const staffName = (id?: string | null) => (id ? allocationStaff.find((s) => s.id === id)?.name : undefined);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/casual-staff"] });

  const addMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/casual-staff", {
      firstName, lastName, mobileNumber, staffId: staffId === NONE ? null : staffId,
    })).json(),
    onSuccess: () => {
      setFirstName(""); setLastName(""); setMobileNumber(""); setStaffId(NONE);
      toast({ title: "Casual staff added", description: "Send them an invite link when you're ready." });
      refresh();
    },
    onError: (err: any) => toast({ title: "Couldn't add", description: err.message, variant: "destructive" }),
  });

  const linkMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      await apiRequest("PATCH", `/api/casual-staff/${id}`, { staffId: value === NONE ? null : value });
    },
    onSuccess: () => { toast({ title: "Regular shifts updated" }); refresh(); },
    onError: (err: any) => toast({ title: "Couldn't update", description: err.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/casual-staff/${id}/invite`, {})).json(),
    onSuccess: (res: any) => setInviteLink({ url: res.inviteUrl, whatsappSent: res.whatsappSent }),
    onError: (err: any) => toast({ title: "Couldn't create link", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => { await apiRequest("PATCH", `/api/casual-staff/${id}`, { active }); },
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/casual-staff/${id}`); },
    onSuccess: () => { toast({ title: "Removed" }); refresh(); },
  });

  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Paste it into WhatsApp or a text message." });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add casual staff</CardTitle>
          <CardDescription>Add them with a mobile number. They won't be invited until you choose to send an invite link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-4 md:items-end"
            onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="casual-fn">First name</Label>
              <Input id="casual-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required data-testid="input-casual-first-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="casual-ln">Last name</Label>
              <Input id="casual-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-casual-last-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="casual-mob">Mobile number</Label>
              <Input id="casual-mob" type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} required placeholder="07123 456789" data-testid="input-casual-mobile-number" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="casual-staff-link">Regular shifts as (optional)</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger id="casual-staff-link" data-testid="select-casual-staff-link">
                  <SelectValue placeholder="Not linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} data-testid="option-staff-link-none">Not linked</SelectItem>
                  {allocationStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id} data-testid={`option-staff-link-${s.id}`}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Links this login to a person in Staff Machine Allocations so they see their regular shifts.</p>
            </div>
            <Button type="submit" disabled={addMutation.isPending} data-testid="button-add-casual-staff">
              {addMutation.isPending ? "Adding..." : "Add casual staff"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Casual staff ({staff.length})</CardTitle>
          <CardDescription>These people claim machine shifts on their phones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : staff.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground" data-testid="text-no-casual-staff">No casual staff yet. Add someone above.</p>
          ) : (
            staff.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3" data-testid={`row-casual-staff-${m.id}`}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {m.firstName} {m.lastName}
                    <Badge variant="outline">Casual</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{m.mobileNumber}</p>
                  <p className="text-xs text-muted-foreground" data-testid={`text-staff-link-${m.id}`}>
                    Regular shifts: {staffName(m.staffId) ?? "Not linked"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={m.staffId ?? NONE} onValueChange={(v) => linkMutation.mutate({ id: m.id, value: v })}>
                    <SelectTrigger className="w-[160px]" data-testid={`select-staff-link-${m.id}`}>
                      <SelectValue placeholder="Not linked" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} data-testid={`option-row-link-none-${m.id}`}>Not linked</SelectItem>
                      {allocationStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id} data-testid={`option-row-link-${m.id}-${s.id}`}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {m.hasPin ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Awaiting PIN</Badge>}
                  {!m.active && <Badge variant="destructive">Disabled</Badge>}
                  <Button variant="outline" size="sm" onClick={() => inviteMutation.mutate(m.id)} disabled={inviteMutation.isPending} data-testid={`button-invite-${m.id}`}>
                    <Send className="mr-1.5 h-3.5 w-3.5" />{m.inviteSentAt || m.hasPin ? "Re-invite" : "Invite"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: m.id, active: !m.active })} data-testid={`button-toggle-${m.id}`}>
                    {m.active ? "Disable" : "Enable"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-delete-casual-staff-${m.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {m.firstName}?</AlertDialogTitle>
                        <AlertDialogDescription>This removes their login. Any shifts they've booked will be freed up.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(m.id)}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!inviteLink} onOpenChange={(o) => !o && setInviteLink(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite link ready</DialogTitle>
            <DialogDescription>
              {inviteLink?.whatsappSent
                ? "We sent this via WhatsApp. You can also copy it to share another way."
                : "Copy this link and send it to them on WhatsApp or by text."}
            </DialogDescription>
          </DialogHeader>
          {inviteLink && (
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteLink.url} className="text-xs" data-testid="input-invite-link" />
              <Button size="icon" onClick={() => copy(inviteLink.url)} data-testid="button-copy-link"><Copy className="h-4 w-4" /></Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setInviteLink(null)} data-testid="button-close-invite">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
