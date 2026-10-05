import { Users, CreditCard, FileText, AlertTriangle, CheckCircle, Settings, UserPlus, RefreshCw } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import RevenueChart from '../components/charts/RevenueChart';
import PerformanceChart from '../components/charts/PerformanceChart';
import CategoryChart from '../components/charts/CategoryChart';
import { statsData, recentActivity } from '../data/dummyData';

const activityIcons = {
  user: UserPlus,
  transaction: CreditCard,
  report: FileText,
  system: Settings,
  alert: AlertTriangle,
};

const activityColors = {
  success: 'bg-emerald-50 text-emerald-600',
  info: 'bg-blue-50 text-blue-600',
  warning: 'bg-amber-50 text-amber-600',
  error: 'bg-red-50 text-red-600',
};

export default function Dashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome section */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Welcome back, Admin</h2>
        <p className="text-text-secondary mt-1">Here&apos;s what&apos;s happening today.</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statsData.map((stat, index) => (
          <StatCard
            key={stat.id}
            {...stat}
            className={`stagger-${index + 1} animate-fade-in`}
          />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <Badge variant="success" dot>Live</Badge>
          </CardHeader>
          <RevenueChart />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Distribution</CardTitle>
          </CardHeader>
          <CategoryChart />
        </Card>
      </div>

      {/* Performance and Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Device Performance</CardTitle>
            <Badge variant="info" dot>Real-time</Badge>
          </CardHeader>
          <PerformanceChart />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View all
            </button>
          </CardHeader>
          <div className="space-y-4">
            {recentActivity.slice(0, 5).map((activity) => {
              const Icon = activityIcons[activity.type] || CheckCircle;
              return (
                <div key={activity.id} className="flex gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${activityColors[activity.status]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{activity.title}</p>
                    <p className="text-xs text-text-secondary truncate">{activity.description}</p>
                    <p className="text-xs text-text-muted mt-1">{activity.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
