import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { revenueData } from '../../data/dummyData';

export default function RevenueChart() {
  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={revenueData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `Rp ${(value / 1000)}k`} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            formatter={(value) => [`Rp ${value.toLocaleString()}`, undefined]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2 }}
            name="Revenue"
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="#94a3b8"
            strokeWidth={2}
            dot={{ fill: '#94a3b8', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: '#94a3b8', strokeWidth: 2 }}
            name="Expenses"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
