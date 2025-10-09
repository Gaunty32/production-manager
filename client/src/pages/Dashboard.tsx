import { useState, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobFormDialog } from "@/components/JobFormDialog";
import { JobEditDialog } from "@/components/JobEditDialog";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { JobRow } from "@/components/JobRow";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getMachineName } from "@shared/machines";
import type { Customer, Job, Staff } from "@shared/schema";
import { useParams } from "wouter";

export default function Dashboard() {
  const { toast } = useToast();
  const params = useParams();
  const machineId = params.id ? parseInt(params.id) : null;
  const [searchTerm, setSearchTerm] = useState("");
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  const { data: customersData = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Sort customers alphabetically by name
  const customers = [...customersData].sort((a, b) => a.name.localeCompare(b.name));

  const { data: staffData = [], isLoading: staffLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  // Sort staff alphabetically by name
  const staff = [...staffData].sort((a, b) => a.name.localeCompare(b.name));

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: machineId ? ["/api/jobs", `?machineId=${machineId}`] : ["/api/jobs"],
  });

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

  const createJobMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/jobs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Success",
        description: "Order created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/jobs/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Success",
        description: "Order deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete order",
        variant: "destructive",
      });
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/jobs/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setEditingJob(null);
      toast({
        title: "Success",
        description: "Order updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update order",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (job) {
      setEditingJob(job);
    }
  };

  const handleDelete = (id: string) => {
    deleteJobMutation.mutate(id);
  };

  const jobsWithCustomers = jobs.map((job) => {
    const customer = customers.find((c) => c.id === job.customerId);
    const staffMember = staff.find((s) => s.id === job.completedById);
    return {
      ...job,
      customerName: customer?.name || "Unknown",
      completedByName: staffMember?.name || null,
    };
  });

  const filteredJobs = jobsWithCustomers.filter((job) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      job.customerName.toLowerCase().includes(searchLower) ||
      job.jobName.toLowerCase().includes(searchLower) ||
      (job.poNumber && job.poNumber.toLowerCase().includes(searchLower))
    );
  });

  const sortedJobs = [...filteredJobs].sort(
    (a, b) => new Date(a.requiredDispatchDate).getTime() - new Date(b.requiredDispatchDate).getTime()
  );

  const pageTitle = machineId 
    ? `${getMachineName(machineId)} Orders` 
    : "Production Queue";

  if (customersLoading || jobsLoading || staffLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{pageTitle}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Orders sorted by dispatch date
            </p>
          </div>
          <div className="flex gap-2">
            <CustomerFormDialog
              trigger={
                <Button variant="outline" data-testid="button-add-customer">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Customer
                </Button>
              }
              onSubmit={(data) => createCustomerMutation.mutate(data)}
            />
            <JobFormDialog
              trigger={
                <Button data-testid="button-add-order">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Order
                </Button>
              }
              customers={customers}
              staff={staff}
              onSubmit={(data) => createJobMutation.mutate(data)}
            />
          </div>
        </div>

        <div className="mb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by customer, job name, or PO number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Customer
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Job Name
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    PO Number
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Logo
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Qty
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Stitches
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Machine
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Runs
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Time/Run
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total Time
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Dispatch
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    On Time
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Completed By
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {sortedJobs.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-8 text-center text-muted-foreground">
                      {searchTerm ? "No orders match your search." : "No orders found. Click 'Add Order' to create one."}
                    </td>
                  </tr>
                ) : (
                  sortedJobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={{
                        ...job,
                        dateReceived: new Date(job.dateReceived),
                        requiredDispatchDate: new Date(job.requiredDispatchDate),
                      }}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <JobEditDialog
          open={editingJob !== null}
          onOpenChange={(open) => !open && setEditingJob(null)}
          job={editingJob ? {
            ...editingJob,
            dateReceived: new Date(editingJob.dateReceived),
            requiredDispatchDate: new Date(editingJob.requiredDispatchDate),
          } : null}
          customers={customers}
          staff={staff}
          onSubmit={(id, data) => updateJobMutation.mutate({ id, data })}
        />
      </div>
    </div>
  );
}
