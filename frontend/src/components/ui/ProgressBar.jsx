import { cn } from '../../utils/helpers';

export default function ProgressBar({ value, max = 100, color = 'bg-primary-600', className, showLabel }) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs font-medium text-text-secondary">Progress</span>
          <span className="text-xs font-medium text-text-primary">{percentage}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
