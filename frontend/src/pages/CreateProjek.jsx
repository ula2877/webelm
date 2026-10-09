import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select } from '../components/ui/Input';
import { cn } from '../utils/helpers';
import * as projectService from '../services/projects';
import {
  PROJECT_STATUS,
  PROJECT_URGENCY,
  buildProjectPayload,
  emptyProjectForm,
  formFromProjectDetail,
  validateProject,
} from '../utils/projects';
import { Section } from './CreateSuratQuotation';
import ProjectUserSelect from '../components/ProjectUserSelect';
import ProjectDescriptionEditor from '../components/ProjectDescriptionEditor';

const CFG = {
  routeBase: 'projects',
};

/** Tampilkan digit sebagai "3.000.000" saat diketik; value tetap digit. */
function formatHargaDisplay(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  return new Intl.NumberFormat('id-ID').format(Number(digits));
}

// Halaman Tambah/Edit Project (data via API tb_project).
// Urutan field mengikuti referensi: Client, Judul, Deskripsi,
// 3 tanggal, Worker, Harga/Urgency/Status.
export default function CreateProjek() {
  const navigate = useNavigate();
  const { uuid } = useParams();
  const isEditMode = Boolean(uuid);

  const [isLoadingDetail, setIsLoadingDetail] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(() => ({
    ...emptyProjectForm(),
    status: 'running',
  }));
  const [originalForm, setOriginalForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ---- Mode EDIT: isi form dari GET /api/projects/uuid/{uuid} ----
  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    setIsLoadingDetail(true);
    setLoadError(null);
    projectService
      .fetchProjectDetailByUuid(uuid)
      .then((res) => {
        if (cancelled) return;
        if (res?.status !== 'ok' || !res.data) {
          setLoadError('Data projek tidak ditemukan.');
          return;
        }
        const formData = formFromProjectDetail(res.data);
        setForm(formData);
        setOriginalForm(formData);
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
  }, [isEditMode, uuid]);

  // Reset ke data awal yang dimuat dari server (edit) atau kosong (create).
  const handleReset = () => {
    if (isEditMode && originalForm) {
      setForm({ ...originalForm });
    } else {
      setForm({ ...emptyProjectForm(), status: 'running' });
    }
    setErrors({});
    setNotice(null);
  };

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
        ? await projectService.updateProjectByUuid(uuid, payload)
        : await projectService.saveProject(payload);
      if (res?.status !== 'ok' || (!isEditMode && !res.data?.id)) {
        setNotice({ type: 'error', message: res?.message || 'Gagal menyimpan projek.' });
        return;
      }
      // Setelah edit berhasil, arahkan ke halaman View dengan UUID yang sama.
      if (isEditMode) {
        navigate(`/projects/${uuid}/view`, {
          state: {
            notice: {
              type: 'success',
              message: 'Perubahan projek berhasil disimpan.',
            },
          },
        });
      } else {
        navigate(`/${CFG.routeBase}`, {
          state: {
            notice: {
              type: 'success',
              message: 'Projek berhasil disimpan.',
            },
          },
        });
      }
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
            onClick={() => isEditMode ? navigate(`/projects/${uuid}/view`) : navigate(`/${CFG.routeBase}`)}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">{isEditMode ? 'Edit Project' : 'Tambah Project'}</h2>
            <p className="page-subtitle">
              {isEditMode
                ? 'Edit data project'
                : 'Tambahkan project baru ke dalam sistem dengan informasi lengkap dan sesuai.'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {isEditMode && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleReset}
              className="whitespace-nowrap"
            >
              Reset
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSubmit}
            loading={isSubmitting}
            className="whitespace-nowrap"
          >
            {isEditMode ? 'Simpan Perubahan' : 'Simpan Project'}
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
        <div className="w-full max-w-full md:max-w-[90%] lg:max-w-[75%]">
          <Section title="Informasi Proyek">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Client: searchable select dari tb_user level client. */}
              <div className="sm:col-span-2 lg:col-span-3">
                <ProjectUserSelect
                  label="Client *"
                  placeholder="Cari client..."
                  levelNames="client"
                  value={form.id_client}
                  onChange={(v) => setField('id_client', v)}
                  error={errors.id_client}
                />
              </div>

              {/* Judul */}
              <div className="sm:col-span-2 lg:col-span-3">
                <Input
                  label="Judul *"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  error={errors.name}
                  placeholder="Masukkan judul project"
                />
              </div>

              {/* Deskripsi: WYSIWYG (HTML + upload gambar ke server). */}
              <div className="sm:col-span-2 lg:col-span-3">
                <ProjectDescriptionEditor
                  value={form.description}
                  onChange={(v) => setField('description', v)}
                  error={errors.description}
                  uploadingNotice={(msg) =>
                    setNotice({ type: 'error', message: msg })
                  }
                />
              </div>

              {/* Tanggal: 3 kolom di desktop. */}
              <Input
                label="Tanggal Mulai"
                type="date"
                value={form.startDate}
                onChange={(e) => setField('startDate', e.target.value)}
                error={errors.startDate}
              />
              <Input
                label="Tanggal Estimasi Selesai"
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

              {/* Worker: searchable multiple select dari tb_user level worker. */}
              <div className="sm:col-span-2 lg:col-span-3">
                <ProjectUserSelect
                  label="Worker"
                  placeholder="Cari worker..."
                  levelNames={['worker', 'worker pcb']}
                  multiple
                  value={form.worker_ids}
                  onChange={(v) => setField('worker_ids', v)}
                  error={errors.worker_ids}
                />
              </div>

              {/* Harga / Urgency / Status: 3 kolom di desktop. */}
              <Input
                label="Harga"
                inputMode="numeric"
                value={formatHargaDisplay(form.harga)}
                onChange={(e) =>
                  setField('harga', String(e.target.value).replace(/\D/g, '').slice(0, 15))
                }
                error={errors.harga}
                placeholder="Rp 0"
              />
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
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                error={errors.status}
              >
                {PROJECT_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}