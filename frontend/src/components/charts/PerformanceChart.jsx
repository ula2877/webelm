import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { performanceData } from '../../data/dummyData';

export default function PerformanceChart() {
  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={performanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id="colorDesktop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorMobile" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `${value}%`} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            formatter={(value) => [`${value}%`, undefined]}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="desktop"
            stroke="#2563eb"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorDesktop)"
            name="Desktop"
          />
          <Area
            type="monotone"
            dataKey="mobile"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorMobile)"
            name="Mobile"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
