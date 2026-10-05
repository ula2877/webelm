import { cn } from '../../utils/helpers';

export default function Input({
  label,
  error,
  icon: Icon,
  className,
  ...props
}) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-5 w-5 text-text-muted" />
          </div>
        )}
        <input
          className={cn(
            'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
            Icon && 'pl-10',
            error && 'border-error focus:ring-error focus:border-error',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  );
}

export function Select({ label, error, children, className, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          {label}
        </label>
      )}
      <select
        className={cn(
          'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
          error && 'border-error focus:ring-error focus:border-error',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className, rows = 3, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          {label}
        </label>
      )}
      <textarea
        rows={rows}
        className={cn(
          'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-all duration-200 resize-none',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
          error && 'border-error focus:ring-error focus:border-error',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  );
}
