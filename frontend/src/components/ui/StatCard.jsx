import { TrendingUp, TrendingDown, Users, UserCheck, CreditCard, DollarSign } from 'lucide-react';
import { cn } from '../../utils/helpers';

const iconMap = {
  Users,
  UserCheck,
  CreditCard,
  DollarSign,
};

const colorMap = {
  blue: 'bg-primary-50 text-primary-600',
  green: 'bg-emerald-50 text-emerald-600',
  purple: 'bg-violet-50 text-violet-600',
  orange: 'bg-amber-50 text-amber-600',
};

export default function StatCard({ label, value, change, trend, icon, color, className }) {
  const Icon = iconMap[icon] || Users;
  const isPositive = trend === 'up';

  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border p-6 transition-all duration-200 hover:shadow-md hover:border-primary-200',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
        </div>
        <div className={cn('p-3 rounded-lg', colorMap[color] || colorMap.blue)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        {isPositive ? (
          <TrendingUp className="w-4 h-4 text-emerald-500" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-500" />
        )}
        <span
          className={cn(
            'text-sm font-medium',
            isPositive ? 'text-emerald-600' : 'text-red-600'
          )}
        >
          {change}
        </span>
        <span className="text-sm text-text-muted">vs last month</span>
      </div>
    </div>
  );
}
