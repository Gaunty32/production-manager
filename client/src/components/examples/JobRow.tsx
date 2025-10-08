import { JobRow } from '../JobRow';

const mockJob = {
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
};

export default function JobRowExample() {
  return (
    <div className="p-4">
      <table className="w-full border rounded-md">
        <thead className="bg-muted">
          <tr>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">Customer</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">Job</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">PO</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">Logo</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">Qty</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">Received</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">Dispatch</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">Machine</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">On Time</th>
            <th className="py-3 px-4 text-left text-xs font-medium uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-card">
          <JobRow
            job={mockJob}
            onEdit={(id) => console.log('Edit:', id)}
            onDelete={(id) => console.log('Delete:', id)}
          />
        </tbody>
      </table>
    </div>
  );
}
