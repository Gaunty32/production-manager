import { Plus, Trash2, Pencil, UserPlus, CheckCircle2, XCircle, AlertCircle, Key, Eye, Search, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { CustomerUserDialog } from "@/components/CustomerUserDialog";
import { ResetPasswordDialog } from "@/components/ResetPasswordDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";
import { useMemo } from "react";
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
import { usePermissions } from "@/hooks/usePermissions";

export default function Customers() {
  const { toast } = useToast();
  const { canImpersonateCustomers } = usePermissions();
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [portalFilter, setPortalFilter] = useState<'all' | 'has-portal' | 'no-portal'>('all');
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: customersData = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Fetch all customer users (for all customers)
  const { data: allCustomerUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/customer-users/all"],
    queryFn: async () => {
      // Fetch customer users for each customer
      const users: any[] = [];
      for (const customer of customersData) {
        try {
          const response = await fetch(`/api/customers/${customer.id}/users`);
          if (response.ok) {
            const customerUsers = await response.json();
            users.push(...customerUsers);
          }
        } catch (error) {
          console.error(`Failed to fetch users for customer ${customer.id}:`, error);
        }
      }
      return users;
    },
    enabled: customersData.length > 0,
  });

  // Map customer users by customer ID for quick lookup (supports multiple users per customer)
  const customerUsersMap = useMemo(() => {
    const map = new Map<string, any[]>();
    allCustomerUsers.forEach((user) => {
      const existing = map.get(user.customerId) || [];
      existing.push(user);
      map.set(user.customerId, existing);
    });
    return map;
  }, [allCustomerUsers]);

  // Sort customers alphabetically by name
  const allCustomers = [...customersData].sort((a, b) => a.name.localeCompare(b.name));
  
  // Filter customers based on portal status and search term
  const customers = useMemo(() => {
    let filtered = allCustomers;
    
    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((customer) => {
        const portalUsers = customerUsersMap.get(customer.id) || [];
        const portalEmails = portalUsers.map(u => u.email?.toLowerCase() || '').join(' ');
        const portalNames = portalUsers.map(u => `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase()).join(' ');
        
        return (
          customer.name.toLowerCase().includes(search) ||
          (customer.email?.toLowerCase() || '').includes(search) ||
          (customer.contactFirstName?.toLowerCase() || '').includes(search) ||
          (customer.contactLastName?.toLowerCase() || '').includes(search) ||
          (customer.address?.toLowerCase() || '').includes(search) ||
          (customer.telephone || '').includes(search) ||
          portalEmails.includes(search) ||
          portalNames.includes(search)
        );
      });
    }
    
    // Apply portal filter
    if (portalFilter !== 'all') {
      filtered = filtered.filter((customer) => {
        const portalUsers = customerUsersMap.get(customer.id) || [];
        const hasPortal = portalUsers.length > 0;
        return portalFilter === 'has-portal' ? hasPortal : !hasPortal;
      });
    }
    
    return filtered;
  }, [allCustomers, customerUsersMap, portalFilter, searchTerm]);
  
  // Count customers by portal status
  const portalStats = useMemo(() => {
    const hasPortal = allCustomers.filter(c => (customerUsersMap.get(c.id) || []).length > 0).length;
    const noPortal = allCustomers.length - hasPortal;
    return { total: allCustomers.length, hasPortal, noPortal };
  }, [allCustomers, customerUsersMap]);

  const createCustomerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/customers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Customer added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer",
        variant: "destructive",
      });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/customers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
      setCustomerToEdit(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/customers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
      setCustomerToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
      setCustomerToDelete(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/customers/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Customer status updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer status",
        variant: "destructive",
      });
    },
  });

  const createCustomerUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/customer-auth/register", data);
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-users/all"] });
      toast({
        title: "Success",
        description: `Customer portal login created successfully${variables.email ? ` for ${variables.email}` : ''}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer login",
        variant: "destructive",
      });
    },
  });

  const togglePortalAccessMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/customer-users/${id}/toggle-active`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-users/all"] });
      toast({
        title: "Success",
        description: "Portal access updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update portal access",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiRequest("POST", `/api/customer-users/${id}/reset-password`, { password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-users/all"] });
      toast({
        title: "Password Reset",
        description: "Customer portal password has been reset successfully",
      });
      setResetPasswordUserId(null);
      setResetPasswordEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const res = await apiRequest("POST", `/api/staff/customers/${customerId}/impersonate`);
      return res.json();
    },
    onSuccess: (data) => {
      // Open the impersonation URL in same tab
      window.location.href = data.impersonateUrl;
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start impersonation",
        variant: "destructive",
      });
    },
  });

  const handleResetPassword = (userId: string, email: string) => {
    setResetPasswordUserId(userId);
    setResetPasswordEmail(email);
  };

  const handleDelete = (id: string) => {
    setCustomerToDelete(id);
  };

  const confirmDelete = () => {
    if (customerToDelete) {
      deleteCustomerMutation.mutate(customerToDelete);
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
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your customer list and portal access
              </p>
            </div>
          <div className="flex gap-2">
            <CustomerUserDialog
              trigger={
                <Button variant="outline" data-testid="button-create-customer-login">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Portal Login
                </Button>
              }
              customers={customers}
              onSubmit={async (data) => {
                return new Promise((resolve, reject) => {
                  createCustomerUserMutation.mutate(data, {
                    onSuccess: () => resolve(),
                    onError: (error) => reject(error),
                  });
                });
              }}
              isPending={createCustomerUserMutation.isPending}
            />
            <CustomerFormDialog
              trigger={
                <Button data-testid="button-add-customer">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Customer
                </Button>
              }
              onSubmit={(data) => createCustomerMutation.mutate(data)}
            />
            </div>
          </div>
          
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9"
                data-testid="input-search-customers"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchTerm("")}
                  data-testid="button-clear-search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            {/* Filter buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Portal Status:</span>
              <Button
                variant={portalFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPortalFilter('all')}
                data-testid="button-filter-all"
              >
                All ({portalStats.total})
              </Button>
              <Button
                variant={portalFilter === 'has-portal' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPortalFilter('has-portal')}
                data-testid="button-filter-has-portal"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Has Portal ({portalStats.hasPortal})
              </Button>
              <Button
                variant={portalFilter === 'no-portal' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPortalFilter('no-portal')}
                data-testid="button-filter-no-portal"
              >
                <AlertCircle className="h-3.5 w-3.5 mr-1" />
                No Portal ({portalStats.noPortal})
              </Button>
            </div>
          </div>
        </div>

        {customers.length === 0 ? (
          <div className="border rounded-md p-8 text-center text-muted-foreground">
            {searchTerm
              ? `No customers match "${searchTerm}"`
              : portalFilter === 'all' 
                ? "No customers found. Click 'Add Customer' to create one."
                : portalFilter === 'has-portal'
                  ? "No customers with portal logins. Click 'Create Portal Login' to add one."
                  : "No customers without portal logins. All customers are set up!"}
          </div>
        ) : (
          <div className="space-y-3">
            {customers.map((customer) => {
              const isInactive = customer.active === false;
              const portalUsers = customerUsersMap.get(customer.id) || [];
              const hasPortalLogin = portalUsers.length > 0;
              
              return (
              <Card 
                key={customer.id} 
                className={`hover-elevate ${customer.pricingTable2025 ? 'bg-orange-50 dark:bg-orange-950/20' : ''} ${isInactive ? 'opacity-60' : ''}`}
                data-testid={`card-customer-${customer.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Customer Name and Pricing Table */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-base" data-testid={`text-customer-name-${customer.id}`}>
                          {customer.name}
                        </h3>
                        <div className="flex items-center gap-1 flex-wrap" data-testid={`text-pricing-table-${customer.id}`}>
                          {isInactive && (
                            <Badge 
                              variant="outline" 
                              className="bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300"
                              data-testid={`badge-inactive-${customer.id}`}
                            >
                              Inactive
                            </Badge>
                          )}
                          {customer.pricingTable2025 && (
                            <Badge 
                              variant="outline" 
                              className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                              data-testid={`badge-pricing-2025-${customer.id}`}
                            >
                              2025
                            </Badge>
                          )}
                          {customer.pricingTable2026 && (
                            <Badge 
                              variant="outline" 
                              className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                              data-testid={`badge-pricing-2026-${customer.id}`}
                            >
                              2026
                            </Badge>
                          )}
                          {!customer.pricingTable2025 && !customer.pricingTable2026 && (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </div>
                      </div>

                      {/* Contact Details */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Contact: </span>
                          <span data-testid={`text-contact-name-${customer.id}`}>
                            {customer.contactFirstName || customer.contactLastName 
                              ? `${customer.contactFirstName || ''} ${customer.contactLastName || ''}`.trim()
                              : "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Email: </span>
                          <span data-testid={`text-email-${customer.id}`}>{customer.email || "-"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone: </span>
                          <span data-testid={`text-telephone-${customer.id}`}>{customer.telephone || "-"}</span>
                        </div>
                      </div>

                      {/* Address - appears below */}
                      {customer.address && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Address: </span>
                          <span data-testid={`text-address-${customer.id}`}>{customer.address}</span>
                        </div>
                      )}

                      {/* Portal Login Status */}
                      {hasPortalLogin ? (
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">
                            Portal Logins ({portalUsers.length}):
                          </div>
                          {portalUsers.map((portalUser, userIndex) => {
                            const userActive = portalUser.active !== false;
                            return (
                              <div key={portalUser.id} className="flex items-center gap-2 text-sm flex-wrap pl-2 border-l-2 border-muted">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {userActive ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                  )}
                                  <span className="text-foreground truncate" data-testid={`text-portal-email-${portalUser.id}`}>
                                    {portalUser.email}
                                    {portalUser.firstName && ` (${portalUser.firstName}${portalUser.lastName ? ` ${portalUser.lastName}` : ''})`}
                                    {!userActive && <span className="text-muted-foreground"> - Disabled</span>}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => handleResetPassword(portalUser.id, portalUser.email)}
                                    data-testid={`button-reset-password-${portalUser.id}`}
                                  >
                                    <Key className="h-3.5 w-3.5 mr-1" />
                                    Reset
                                  </Button>
                                  <Switch
                                    checked={userActive}
                                    onCheckedChange={(checked) => togglePortalAccessMutation.mutate({ id: portalUser.id, active: checked })}
                                    data-testid={`switch-portal-user-${portalUser.id}`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          {canImpersonateCustomers && portalUsers.some(u => u.active !== false) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 mt-1"
                              onClick={() => impersonateMutation.mutate(customer.id)}
                              disabled={impersonateMutation.isPending}
                              data-testid={`button-view-as-customer-${customer.id}`}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              View as Customer
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className="bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"
                            data-testid={`badge-no-portal-${customer.id}`}
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            No Portal Login
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCustomerToEdit(customer)}
                          data-testid={`button-edit-customer-${customer.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDelete(customer.id)}
                          data-testid={`button-delete-customer-${customer.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`active-${customer.id}`} className="text-xs text-muted-foreground cursor-pointer">
                          Active
                        </Label>
                        <Switch
                          id={`active-${customer.id}`}
                          checked={customer.active !== false}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: customer.id, active: checked })}
                          data-testid={`switch-active-${customer.id}`}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}

        <AlertDialog open={customerToDelete !== null} onOpenChange={(open) => !open && setCustomerToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Customer</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this customer? This action cannot be undone.
                {" "}Note: You cannot delete customers with existing orders.
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

        {customerToEdit && (
          <CustomerFormDialog
            open={true}
            onOpenChange={(open) => !open && setCustomerToEdit(null)}
            customer={customerToEdit}
            onSubmit={(data) => updateCustomerMutation.mutate({ id: customerToEdit.id, data })}
          />
        )}

        {resetPasswordUserId && (
          <ResetPasswordDialog
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                setResetPasswordUserId(null);
                setResetPasswordEmail("");
              }
            }}
            customerEmail={resetPasswordEmail}
            onResetPassword={async (password) => {
              await resetPasswordMutation.mutateAsync({
                id: resetPasswordUserId,
                password,
              });
            }}
            isResetting={resetPasswordMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}
