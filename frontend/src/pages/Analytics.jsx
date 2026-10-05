import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import ProgressBar from '../components/ui/ProgressBar';
import RevenueChart from '../components/charts/RevenueChart';
import PerformanceChart from '../components/charts/PerformanceChart';
import CategoryChart from '../components/charts/CategoryChart';

const topPages = [
  { path: '/dashboard', views: 12450, change: '+12.5%' },
  { path: '/users', views: 8320, change: '+8.2%' },
  { path: '/reports', views: 6180, change: '+15.3%' },
  { path: '/analytics', views: 4920, change: '-2.1%' },
  { path: '/settings', views: 3150, change: '+5.7%' },
];

const trafficSources = [
  { source: 'Organic Search', value: 45, color: 'bg-primary-600' },
  { source: 'Direct', value: 25, color: 'bg-emerald-500' },
  { source: 'Social Media', value: 18, color: 'bg-violet-500' },
  { source: 'Referral', value: 12, color: 'bg-amber-500' },
];

export default function Analytics() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Analytics</h2>
        <p className="text-text-secondary mt-1">Detailed insights and performance metrics</p>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <Badge variant="success" dot>Live</Badge>
          </CardHeader>
          <RevenueChart />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Traffic Sources</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            {trafficSources.map((source) => (
              <div key={source.source}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-text-primary">{source.source}</span>
                  <span className="text-sm text-text-secondary">{source.value}%</span>
                </div>
                <ProgressBar value={source.value} color={source.color} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Top Pages</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Page</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Views</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topPages.map((page) => (
                  <tr key={page.path} className="hover:bg-gray-50/50">
                    <td className="py-3 px-4 text-sm font-medium text-text-primary">{page.path}</td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{page.views.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <span className={`text-sm font-medium ${page.change.startsWith('+') ? 'text-emerald-600' : 'text-red-600'}`}>
                        {page.change}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Device Breakdown</CardTitle>
          </CardHeader>
          <CategoryChart />
        </Card>
      </div>
    </div>
  );
}
