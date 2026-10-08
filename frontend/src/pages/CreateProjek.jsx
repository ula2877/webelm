import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select, Textarea } from '../components/ui/Input';
import { cn } from '../utils/helpers';
import {
  PROJECT_STATUS,
  createProject,
  emptyProjectForm,
  getProject,
  updateProject,
  validateProject,
} from '../utils/projects';
import { Section } from './CreateSuratQuotation';

const CFG = {
  routeBase: 'projects',
  label: 'Projek',
};

// Halaman Create/Edit Projek (mock frontend sementara).
// Satu component untuk create & edit, mengikuti pola halaman Create/Edit
// Surat: header + tombol simpan kanan atas, form kiri satu kolom penuh.
export default function CreateProjek() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);

  const [isLoadingDetail, setIsLoadingDetail] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(emptyProjectForm);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ---- Mode EDIT: isi form dari mock store ----
  useEffect(() => {
    if (!isEditMode) return;
    setIsLoadingDetail(true);
    setLoadError(null);
    const found = getProject(editId);
    if (!found) {
      setLoadError('Data projek tidak ditemukan.');
    } else {
      setForm({
        code: found.code || '',
        name: found.name || '',
        customer: found.customer || '',
        description: found.description || '',
        startDate: found.startDate || '',
        endDate: found.endDate || '',
        status: found.status || '',
      });
    }
    setIsLoadingDetail(false);
  }, [isEditMode, editId]);

  const handleSubmit = () => {
    const { valid, errors: validationErrors } = validateProject(form);
    setErrors(validationErrors);
    if (!valid) {
      setNotice({ type: 'error', message: 'Lengkapi field wajib sebelum menyimpan.' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditMode) {
        const updated = updateProject(editId, form);
        if (!updated) {
          setNotice({ type: 'error', message: 'Data projek tidak ditemukan.' });
          return;
        }
        navigate(`/${CFG.routeBase}`, {
          state: { notice: { type: 'success', message: 'Perubahan projek berhasil disimpan.' } },
        });
      } else {
        createProject(form);
        navigate(`/${CFG.routeBase}`, {
          state: { notice: { type: 'success', message: 'Projek berhasil disimpan.' } },
        });
      }
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
                <Input
                  label="Customer / Instansi"
                  value={form.customer}
                  onChange={(e) => setField('customer', e.target.value)}
                  error={errors.customer}
                  placeholder="Masukkan nama customer / instansi"
                />
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
                label="Tanggal Selesai"
                type="date"
                value={form.endDate}
                onChange={(e) => setField('endDate', e.target.value)}
                error={errors.endDate}
              />
              <div className="sm:col-span-2">
                <Select
                  label="Status"
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                  error={errors.status}
                >
                  <option value="">Pilih status</option>
                  {PROJECT_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Section>
        </Card>
      )}
    </div>
  );
}
