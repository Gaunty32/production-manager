import { MachineBadge } from '../MachineBadge';

export default function MachineBadgeExample() {
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <MachineBadge machineId={1} />
      <MachineBadge machineId={2} />
      <MachineBadge machineId={3} />
      <MachineBadge machineId={4} />
      <MachineBadge machineId={5} />
      <MachineBadge machineId={null} />
    </div>
  );
}
