import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import * as usersService from '../services/users';

// Searchable select user tunggal/ganda berdasarkan NAMA LEVEL.
// Level di-resolve dari GET /api/users (meta roles) supaya tidak hardcode
// id_level: mis. 'client' -> 3, ['worker','worker pcb'] -> [2,10].
//
// Props:
//   label, placeholder, levelNames (string|string[]), multiple (bool),
//   value (id | id[]), onChange (id | id[]), error, excludeIds (id[])
export default function ProjectUserSelect({
  label,
  placeholder = 'Cari...',
  levelNames,
  multiple = false,
  value,
  onChange,
  error,
  excludeIds = [],
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [levelIds, setLevelIds] = useState(null);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  const wanted = useMemo(
    () => (Array.isArray(levelNames) ? levelNames : [levelNames]).map((s) => String(s).toLowerCase()),
    [levelNames]
  );

  // excludeIds sebagai string stabil supaya tidak memicu refetch tiap render.
  const excludeKey = useMemo(
    () => JSON.stringify((excludeIds || []).map(Number)),
    [excludeIds]
  );

  // Resolve nama level -> id_level via roles endpoint (sekali saja).
  useEffect(() => {
    let cancelled = false;
    usersService
      .fetchUsers({ perPage: 1 })
      .then((res) => {
        if (cancelled || res?.status !== 'ok' || !Array.isArray(res.roles)) return;
        const ids = res.roles
          .filter((r) => wanted.includes(String(r.nama_level || '').toLowerCase()))
          .map((r) => r.id_level);
        if (!cancelled) setLevelIds(ids);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Muat opsi user per level + search (digabung bila multi level).
  useEffect(() => {
    if (!levelIds || levelIds.length === 0) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      levelIds.map((level) =>
        usersService
          .fetchUsers({ search: debouncedQuery, level, page: 1, perPage: 20 })
          .catch(() => null)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const excluded = new Set(JSON.parse(excludeKey));
        const seen = new Set();
        const merged = [];
        (results || []).forEach((res) => {
          (res?.data || []).forEach((u) => {
            if (!seen.has(u.id) && !excluded.has(Number(u.id))) {
              seen.add(u.id);
              merged.push(u);
            }
          });
        });
        setOptions(merged);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [levelIds, debouncedQuery, excludeKey]);

  // Sinkron label terpilih dari value (id) + opsi yang sudah dimuat.
  useEffect(() => {
    const ids = (multiple ? value || [] : value ? [value] : []).map(Number);
    setSelected((prev) => {
      const byId = new Map([...prev, ...options].map((u) => [Number(u.id), u]));
      return ids.map((id) => byId.get(id)).filter(Boolean);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options, multiple]);

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open ]);

  const pick = (user) => {
    if (multiple) {
      const ids = (value || []).map(Number);
      if (!ids.includes(Number(user.id))) onChange([...ids, Number(user.id)]);
      setQuery('');
    } else {
      onChange(Number(user.id));
      setOpen(false);
      setQuery('');
    }
  };

  const unpick = (id) => {
    if (multiple) {
      onChange((value || []).map(Number).filter((v) => v !== Number(id)));
    } else {
      onChange('');
    }
  };

  const displaySingle = selected.length > 0 ? selected[0] : null;

  return (
    <div>
      {label && (
        <span className="block text-sm font-medium text-text-primary mb-1.5">{label}</span>
      )}
      <div ref={boxRef} className="relative">
        {/* Chips untuk mode multiple */}
        {multiple && selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selected.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 text-primary-700 text-xs font-medium"
              >
                {u.nama || u.username}
                <button
                  type="button"
                  onClick={() => unpick(u.id)}
                  className="hover:text-primary-900 transition-colors"
                  aria-label={`Hapus ${u.nama || u.username}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={multiple ? query : open ? query : displaySingle ? displaySingle.nama || displaySingle.username || '' : query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!multiple) onChange('');
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={multiple || !displaySingle ? placeholder : ''}
            className="w-full pl-10 pr-10 py-2.5 text-sm border border-border rounded-lg bg-white text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {multiple || !displaySingle ? (
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          ) : (
            <button
              type="button"
              onClick={() => unpick(displaySingle.id)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text-primary transition-colors"
              aria-label="Hapus pilihan"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
            {loading ? (
              <p className="px-3 py-2.5 text-sm text-text-muted">Memuat...</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-text-muted">
                {levelIds === null ? 'Memuat...' : 'Tidak ada hasil.'}
              </p>
            ) : (
              options.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pick(u)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm font-medium text-text-primary truncate">
                    {u.nama || '-'}
                  </p>
                  {u.username && (
                    <p className="text-xs text-text-muted truncate">@{u.username}</p>
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
