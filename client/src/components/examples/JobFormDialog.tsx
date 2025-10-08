import { JobFormDialog } from '../JobFormDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const mockCustomers = [
  { id: "1", name: "Acme Corp" },
  { id: "2", name: "TechStart Inc" },
  { id: "3", name: "Global Industries" },
];

export default function JobFormDialogExample() {
  const handleSubmit = (data: any) => {
    console.log('Form submitted:', data);
  };

  return (
    <div className="p-4">
      <JobFormDialog
        trigger={
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Order
          </Button>
        }
        customers={mockCustomers}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
