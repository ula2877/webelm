import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { categoryData } from '../../data/dummyData';

export default function CategoryChart() {
  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={categoryData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={5}
            dataKey="value"
          >
            {categoryData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
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
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
