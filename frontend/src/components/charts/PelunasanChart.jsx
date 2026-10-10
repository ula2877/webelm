import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

/**
 * Donut ringkasan pelunasan periode terpilih.
 * Lunas   = projek punya minimal satu transaksi pelunasan='lunas'.
 * Belum   = sisanya (tanpa transaksi atau hanya DP).
 */
export default function PelunasanChart({ lunas = 0, belumLunas = 0 }) {
  const total = lunas + belumLunas;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-text-secondary">
        Belum ada projek pada periode ini.
      </div>
    );
  }

  const data = [
    { name: 'Lunas', value: lunas, color: '#10b981' },
    { name: 'Belum Lunas', value: belumLunas, color: '#f59e0b' },
  ];

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={4}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            formatter={(value, name) => [`${value} projek`, name]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
