import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobFormDialog } from "@/components/JobFormDialog";
import { JobRow } from "@/components/JobRow";

//todo: remove mock functionality
const MOCK_CUSTOMERS = [
  { id: "1", name: "Acme Corp" },
  { id: "2", name: "TechStart Inc" },
  { id: "3", name: "Global Industries" },
  { id: "4", name: "Premier Manufacturing" },
  { id: "5", name: "Elite Enterprises" },
];

//todo: remove mock functionality
const MOCK_JOBS = [
  {
    id: "1",
    customerName: "Acme Corp",
    jobName: "Product Labels",
    poNumber: "PO-2024-001",
    logoApproved: true,
    quantity: 5000,
    dateReceived: new Date("2024-10-01"),
    requiredDispatchDate: new Date("2024-10-15"),
    completedOnTime: null,
    machineId: 1,
  },
  {
    id: "2",
    customerName: "TechStart Inc",
    jobName: "Business Cards",
    poNumber: "PO-2024-002",
    logoApproved: false,
    quantity: 1000,
    dateReceived: new Date("2024-10-05"),
    requiredDispatchDate: new Date("2024-10-08"),
    completedOnTime: null,
    machineId: 2,
  },
  {
    id: "3",
    customerName: "Global Industries",
    jobName: "Packaging Materials",
    poNumber: "PO-2024-003",
    logoApproved: true,
    quantity: 10000,
    dateReceived: new Date("2024-09-28"),
    requiredDispatchDate: new Date("2024-10-10"),
    completedOnTime: true,
    machineId: 3,
  },
];

export default function Dashboard() {
  const [jobs, setJobs] = useState(MOCK_JOBS);

  const handleAddJob = (data: any) => {
    console.log("Add job triggered:", data);
    const customer = MOCK_CUSTOMERS.find((c) => c.id === data.customerId);
    const newJob = {
      id: Date.now().toString(),
      customerName: customer?.name || "Unknown",
      jobName: data.jobName,
      poNumber: data.poNumber,
      logoApproved: data.logoApproved,
      quantity: data.quantity,
      dateReceived: new Date(data.dateReceived),
      requiredDispatchDate: new Date(data.requiredDispatchDate),
      completedOnTime: data.completedOnTime,
      machineId: data.machineId,
    };
    setJobs([...jobs, newJob]);
  };

  const handleEdit = (id: string) => {
    console.log("Edit job:", id);
  };

  const handleDelete = (id: string) => {
    console.log("Delete job:", id);
    setJobs(jobs.filter((job) => job.id !== id));
  };

  const sortedJobs = [...jobs].sort(
    (a, b) => a.requiredDispatchDate.getTime() - b.requiredDispatchDate.getTime()
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Production Queue</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Orders sorted by dispatch date
            </p>
          </div>
          <JobFormDialog
            trigger={
              <Button data-testid="button-add-order">
                <Plus className="h-4 w-4 mr-2" />
                Add Order
              </Button>
            }
            customers={MOCK_CUSTOMERS}
            onSubmit={handleAddJob}
          />
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
                    Logo Approved
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Quantity
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Date Received
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Dispatch Date
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Machine
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    On Time
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {sortedJobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
