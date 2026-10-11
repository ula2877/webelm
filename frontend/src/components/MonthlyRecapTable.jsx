import { rupiah } from '../utils/suratJenis';
import { cn } from '../utils/helpers';

/**
 * Tabel rekap bulanan projek & income (12 bulan terakhir, urut terbaru -> terlama).
 * `rows`       = [{ key, label, project_count, income }]
 * `highlightKey` = bulan yang sedang dipilih di selector (disorot halus).
 */
export default function MonthlyRecapTable({ rows = [], highlightKey }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Rekap bulanan projek" className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
            <th className="py-2 pr-4">Bulan</th>
            <th className="py-2 px-4 text-right">Jumlah Projek</th>
            <th className="py-2 pl-4 text-right">Income Projek</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const active = row.key === highlightKey;
            return (
              <tr
                key={row.key}
                data-key={row.key}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'transition-colors',
                  active ? 'bg-primary-50/70' : 'hover:bg-gray-50/60'
                )}
              >
                <td className="py-2.5 pr-4 text-text-primary whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    {row.label}
                    {active && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-primary-600"
                        aria-label="Periode terpilih"
                        title="Periode terpilih"
                      />
                    )}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-text-secondary">
                  {row.project_count}
                </td>
                <td className="py-2.5 pl-4 text-right tabular-nums font-medium text-text-primary">
                  {rupiah(row.income)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}