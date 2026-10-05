import { cn } from '../../utils/helpers';

export default function Card({ children, className, hover, ...props }) {
  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border p-6',
        hover && 'transition-all duration-200 hover:shadow-md hover:border-primary-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }) {
  return (
    <h3 className={cn('text-lg font-semibold text-text-primary', className)}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className }) {
  return <div className={cn('', className)}>{children}</div>;
}
