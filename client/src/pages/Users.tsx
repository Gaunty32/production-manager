import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { UserRole, type User } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus, Pencil, Mail, CheckCircle2, XCircle, KeyRound, Camera } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum([UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF]),
});

const editUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const setPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type CreateUserFormData = z.infer<typeof createUserSchema>;
type EditUserFormData = z.infer<typeof editUserSchema>;
type SetPasswordFormData = z.infer<typeof setPasswordSchema>;

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function Users() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [setPasswordDialogOpen, setSetPasswordDialogOpen] = useState(false);
  const [setPasswordUser, setSetPasswordUser] = useState<User | null>(null);
  const [uploadingProfileFor, setUploadingProfileFor] = useState<string | null>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const [profileTargetUserId, setProfileTargetUserId] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const handleProfilePhotoClick = (userId: string) => {
    setProfileTargetUserId(userId);
    if (profileInputRef.current) {
      profileInputRef.current.value = "";
      profileInputRef.current.click();
    }
  };

  const handleProfileImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profileTargetUserId) return;
    setUploadingProfileFor(profileTargetUserId);
    try {
      const uploadRes = await apiRequest("POST", "/api/staff/objects/upload", {});
      const { url, key } = await uploadRes.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
      const normalizedKey = `/objects${key.replace("/objects", "")}`;
      await apiRequest("PUT", `/api/users/${profileTargetUserId}/profile-picture`, { profileImageUrl: normalizedKey });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Profile picture updated" });
    } catch {
      toast({ title: "Failed to update profile picture", variant: "destructive" });
    } finally {
      setUploadingProfileFor(null);
      setProfileTargetUserId(null);
    }
  };

  const createUserForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      role: UserRole.STAFF,
    },
  });

  const editUserForm = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      username: "",
      email: "",
      firstName: "",
      lastName: "",
    },
  });

  const setPasswordForm = useForm<SetPasswordFormData>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/set-password`, { password });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Password updated", description: data.message });
      setSetPasswordDialogOpen(false);
      setPasswordForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to set password", variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User created",
        description: "New user account has been successfully created.",
      });
      setCreateDialogOpen(false);
      createUserForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Role updated",
        description: "User role has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  const editUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: EditUserFormData }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User updated",
        description: "User details have been successfully updated.",
      });
      setEditDialogOpen(false);
      setEditingUser(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRoleMutation.mutate({ userId, role: newRole });
  };

  const onCreateUser = (data: CreateUserFormData) => {
    createUserMutation.mutate(data);
  };

  const sendPasswordResetMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/users/${userId}/reset-password`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Password reset sent",
        description: data.message || "Password reset email has been sent to the user.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send password reset email",
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/active`, { active });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: variables.active ? "User activated" : "User deactivated",
        description: variables.active 
          ? "User account has been activated and can now log in."
          : "User account has been deactivated and can no longer log in.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user status",
        variant: "destructive",
      });
    },
  });

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    editUserForm.reset({
      username: user.username || "",
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
    });
    setEditDialogOpen(true);
  };

  const handleSendPasswordReset = (userId: string) => {
    sendPasswordResetMutation.mutate(userId);
  };

  const handleToggleActive = (userId: string, currentActive: boolean) => {
    toggleActiveMutation.mutate({ userId, active: !currentActive });
  };

  const onEditUser = (data: EditUserFormData) => {
    if (editingUser) {
      // Convert empty strings to undefined for optional fields
      const cleanedData = {
        username: data.username,
        email: data.email,
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
      };
      editUserMutation.mutate({ userId: editingUser.id, data: cleanedData });
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="text-muted-foreground">Manage user roles and permissions</p>
          </div>
          {currentUser?.role === UserRole.SUPER_ADMIN && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-user">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create User
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                  <DialogDescription>
                    Add a new staff member to the system
                  </DialogDescription>
                </DialogHeader>
                <Form {...createUserForm}>
                  <form onSubmit={createUserForm.handleSubmit(onCreateUser)} className="space-y-4">
                    <FormField
                      control={createUserForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="username"
                              data-testid="input-username"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createUserForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="user@example.com"
                              data-testid="input-email"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={createUserForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="John"
                                data-testid="input-firstname"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createUserForm.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Doe"
                                data-testid="input-lastname"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={createUserForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              data-testid="input-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createUserForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-role">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                              <SelectItem value={UserRole.MANAGER}>Manager</SelectItem>
                              <SelectItem value={UserRole.STAFF}>Staff</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCreateDialogOpen(false)}
                        data-testid="button-cancel"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createUserMutation.isPending}
                        data-testid="button-submit"
                      >
                        {createUserMutation.isPending ? "Creating..." : "Create User"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Hidden file input for profile picture upload */}
        <input
          ref={profileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleProfileImageSelect}
        />

        <Card>
          <CardHeader>
            <CardTitle>System Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users?.map((user) => {
                const displayName = user.firstName && user.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user.email || "Unknown User";
                return (
                <div 
                  key={user.id} 
                  className="flex flex-col gap-3 p-4 border rounded-lg"
                  data-testid={`user-row-${user.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Avatar with optional upload button */}
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
                          <AvatarFallback className="text-sm">{getInitials(displayName)}</AvatarFallback>
                        </Avatar>
                        {currentUser?.role === UserRole.SUPER_ADMIN && (
                          <button
                            className="absolute -bottom-1 -right-1 bg-background border border-border rounded-full p-0.5 hover-elevate"
                            onClick={() => handleProfilePhotoClick(user.id)}
                            disabled={uploadingProfileFor === user.id}
                            title="Change photo"
                            data-testid={`button-change-photo-${user.id}`}
                          >
                            <Camera className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium" data-testid={`user-name-${user.id}`}>
                            {displayName}
                          </div>
                          {user.active === false ? (
                            <Badge variant="destructive" className="text-xs" data-testid={`badge-inactive-${user.id}`}>
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-active-${user.id}`}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                          {user.id === currentUser?.id && (
                            <span className="text-xs text-muted-foreground">(You)</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate" data-testid={`user-email-${user.id}`}>
                          {user.email}
                        </div>
                      </div>
                    </div>
                    <Select
                      value={user.role}
                      onValueChange={(value) => handleRoleChange(user.id, value)}
                      disabled={user.id === currentUser?.id}
                    >
                      <SelectTrigger 
                        className="w-[180px]" 
                        data-testid={`select-role-${user.id}`}
                      >
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UserRole.SUPER_ADMIN}>Super Admin</SelectItem>
                        <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                        <SelectItem value={UserRole.MANAGER}>Manager</SelectItem>
                        <SelectItem value={UserRole.STAFF}>Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                      data-testid={`button-edit-user-${user.id}`}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendPasswordReset(user.id)}
                      disabled={sendPasswordResetMutation.isPending || !user.email}
                      data-testid={`button-reset-password-${user.id}`}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Send Password Reset
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSetPasswordUser(user);
                        setPasswordForm.reset();
                        setSetPasswordDialogOpen(true);
                      }}
                      data-testid={`button-set-password-${user.id}`}
                    >
                      <KeyRound className="h-4 w-4 mr-2" />
                      Set Password
                    </Button>
                    <div className="flex items-center gap-2 ml-auto">
                      <Label 
                        htmlFor={`active-toggle-${user.id}`}
                        className="text-sm cursor-pointer"
                      >
                        {user.active === false ? 'Activate' : 'Deactivate'}
                      </Label>
                      <Switch
                        id={`active-toggle-${user.id}`}
                        checked={user.active !== false}
                        onCheckedChange={() => handleToggleActive(user.id, user.active !== false)}
                        disabled={user.id === currentUser?.id || toggleActiveMutation.isPending}
                        data-testid={`switch-active-${user.id}`}
                      />
                    </div>
                  </div>
                </div>
              );
              })}
              {(!users || users.length === 0) && (
                <p className="text-center text-muted-foreground py-8">No users found.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information
              </DialogDescription>
            </DialogHeader>
            <Form {...editUserForm}>
              <form onSubmit={editUserForm.handleSubmit(onEditUser)} className="space-y-4">
                <FormField
                  control={editUserForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="username"
                          data-testid="input-edit-username"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editUserForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="user@example.com"
                          data-testid="input-edit-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editUserForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="John"
                            data-testid="input-edit-firstname"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editUserForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Doe"
                            data-testid="input-edit-lastname"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditDialogOpen(false)}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={editUserMutation.isPending}
                    data-testid="button-submit-edit"
                  >
                    {editUserMutation.isPending ? "Updating..." : "Update User"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Set Password Dialog */}
        <Dialog open={setPasswordDialogOpen} onOpenChange={setSetPasswordDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Set Password</DialogTitle>
              <DialogDescription>
                Directly set a new password for {setPasswordUser?.firstName || setPasswordUser?.username}. No email required.
              </DialogDescription>
            </DialogHeader>
            <Form {...setPasswordForm}>
              <form
                onSubmit={setPasswordForm.handleSubmit((data) => {
                  if (!setPasswordUser) return;
                  setPasswordMutation.mutate({ userId: setPasswordUser.id, password: data.password });
                })}
                className="space-y-4"
              >
                <FormField
                  control={setPasswordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Minimum 8 characters" data-testid="input-set-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={setPasswordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Repeat password" data-testid="input-confirm-set-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setSetPasswordDialogOpen(false)} data-testid="button-cancel-set-password">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={setPasswordMutation.isPending} data-testid="button-submit-set-password">
                    {setPasswordMutation.isPending ? "Saving..." : "Set Password"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
