import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, User, Users, Calendar, DollarSign, AlertTriangle } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import ProjectFileManager from '../components/ProjectFileManager';
import ProjectProgress from '../components/ProjectProgress';
import * as projectService from '../services/projects';
import { rupiah } from '../utils/quotation';
import {
  PROJECT_STATUS,
  PROJECT_URGENCY,
  PROJECT_PELUNASAN,
  PROJECT_STATUS_VARIANT,
  PROJECT_URGENCY_VARIANT,
  PROJECT_PELUNASAN_VARIANT,
  projectStatusLabel,
  projectUrgencyLabel,
  projectPelunasanLabel,
} from '../utils/projects';
import DOMPurify from 'dompurify';

// Card File Manager disembunyikan sementara dari halaman View Projek.
// Komponen, source code, dan seluruh fungsinya (upload/preview/download/delete)
// tetap ada. Ubah nilai ini menjadi `true` untuk menampilkan kembali card-nya.
const SHOW_FILE_MANAGER = false;

// Pastikan tautan pada deskripsi selalu dibuka dengan aman: tab baru dan
// tanpa akses ke window asal (rel noopener/noreferrer). Hook dipasang sekali
// agar tidak terduplikasi saat Fast Refresh di dev.
let safeLinkHookRegistered = false;
function ensureSafeLinkHook() {
  if (safeLinkHookRegistered) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  safeLinkHookRegistered = true;
}

export default function ViewProjek() {
  const navigate = useNavigate();
  const { uuid } = useParams();
  const [project, setProject] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    projectService
      .fetchProjectDetailByUuid(uuid)
      .then((res) => {
        if (cancelled) return;
        if (res?.status !== 'ok' || !res.data) {
          setError('Projek tidak ditemukan.');
          return;
        }
        setProject(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Gagal memuat detail projek.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uuid]);

  const getStatusBadge = (status) => {
    const variant = PROJECT_STATUS_VARIANT[status] || 'default';
    return <Badge variant={variant}>{projectStatusLabel(status)}</Badge>;
  };

  const getUrgencyBadge = (urgency) => {
    const variant = PROJECT_URGENCY_VARIANT[urgency] || 'default';
    return <Badge variant={variant}>{projectUrgencyLabel(urgency)}</Badge>;
  };

  const getPelunasanBadge = (pelunasan) => {
    const variant = PROJECT_PELUNASAN_VARIANT[pelunasan] || 'default';
    return <Badge variant={variant}>{projectPelunasanLabel(pelunasan)}</Badge>;
  };

  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === '0000-00-00') return '-';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const renderSafeHTML = (html) => {
    if (!html) return <span className="text-text-muted">Belum ada deskripsi project.</span>;
    ensureSafeLinkHook();
    const clean = DOMPurify.sanitize(html);
    return (
      <div
        dangerouslySetInnerHTML={{ __html: clean }}
        className="project-description-content"
      />
    );
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const str = String(name);
    return str
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Safely extract string value from object or return string directly
  const getStringValue = (val, fallback = '-') => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null) {
      // Try common name fields
      return String(val.nama || val.name || val.username || fallback);
    }
    return String(val);
  };

  // Safely extract photo URL from object
  const getPhotoUrl = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    return obj.foto_url || obj.foto || null;
  };

  // Render avatar with photo fallback to initials
  const renderAvatar = ({ name, photoUrl, size = 'w-10 h-10', textSize = 'text-lg' }) => {
    const safeName = getStringValue(name);
    const initials = getInitials(safeName);
    const safePhotoUrl = getStringValue(photoUrl, null);
    const hasPhoto = safePhotoUrl && safePhotoUrl.trim() !== '';

    if (hasPhoto) {
      return (
        <div className={`${size} rounded-full overflow-hidden bg-primary-100 flex-shrink-0 relative`}>
          <img
            src={safePhotoUrl}
            alt={`${safeName} - Foto profil`}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              if (e.currentTarget.nextElementSibling) {
                e.currentTarget.nextElementSibling.style.display = 'flex';
              }
            }}
          />
          <span
            className={`${textSize} font-semibold text-primary-700 absolute inset-0 flex items-center justify-center bg-primary-100`}
            style={{ display: 'none' }}
          >
            {initials}
          </span>
        </div>
      );
    }

    return (
      <div className={`${size} rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0`}>
        <span className={`${textSize} font-semibold text-primary-700`}>{initials}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
              title="Kembali"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="page-title">Detail Projek</h2>
              <p className="page-subtitle">Memuat data...</p>
            </div>
          </div>
        </div>
        <Card>
          <p className="text-sm text-text-secondary">{error}</p>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
              title="Kembali"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="page-title">Detail Projek</h2>
              <p className="page-subtitle">Data tidak tersedia.</p>
            </div>
          </div>
        </div>
        <Card>
          <p className="text-sm text-text-secondary">Projek tidak ditemukan.</p>
        </Card>
      </div>
    );
  }

  // Extract owner/client data safely
  const clientObj = project.client && typeof project.client === 'object' ? project.client : null;
  const clientName = getStringValue(clientObj?.nama, getStringValue(project.client, '-'));
  const clientPhotoUrl = getPhotoUrl(clientObj);
  const clientId = project.id_client;

  // Extract workers safely
  const workers = Array.isArray(project.workers) ? project.workers : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">{getStringValue(project.name || project.judul, 'Projek')}</h2>
            <p className="page-subtitle">{clientName}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            icon={Edit2}
            onClick={() => navigate(`/projects/${project.uuid}/edit`)}
            className="whitespace-nowrap"
          >
            Edit Project
          </Button>
        </div>
      </div>

      {/* Main Layout: Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kolom Kiri: Informasi Project + Deskripsi Project */}
        <div className="space-y-6">
          {/* Informasi Project */}
          <Card>
            <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-primary-600" />
              </span>
              Informasi Project
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Tanggal Mulai</p>
                <p className="text-sm text-text-primary flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  {formatDate(project.startDate || project.tanggal_mulai)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Estimasi Selesai</p>
                <p className="text-sm text-text-primary flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  {formatDate(project.estimasiDate || project.tanggal_estimasi)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Tanggal Selesai</p>
                <p className="text-sm text-text-primary flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  {formatDate(project.endDate || project.tanggal_selesai)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Harga</p>
                <p className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-text-muted" />
                  {rupiah(project.harga || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Pelunasan</p>
                <p className="text-sm">{getPelunasanBadge(project.pelunasan)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Urgency</p>
                <p className="text-sm">{getUrgencyBadge(project.urgency)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Status</p>
                <p className="text-sm">{getStatusBadge(project.status)}</p>
              </div>
            </div>
          </Card>

          {/* Deskripsi Project */}
          <Card>
            <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-primary-600" />
              </span>
              Deskripsi Project
            </h3>
            <div className="min-h-[120px]">
              {renderSafeHTML(project.description || project.deskripsi)}
            </div>
          </Card>
        </div>

        {/* Kolom Kanan: Owner / Customer + Tim Project + Progress Projek */}
        <div className="space-y-6">
          {/* Owner / Customer & Tim Project (satu card) */}
          <Card>
            <h3 className="text-lg font-semibold text-text-primary mb-5 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary-600" />
              </span>
              Owner / Customer &amp; Tim Project
            </h3>

            {/* Bagian Owner / Customer */}
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Owner / Customer
              </p>
              {clientName !== '-' ? (
                <div className="flex items-center gap-4">
                  {renderAvatar({ name: clientName, photoUrl: clientPhotoUrl, size: 'w-16 h-16', textSize: 'text-2xl' })}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{clientName}</p>
                    {clientId && (
                      <p className="text-xs text-text-muted">ID Customer: {clientId}</p>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={User}
                  title="Owner tidak tersedia"
                  description="Data customer tidak ditemukan untuk project ini."
                />
              )}
            </div>

            {/* Divider tipis antar bagian */}
            <div className="my-5 border-t border-border" />

            {/* Bagian Tim Project */}
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Tim Project
              </p>
              {workers.length > 0 ? (
                <div className="space-y-3">
                  {workers.map((worker) => {
                    const workerName = getStringValue(worker?.nama);
                    const workerPhotoUrl = getPhotoUrl(worker);
                    const workerId = getStringValue(worker?.id);
                    return (
                      <div
                        key={workerId}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-gray-50/50 transition-colors"
                      >
                        {renderAvatar({
                          name: workerName,
                          photoUrl: workerPhotoUrl,
                          size: 'w-10 h-10',
                          textSize: 'text-lg',
                        })}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{workerName}</p>
                          <p className="text-xs text-text-muted">ID Worker: {workerId}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Users}
                  title="Belum ada worker"
                  description="Belum ada worker yang ditugaskan ke project ini."
                />
              )}
            </div>
          </Card>

          {/* Progress Projek — menempati slot layout yang sebelumnya dipakai
              oleh card File Manager. */}
          <ProjectProgress uuid={project.uuid || uuid} />

          {/* File Manager disembunyikan sementara dari halaman View Projek.
              Komponen, source code, endpoint, dan seluruh fungsinya tetap ada.
              Untuk menampilkan kembali: ubah SHOW_FILE_MANAGER menjadi true. */}
          {SHOW_FILE_MANAGER && <ProjectFileManager uuid={project.uuid || uuid} />}
        </div>
      </div>
    </div>
  );
}