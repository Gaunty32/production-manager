import { useState } from "react";
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
import { UserPlus, Pencil } from "lucide-react";

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

type CreateUserFormData = z.infer<typeof createUserSchema>;
type EditUserFormData = z.infer<typeof editUserSchema>;

export default function Users() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

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

        <Card>
          <CardHeader>
            <CardTitle>System Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users?.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`user-row-${user.id}`}
                >
                  <div className="flex-1">
                    <div className="font-medium" data-testid={`user-name-${user.id}`}>
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}`
                        : user.email || "Unknown User"}
                    </div>
                    <div className="text-sm text-muted-foreground" data-testid={`user-email-${user.id}`}>
                      {user.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                      data-testid={`button-edit-user-${user.id}`}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
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
                    {user.id === currentUser?.id && (
                      <span className="text-xs text-muted-foreground">(You)</span>
                    )}
                  </div>
                </div>
              ))}
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
      </div>
    </div>
  );
}
