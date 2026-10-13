import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../../utils/helpers';

// Header <th> yang dapat diurutkan. Klik memanggil onSort(sortKey). Tanda
// panah hanya ada pada kolom yang sortable; kolom yang sedang aktif diberi
// warna primary. Desain (ukuran, warna, spacing) mengikuti th tabel existing.
export default function SortableHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort && sort.key === sortKey;
  const order = active ? sort.order : null;
  const ariaSort = order === 'asc' ? 'ascending' : order === 'desc' ? 'descending' : 'none';
  const Icon = order === 'asc' ? ArrowUp : order === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        'text-left py-3 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Urutkan kolom ${label}`}
        className={cn(
          'inline-flex items-center gap-1 rounded transition-colors hover:text-primary-600',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          active && 'text-primary-600'
        )}
      >
        <span>{label}</span>
        <Icon className={cn('w-3.5 h-3.5 shrink-0', active ? 'opacity-100' : 'opacity-40')} />
      </button>
    </th>
  );
}
