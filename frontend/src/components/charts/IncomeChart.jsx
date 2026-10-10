import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatCurrency } from '../../utils/helpers';

/** Ringkas angka rupiah untuk sumbu Y (rb = ribu, jt = juta). */
function shortRupiah(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
}

/**
 * Grafik batang total pembayaran diterima per bulan.
 * Bulan yang sedang dipilih (`highlightKey`) ditampilkan lebih gelap.
 * `data` = { key, label, pembayaran } dari backend.
 */
export default function IncomeChart({ data = [], highlightKey }) {
  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
          <YAxis tickFormatter={shortRupiah} tick={{ fontSize: 12, fill: '#64748b' }} />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            formatter={(value) => [formatCurrency(value), 'Pembayaran Diterima']}
          />
          <Bar dataKey="pembayaran" name="Pembayaran Diterima" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.key === highlightKey ? '#1d4ed8' : '#93c5fd'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
