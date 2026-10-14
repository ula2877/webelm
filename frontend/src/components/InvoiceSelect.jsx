import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import * as suratService from '../services/surat';

// Searchable select invoice (tb_surat jenis='invoice') mengikuti pola
// ProjectSelect: opsi dimuat dari GET /api/surat?jenis=invoice (backend
// menampilkan seluruh invoice aktif), pencarian di-debounce 400ms.
// Identitas utama pilihan = nomor invoice; nama customer (pengirim)
// ditampilkan sebagai pembeda.
//
// Props:
//   label, placeholder, value (id invoice|null), onChange (id invoice|null),
//   error, selectedLabel (string opsional untuk memulihkan label saat mode
//   edit bila invoice belum ada di opsi yang dimuat).
export default function InvoiceSelect({
  label,
  placeholder = 'Cari invoice...',
  value,
  onChange,
  error,
  selectedLabel = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  // Label terpilih: pakai selectedLabel (mis. dari data surat yang dimuat
  // saat edit) selama invoice belum ketemu di opsi yang dimuat.
  const [restoredLabel, setRestoredLabel] = useState(selectedLabel);
  useEffect(() => {
    setRestoredLabel(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Muat opsi invoice + pencarian. GET /api/surat hanya mengembalikan
  // surat aktif (deleted_at NULL) - tidak ada invoice yang dihapus yang
  // bisa dipilih sebagai sumber.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    suratService
      .fetchSurat({ search: debouncedQuery, jenis: 'invoice', page: 1, perPage: 20 })
      .then((res) => {
        if (cancelled || res?.status !== 'ok') return;
        setOptions(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Label terpilih: opsi yang cocok (pertahankan agar label tidak hilang
  // setelah query berubah) atau label hasil muat data surat saat edit.
  const selectedOption = options.find((inv) => Number(inv.id) === Number(value)) || null;
  const display = selectedOption
    ? `${selectedOption.nomor || '-'}${selectedOption.pengirim ? ` — ${selectedOption.pengirim}` : ''}`
    : restoredLabel;

  const pick = (invoice) => {
    onChange(Number(invoice.id));
    setQuery('');
    setRestoredLabel('');
    setOpen(false);
  };

  const unpick = () => {
    onChange(null);
    setRestoredLabel('');
  };

  return (
    <div>
      {label && (
        <span className="block text-sm font-medium text-text-primary mb-1.5">{label}</span>
      )}
      <div ref={boxRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={open ? query : display || ''}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange(null);
              setRestoredLabel('');
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={display ? '' : placeholder}
            className="w-full pl-10 pr-10 py-2.5 text-sm border border-border rounded-lg bg-white text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {display && !open ? (
            <button
              type="button"
              onClick={unpick}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text-primary transition-colors"
              aria-label="Hapus pilihan"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          )}
        </div>
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
            {loading ? (
              <p className="px-3 py-2.5 text-sm text-text-muted">Memuat...</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-text-muted">Tidak ada hasil.</p>
            ) : (
              options.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => pick(inv)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm font-medium text-text-primary truncate">
                    {inv.nomor || '-'}
                    {inv.pengirim && (
                      <span className="font-normal text-text-secondary"> — {inv.pengirim}</span>
                    )}
                  </p>
                  {inv.tanggal && (
                    <p className="text-xs text-text-muted">{inv.tanggal}</p>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  );
}
