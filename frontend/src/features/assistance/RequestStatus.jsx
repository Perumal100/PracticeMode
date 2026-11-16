import { Badge } from '@/components/ui/badge.jsx';

const STATUS = {
  REQUESTED: ['warning', 'Requested'],
  SCHEDULED: ['default', 'Scheduled'],
  COMPLETED: ['success', 'Completed'],
  CANCELLED: ['secondary', 'Cancelled'],
};

export function RequestStatus({ status }) {
  const [variant, label] = STATUS[status] ?? ['secondary', status];
  return <Badge variant={variant}>{label}</Badge>;
}

export const isOpen = (request) => request?.status === 'REQUESTED' || request?.status === 'SCHEDULED';
