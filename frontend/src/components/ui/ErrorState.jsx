import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorState({
  title = 'Something went wrong',
  description = 'An error occurred while loading the data. Please try again.',
  onRetry,
  className,
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className || ''}`}>
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-error" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-secondary text-center max-w-sm mb-4">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary" size="sm" icon={RefreshCw}>
          Try Again
        </Button>
      )}
    </div>
  );
}
