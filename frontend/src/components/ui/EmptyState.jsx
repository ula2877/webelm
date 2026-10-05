import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No data found',
  description = 'There is no data to display at the moment.',
  actionLabel,
  onAction,
  className,
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className || ''}`}>
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-secondary text-center max-w-sm mb-4">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
