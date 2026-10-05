import { UserPlus, CreditCard, FileText, Settings, AlertTriangle, UserCog, RefreshCw, CheckCircle } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { recentActivity } from '../data/dummyData';

const activityConfig = {
  user: { icon: UserPlus, color: 'bg-blue-50 text-blue-600', label: 'User' },
  transaction: { icon: CreditCard, color: 'bg-emerald-50 text-emerald-600', label: 'Transaction' },
  report: { icon: FileText, color: 'bg-violet-50 text-violet-600', label: 'Report' },
  system: { icon: Settings, color: 'bg-amber-50 text-amber-600', label: 'System' },
  alert: { icon: AlertTriangle, color: 'bg-red-50 text-red-600', label: 'Alert' },
  role: { icon: UserCog, color: 'bg-cyan-50 text-cyan-600', label: 'Role Change' },
  refund: { icon: RefreshCw, color: 'bg-orange-50 text-orange-600', label: 'Refund' },
  team: { icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600', label: 'Team' },
};

const statusVariant = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

export default function Activity() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Activity Log</h2>
        <p className="text-text-secondary mt-1">Track all system activities and events</p>
      </div>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <Badge variant="info" dot>Live</Badge>
        </CardHeader>
        <div className="space-y-0">
          {recentActivity.map((activity, index) => {
            const config = activityConfig[activity.type] || activityConfig.system;
            const Icon = config.icon;
            const isLast = index === recentActivity.length - 1;

            return (
              <div key={activity.id} className="flex gap-4">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {!isLast && <div className="w-px h-full bg-border my-1" />}
                </div>

                {/* Content */}
                <div className={`flex-1 ${!isLast ? 'pb-6' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{activity.title}</p>
                      <p className="text-sm text-text-secondary mt-0.5">{activity.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant[activity.status]}>{config.label}</Badge>
                      <span className="text-xs text-text-muted whitespace-nowrap">{activity.time}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
