import { StatusBadge } from '../StatusBadge';

export default function StatusBadgeExample() {
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <StatusBadge status={true} type="logo" />
      <StatusBadge status={false} type="logo" />
      <StatusBadge status={null} type="logo" />
      <StatusBadge status={true} type="ontime" />
      <StatusBadge status={false} type="ontime" />
      <StatusBadge status={null} type="ontime" />
    </div>
  );
}
