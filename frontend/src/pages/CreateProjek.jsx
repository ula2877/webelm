import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select, Textarea } from '../components/ui/Input';
import { cn } from '../utils/helpers';
import * as projectService from '../services/projects';
import {
  PROJECT_JENIS,
  PROJECT_STATUS,
  PROJECT_URGENCY,
  buildProjectPayload,
  emptyProjectForm,
  formFromProjectDetail,
  validateProject,
} from '../utils/projects';
import { Section } from './CreateSuratQuotation';

const CFG = {
  routeBase: 'projects',
  label: 'Projek',
};

// Halaman Create/Edit Projek (data via API tb_project).
// Satu component untuk create & edit, mengikuti pola halaman Create/Edit
// Surat: header + tombol simpan kanan atas, form satu kolom penuh.
export default function CreateProjek() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);

  const [isLoadingDetail, setIsLoadingDetail] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(emptyProjectForm);
  const [clients, setClients] = useState([]);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Opsi client (tb_user) untuk dropdown Customer. Diambil dari meta
  // endpoint list yang sama - pola yang dipakai CreateUser untuk roles.
  useEffect(() => {
    let cancelled = false;
    projectService
      .fetchProjects({ perPage: 1 })
      .then((res) => {
        if (!cancelled && res?.status === 'ok' && Array.isArray(res.clients)) {
          setClients(res.clients);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Mode EDIT: isi form dari GET /api/projects/{id} ----
  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    setIsLoadingDetail(true);
    setLoadError(null);
    projectService
      .fetchProjectDetail(editId)
      .then((res) => {
        if (cancelled) return;
        if (res?.status !== 'ok' || !res.data) {
          setLoadError('Data projek tidak ditemukan.');
          return;
        }
        setForm(formFromProjectDetail(res.data));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Gagal memuat data projek.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditMode, editId]);

  const handleSubmit = async () => {
    const { valid, errors: validationErrors } = validateProject(form);
    setErrors(validationErrors);
    if (!valid) {
      setNotice({ type: 'error', message: 'Lengkapi field wajib sebelum menyimpan.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = buildProjectPayload(form);
      const res = isEditMode
        ? await projectService.updateProject(editId, payload)
        : await projectService.saveProject(payload);
      if (res?.status !== 'ok' || (!isEditMode && !res.data?.id)) {
        setNotice({ type: 'error', message: res?.message || 'Gagal menyimpan projek.' });
        return;
      }
      navigate(`/${CFG.routeBase}`, {
        state: {
          notice: {
            type: 'success',
            message: isEditMode
              ? 'Perubahan projek berhasil disimpan.'
              : 'Projek berhasil disimpan.',
          },
        },
      });
    } catch (err) {
      // Tampilkan pesan validasi per-field dari Laravel (422) kalau ada.
      const fieldErrors = err?.errors
        ? Object.entries(err.errors)
            .map(([field, msgs]) => `${field}: ${[].concat(msgs).join(' ')}`)
            .join(' | ')
        : '';
      setNotice({
        type: 'error',
        message: fieldErrors
          ? `Validasi gagal - ${fieldErrors}`
          : err.message || 'Gagal menyimpan projek.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(`/${CFG.routeBase}`)}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">
              {isEditMode ? `Edit ${CFG.label}` : `Buat ${CFG.label}`}
            </h2>
            <p className="page-subtitle">
              {isEditMode ? 'Edit data projek' : 'Buat data projek baru'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={handleSubmit}
            loading={isSubmitting}
            className="whitespace-nowrap"
          >
            {isEditMode ? 'Simpan Perubahan' : 'Simpan'}
          </Button>
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div
          className={cn(
            'flex items-start gap-3 p-4 rounded-lg border',
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}
          role="status"
        >
          <p className="text-sm flex-1">{notice.message}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity text-sm"
            aria-label="Tutup notifikasi"
          >
            ✕
          </button>
        </div>
      )}

      {isEditMode && isLoadingDetail && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      )}
      {isEditMode && loadError && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border bg-red-50 border-red-200 text-red-800"
          role="alert"
        >
          <p className="text-sm flex-1">{loadError}</p>
        </div>
      )}

      {(!isEditMode || (!isLoadingDetail && !loadError)) && (
        <Card>
          <Section title="Informasi Projek">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Kode Projek"
                value={form.code}
                onChange={(e) => setField('code', e.target.value)}
                error={errors.code}
                placeholder="Masukkan kode projek"
              />
              <Input
                label="Nama Projek"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                error={errors.name}
                placeholder="Masukkan nama projek"
              />
              <div className="sm:col-span-2">
                <Select
                  label="Customer / Instansi"
                  value={form.id_client}
                  onChange={(e) => setField('id_client', e.target.value)}
                  error={errors.id_client}
                >
                  <option value="">Pilih customer</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Textarea
                  label="Deskripsi Projek"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Masukkan deskripsi projek"
                />
              </div>
              <Input
                label="Tanggal Mulai"
                type="date"
                value={form.startDate}
                onChange={(e) => setField('startDate', e.target.value)}
                error={errors.startDate}
              />
              <Input
                label="Tanggal Estimasi"
                type="date"
                value={form.estimasiDate}
                onChange={(e) => setField('estimasiDate', e.target.value)}
                error={errors.estimasiDate}
              />
              <Input
                label="Tanggal Selesai"
                type="date"
                value={form.endDate}
                onChange={(e) => setField('endDate', e.target.value)}
                error={errors.endDate}
              />
              <Select
                label="Jenis Projek"
                value={form.jenis}
                onChange={(e) => setField('jenis', e.target.value)}
                error={errors.jenis}
              >
                <option value="">Pilih jenis</option>
                {PROJECT_JENIS.map((j) => (
                  <option key={j.value} value={j.value}>
                    {j.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                error={errors.status}
              >
                <option value="">Pilih status</option>
                {PROJECT_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Urgency"
                value={form.urgency}
                onChange={(e) => setField('urgency', e.target.value)}
                error={errors.urgency}
              >
                {PROJECT_URGENCY.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Harga"
                type="number"
                min="0"
                step="1"
                value={form.harga}
                onChange={(e) => setField('harga', e.target.value)}
                error={errors.harga}
                placeholder="Masukkan harga"
              />
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.is_proposed}
                    onChange={(e) => setField('is_proposed', e.target.checked)}
                    className="w-4 h-4 rounded accent-primary-600"
                  />
                  <span className="font-medium">Projek usulan (is_proposed)</span>
                </label>
              </div>
            </div>
          </Section>
        </Card>
      )}
    </div>
  );
}
