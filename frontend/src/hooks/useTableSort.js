import { useCallback, useState } from 'react';

// Sorting bersama untuk tabel yang memakai pagination server-side.
// Siklus klik: netral (default) -> asc -> desc -> netral.
// `sort` bernilai { key, order } atau null; `key` adalah nama kolom yang
// sudah di-whitelist di backend (dikirim sebagai sort_by + sort_order).
export function nextSortOrder(order) {
  if (order === 'asc') return 'desc';
  if (order === 'desc') return null;
  return 'asc';
}

export default function useTableSort() {
  const [sort, setSort] = useState(null);

  const toggleSort = useCallback((key) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, order: 'asc' };
      const order = nextSortOrder(prev.order);
      return order ? { key, order } : null;
    });
  }, []);

  const resetSort = useCallback(() => setSort(null), []);

  // Params siap kirim untuk service API. Kosong bila tidak ada sorting.
  const sortParams = {
    sortBy: sort?.key || '',
    sortOrder: sort?.order || '',
  };

  return { sort, toggleSort, resetSort, sortParams };
}
