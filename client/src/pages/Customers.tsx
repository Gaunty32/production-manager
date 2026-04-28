import { Plus, Trash2, Pencil, UserPlus, CheckCircle2, XCircle, AlertCircle, Key, Eye, Search, X, Mail } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { CustomerUserDialog } from "@/components/CustomerUserDialog";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";

const TILE_COLORS = [
  "bg-violet-500","bg-blue-500","bg-cyan-500","bg-teal-500","bg-emerald-500",
  "bg-amber-500","bg-orange-500","bg-pink-500","bg-rose-500","bg-indigo-500",
];
function tileColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return TILE_COLORS[h % TILE_COLORS.length];
}

export default function Customers() {
  const { toast } = useToast();
  const { canImpersonateCustomers, canDeactivateCustomers } = usePermissions();
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [portalFilter, setPortalFilter] = useState<'all' | 'has-portal' | 'no-portal'>('all');
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [searchTerm, setSearchTerm] = useState("");
  const [editingPortalUser, setEditingPortalUser] = useState<{ id: string; email: string; firstName: string; lastName: string } | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState<string | null>(null); // userId being actioned
  const [isSendingReset, setIsSendingReset] = useState<string | null>(null); // userId being reset

  const { data: customersData = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Fetch all customer users in a single request
  const { data: allCustomerUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/customer-users/all"],
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
  
  // Active/inactive counts (across all customers, unaffected by other filters)
  const activeStats = useMemo(() => {
    const active = allCustomers.filter(c => c.active !== false).length;
    const inactive = allCustomers.length - active;
    return { active, inactive, all: allCustomers.length };
  }, [allCustomers]);

  // Base set after applying the active filter (used for portal stats counts too)
  const activeFilteredBase = useMemo(() => {
    if (activeFilter === 'active') return allCustomers.filter(c => c.active !== false);
    if (activeFilter === 'inactive') return allCustomers.filter(c => c.active === false);
    return allCustomers;
  }, [allCustomers, activeFilter]);

  // Filter customers based on portal status, active status, and search term
  const customers = useMemo(() => {
    let filtered = activeFilteredBase;
    
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
  }, [activeFilteredBase, customerUsersMap, portalFilter, searchTerm]);
  
  // Count customers by portal status (within the active filter set)
  const portalStats = useMemo(() => {
    const hasPortal = activeFilteredBase.filter(c => (customerUsersMap.get(c.id) || []).length > 0).length;
    const noPortal = activeFilteredBase.length - hasPortal;
    return { total: activeFilteredBase.length, hasPortal, noPortal };
  }, [activeFilteredBase, customerUsersMap]);

  const handleGenerateInvite = async (portalUserId: string) => {
    setIsGeneratingInvite(portalUserId);
    try {
      await apiRequest("POST", `/api/customer-users/${portalUserId}/generate-invite`);
      toast({ title: "Invite sent", description: "A welcome email with a secure login link has been sent." });
    } catch {
      toast({ title: "Failed to send invite", variant: "destructive" });
    } finally {
      setIsGeneratingInvite(null);
    }
  };

  const handleSendResetLink = async (portalUserId: string) => {
    setIsSendingReset(portalUserId);
    try {
      await apiRequest("POST", `/api/customer-users/${portalUserId}/reset-password`);
      toast({ title: "Reset link sent", description: "A password reset link has been emailed to the customer." });
    } catch {
      toast({ title: "Failed to send reset link", variant: "destructive" });
    } finally {
      setIsSendingReset(null);
    }
  };

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
        title: "Portal login created",
        description: `An invite link has been emailed to ${variables.email || 'the customer'} to set their password.`,
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

  const updatePortalUserMutation = useMutation({
    mutationFn: async ({ id, email, firstName, lastName }: { id: string; email: string; firstName: string; lastName: string }) => {
      const res = await apiRequest("PATCH", `/api/customer-users/${id}`, { email, firstName, lastName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-users/all"] });
      setEditingPortalUser(null);
      toast({
        title: "Success",
        description: "Portal user updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update portal user",
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
              customers={customers.filter(c => c.active !== false)}
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
              canDeactivateCustomers={canDeactivateCustomers}
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
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Button
                  variant={activeFilter === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveFilter('active')}
                  data-testid="button-filter-active"
                >
                  Active ({activeStats.active})
                </Button>
                <Button
                  variant={activeFilter === 'inactive' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveFilter('inactive')}
                  data-testid="button-filter-inactive"
                >
                  Inactive ({activeStats.inactive})
                </Button>
                <Button
                  variant={activeFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveFilter('all')}
                  data-testid="button-filter-status-all"
                >
                  All ({activeStats.all})
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Portal:</span>
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
        </div>

        {customers.length === 0 ? (
          <div className="border rounded-md p-8 text-center text-muted-foreground">
            {searchTerm
              ? `No customers match "${searchTerm}"`
              : activeFilter === 'inactive'
                ? "No inactive customers."
                : portalFilter === 'has-portal'
                  ? "No active customers with portal logins."
                  : portalFilter === 'no-portal'
                    ? "No active customers without portal logins."
                    : "No customers found. Click 'Add Customer' to create one."}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {customers.map((customer) => {
              const isInactive = customer.active === false;
              const portalUsers = customerUsersMap.get(customer.id) || [];
              const hasPortalLogin = portalUsers.length > 0;
              const color = tileColor(customer.name);
              const initials = customer.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

              return (
                <button
                  key={customer.id}
                  onClick={() => setSelectedCustomer(customer)}
                  className={`group flex flex-col items-center gap-3 p-4 rounded-xl border bg-card hover-elevate text-left transition-opacity ${isInactive ? "opacity-50" : ""}`}
                  data-testid={`card-customer-${customer.id}`}
                >
                  {/* Logo / initials */}
                  <div className={`h-16 w-16 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${customer.logoUrl ? "bg-transparent" : color}`}>
                    {customer.logoUrl ? (
                      <img src={customer.logoUrl} alt={customer.name} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xl font-bold text-white">{initials}</span>
                    )}
                  </div>

                  {/* Name */}
                  <p className="text-sm font-semibold text-center leading-tight line-clamp-2 w-full" data-testid={`text-customer-name-${customer.id}`}>
                    {customer.name}
                  </p>

                  {/* Status chips */}
                  <div className="flex flex-wrap justify-center gap-1">
                    {isInactive && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>
                    )}
                    {hasPortalLogin ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-700 dark:text-green-400 border-green-300">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Portal
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-orange-600 dark:text-orange-400 border-orange-300">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5" />No Portal
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Customer detail sheet */}
        <Sheet open={selectedCustomer !== null} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            {selectedCustomer && (() => {
              const customer = selectedCustomer;
              const isInactive = customer.active === false;
              const portalUsers = customerUsersMap.get(customer.id) || [];
              const hasPortalLogin = portalUsers.length > 0;
              const color = tileColor(customer.name);
              const initials = customer.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
              return (
                <div className="space-y-6 pt-2">
                  <SheetHeader>
                    <div className="flex items-center gap-4">
                      <div className={`h-14 w-14 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${customer.logoUrl ? "bg-transparent" : color}`}>
                        {customer.logoUrl ? (
                          <img src={customer.logoUrl} alt={customer.name} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-lg font-bold text-white">{initials}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <SheetTitle className="text-lg leading-tight">{customer.name}</SheetTitle>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {isInactive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                        </div>
                      </div>
                    </div>
                  </SheetHeader>

                  {/* Actions row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setCustomerToEdit(customer); setSelectedCustomer(null); }}
                      data-testid={`button-edit-customer-${customer.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { handleDelete(customer.id); setSelectedCustomer(null); }}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      data-testid={`button-delete-customer-${customer.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete
                    </Button>
                    <div className="flex items-center gap-2 ml-auto">
                      <Label htmlFor={`sheet-active-${customer.id}`} className="text-sm text-muted-foreground cursor-pointer">Active</Label>
                      <Switch
                        id={`sheet-active-${customer.id}`}
                        checked={customer.active !== false}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: customer.id, active: checked })}
                        data-testid={`switch-active-${customer.id}`}
                      />
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Details</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-16 shrink-0">Contact</span>
                        <span data-testid={`text-contact-name-${customer.id}`}>
                          {customer.contactFirstName || customer.contactLastName
                            ? `${customer.contactFirstName || ""} ${customer.contactLastName || ""}`.trim()
                            : "—"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-16 shrink-0">Email</span>
                        <span className="break-all" data-testid={`text-email-${customer.id}`}>{customer.email || "—"}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-16 shrink-0">Phone</span>
                        <span data-testid={`text-telephone-${customer.id}`}>{customer.telephone || "—"}</span>
                      </div>
                      {customer.address && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-16 shrink-0">Address</span>
                          <span data-testid={`text-address-${customer.id}`}>{customer.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Portal logins */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Portal Access</h3>
                    {hasPortalLogin ? (
                      <div className="space-y-3">
                        {portalUsers.map((portalUser) => {
                          const userActive = portalUser.active !== false;
                          return (
                            <div key={portalUser.id} className="rounded-lg border p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                {userActive
                                  ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                                  : <XCircle className="h-4 w-4 text-gray-400 shrink-0" />}
                                <span className="text-sm flex-1 min-w-0 break-all" data-testid={`text-portal-email-${portalUser.id}`}>
                                  {portalUser.email}
                                  {portalUser.firstName && ` (${portalUser.firstName}${portalUser.lastName ? ` ${portalUser.lastName}` : ""})`}
                                </span>
                                {!userActive && <Badge variant="outline" className="text-xs shrink-0">Disabled</Badge>}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setEditingPortalUser({ id: portalUser.id, email: portalUser.email || "", firstName: portalUser.firstName || "", lastName: portalUser.lastName || "" })}
                                  data-testid={`button-edit-portal-user-${portalUser.id}`}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleSendResetLink(portalUser.id)}
                                  disabled={isSendingReset === portalUser.id}
                                  data-testid={`button-reset-password-${portalUser.id}`}
                                >
                                  <Key className="h-3 w-3 mr-1" />
                                  {isSendingReset === portalUser.id ? "Sending…" : "Send Reset Link"}
                                </Button>
                                <div className="flex flex-col items-start gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-blue-600 dark:text-blue-400"
                                    onClick={() => handleGenerateInvite(portalUser.id)}
                                    disabled={isGeneratingInvite === portalUser.id}
                                    data-testid={`button-send-welcome-${portalUser.id}`}
                                  >
                                    <Mail className="h-3 w-3 mr-1" />
                                    {isGeneratingInvite === portalUser.id ? "Sending…" : "Send Invite Email"}
                                  </Button>
                                  {portalUser.inviteSentAt && (
                                    <span className="text-[10px] text-muted-foreground pl-1">
                                      Sent {new Date(portalUser.inviteSentAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <span className="text-xs text-muted-foreground">Access</span>
                                  <Switch
                                    checked={userActive}
                                    onCheckedChange={(checked) => togglePortalAccessMutation.mutate({ id: portalUser.id, active: checked })}
                                    data-testid={`switch-portal-user-${portalUser.id}`}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {canImpersonateCustomers && portalUsers.some(u => u.active !== false) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => impersonateMutation.mutate(customer.id)}
                            disabled={impersonateMutation.isPending}
                            data-testid={`button-view-as-customer-${customer.id}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View as Customer
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />
                        No portal logins configured
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </SheetContent>
        </Sheet>

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
            canDeactivateCustomers={canDeactivateCustomers}
          />
        )}


        {/* Edit Portal User Dialog */}
        <AlertDialog open={editingPortalUser !== null} onOpenChange={(open) => !open && setEditingPortalUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit Portal User</AlertDialogTitle>
              <AlertDialogDescription>
                Update the portal user's email address and name.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {editingPortalUser && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="portal-user-email">Email Address</Label>
                  <Input
                    id="portal-user-email"
                    type="email"
                    value={editingPortalUser.email}
                    onChange={(e) => setEditingPortalUser({ ...editingPortalUser, email: e.target.value })}
                    data-testid="input-edit-portal-email"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="portal-user-first-name">First Name</Label>
                    <Input
                      id="portal-user-first-name"
                      value={editingPortalUser.firstName}
                      onChange={(e) => setEditingPortalUser({ ...editingPortalUser, firstName: e.target.value })}
                      data-testid="input-edit-portal-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="portal-user-last-name">Last Name</Label>
                    <Input
                      id="portal-user-last-name"
                      value={editingPortalUser.lastName}
                      onChange={(e) => setEditingPortalUser({ ...editingPortalUser, lastName: e.target.value })}
                      data-testid="input-edit-portal-lastname"
                    />
                  </div>
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-edit-portal-user">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (editingPortalUser) {
                    updatePortalUserMutation.mutate(editingPortalUser);
                  }
                }}
                disabled={updatePortalUserMutation.isPending}
                data-testid="button-save-portal-user"
              >
                {updatePortalUserMutation.isPending ? "Saving..." : "Save Changes"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}
