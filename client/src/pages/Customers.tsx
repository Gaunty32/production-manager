import { Plus, Trash2, Pencil, UserPlus } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { CustomerUserDialog } from "@/components/CustomerUserDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";
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

export default function Customers() {
  const { toast } = useToast();
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);

  const { data: customersData = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Sort customers alphabetically by name
  const customers = [...customersData].sort((a, b) => a.name.localeCompare(b.name));

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
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Customer portal login created successfully for ${data.email}`,
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
        <div className="flex items-center justify-between mb-6">
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
              onSubmit={(data) => createCustomerUserMutation.mutate(data)}
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

        {customers.length === 0 ? (
          <div className="border rounded-md p-8 text-center text-muted-foreground">
            No customers found. Click 'Add Customer' to create one.
          </div>
        ) : (
          <div className="space-y-3">
            {customers.map((customer) => {
              const isInactive = customer.active === false;
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
      </div>
    </div>
  );
}
