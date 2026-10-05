import { cn } from '../../utils/helpers';

const variants = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  default: 'bg-gray-50 text-gray-700 border-gray-200',
  primary: 'bg-primary-50 text-primary-700 border-primary-200',
};

const dotVariants = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  default: 'bg-gray-500',
  primary: 'bg-primary-500',
};

export default function Badge({ children, variant = 'default', dot, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border',
        variants[variant],
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotVariants[variant])} />}
      {children}
    </span>
  );
}
