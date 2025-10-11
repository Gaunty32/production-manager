import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { UserRole, type User } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

export default function Users() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
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

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRoleMutation.mutate({ userId, role: newRole });
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage user roles and permissions</p>
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
      </div>
    </div>
  );
}
