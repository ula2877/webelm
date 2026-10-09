import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Paperclip,
  Plus,
  TrendingUp,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import Card, { CardTitle } from './ui/Card';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import Modal from './ui/Modal';
import ProgressBar from './ui/ProgressBar';
import { Textarea } from './ui/Input';
import * as projectService from '../services/projects';
import {
  ACCEPT_ATTR,
  ACCEPTED_EXTENSIONS,
  IMAGE_EXTENSIONS,
  INLINE_PREVIEW_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_PROGRESS_FILES,
  fileExtension,
  fileVisual,
  formatSize,
  triggerDownload,
} from '../utils/fileTypes';

// Jumlah riwayat yang tampil sebelum tombol "Lihat semua".
const HISTORY_PREVIEW_COUNT = 3;

// Kunci unik untuk file yang belum diunggah (preview lokal).
let fileKeySeed = 0;
function nextFileKey() {
  fileKeySeed += 1;
  return `pf-${fileKeySeed}-${Date.now()}`;
}

/** Paksa nilai ke integer 0-100 (aman untuk slider maupun data server). */
function clampProgress(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * Thumbnail untuk satu lampiran. Gambar ditampilkan sebagai thumbnail
 * proporsional; tipe lain memakai ikon. Bila gambar gagal dimuat, jatuh ke
 * ikon (placeholder informatif) - bukan URL mentah.
 */
function FileThumb({ ext, src, alt, size = 'w-11 h-11' }) {
  const [failed, setFailed] = useState(false);
  const { Icon, className } = fileVisual(ext);

  if (IMAGE_EXTENSIONS.includes(ext) && src && !failed) {
    return (
      <span
        className={`${size} rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-border block`}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`${size} rounded-lg flex items-center justify-center shrink-0 ${className}`}
    >
      <Icon className="w-5 h-5" />
    </span>
  );
}

/** created_at dari MySQL ("YYYY-MM-DD HH:mm:ss") -> label id-ID. */
function formatTanggal(value) {
  if (!value) return '-';
  const normalized = String(value).includes('T')
    ? String(value)
    : String(value).replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Card "Progress Projek" pada halaman View Projek.
 *
 * Progress diambil dari tabel existing `tb_progress` (id_project di-resolve
 * backend dari uuid_project di URL). Nilai utama = catatan terbaru
 * (created_at terbaru, id sebagai tie-breaker), BUKAN penjumlahan riwayat.
 *
 * Lampiran disimpan ke tb_files (id_parent = projek ini) dan ID-nya disimpan
 * sebagai JSON array di tb_progress.id_file. Tidak ada perubahan skema.
 */
export default function ProjectProgress({ uuid }) {
  const fileInputRef = useRef(null);
  const selectedFilesRef = useRef([]);

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [deskripsi, setDeskripsi] = useState('');
  const [deskripsiError, setDeskripsiError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(null);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const [busyAttachmentId, setBusyAttachmentId] = useState(null);
  const [preview, setPreview] = useState(null);

  // Preview lokal file yang belum diunggah (untuk revoke object URL saat lepas).
  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(
    () => () => {
      selectedFilesRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    },
    []
  );

  // Revoke object URL preview gambar saat ditutup / diganti.
  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview]
  );

  const loadProgress = useCallback(async () => {
    if (!uuid) return;

    setIsLoading(true);
    setListError('');
    try {
      const response = await projectService.fetchProjectProgress(uuid);
      setItems(
        response.status === 'ok' && Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      setListError(err.message || 'Gagal memuat progress projek.');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    setShowAllHistory(false);
    setNotice(null);
    loadProgress();
  }, [loadProgress]);

  // Data sudah terurut terbaru -> terlama dari backend.
  const latest = items.length > 0 ? items[0] : null;
  const latestValue = latest ? clampProgress(latest.progress) : 0;
  const visibleHistory = showAllHistory ? items : items.slice(0, HISTORY_PREVIEW_COUNT);

  const clearFiles = () => {
    selectedFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setSelectedFiles([]);
    setFileError('');
    setUploadPercent(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validateAttachment = (file) => {
    const ext = fileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `format tidak didukung (${ACCEPTED_EXTENSIONS.join(', ')}).`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `ukuran melebihi ${formatSize(MAX_FILE_SIZE)}.`;
    }
    return '';
  };

  const addFiles = (incoming) => {
    const list = Array.from(incoming || []);
    if (list.length === 0) return;

    const errors = [];
    const next = [...selectedFiles];

    for (const file of list) {
      if (next.length >= MAX_PROGRESS_FILES) {
        errors.push(`Maksimal ${MAX_PROGRESS_FILES} lampiran per catatan.`);
        break;
      }

      const error = validateAttachment(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
        continue;
      }

      // Hindari duplikat (nama + ukuran sama).
      if (
        next.some(
          (item) => item.file.name === file.name && item.file.size === file.size
        )
      ) {
        continue;
      }

      const ext = fileExtension(file.name);
      next.push({
        id: nextFileKey(),
        file,
        previewUrl: IMAGE_EXTENSIONS.includes(ext)
          ? URL.createObjectURL(file)
          : null,
      });
    }

    setSelectedFiles(next);
    setFileError(errors.join(' '));
    setSubmitError('');
  };

  const removeFile = (id) => {
    const target = selectedFiles.find((item) => item.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    setSelectedFiles((prev) => prev.filter((item) => item.id !== id));
    setFileError('');
  };

  const handleFileInput = (event) => {
    addFiles(event.target.files);
    // Reset agar file yang sama bisa dipilih ulang setelah dihapus.
    event.target.value = '';
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    addFiles(event.dataTransfer.files);
  };

  const openModal = () => {
    clearFiles();
    setProgressValue(0); // nilai awal slider 0, sesuai spesifikasi
    setDeskripsi('');
    setDeskripsiError('');
    setSubmitError('');
    setNotice(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return; // jangan tutup saat penyimpanan berjalan
    clearFiles();
    setIsModalOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving) return; // cegah pengiriman berulang

    const trimmed = deskripsi.trim();
    if (trimmed === '') {
      setDeskripsiError('Deskripsi perkembangan pekerjaan wajib diisi.');
      return;
    }

    if (selectedFiles.length > MAX_PROGRESS_FILES) {
      setFileError(`Maksimal ${MAX_PROGRESS_FILES} lampiran per catatan.`);
      return;
    }

    setDeskripsiError('');
    setFileError('');
    setSubmitError('');
    setIsSaving(true);
    setUploadPercent(null);

    try {
      const response = await projectService.saveProjectProgress(uuid, {
        progress: clampProgress(progressValue),
        deskripsi: trimmed,
        files: selectedFiles.map((item) => item.file),
        onProgress: (percent) => setUploadPercent(percent),
      });
      setNotice({
        type: 'success',
        message: response.message || 'Progress berhasil disimpan.',
      });
      setIsModalOpen(false);
      clearFiles();
      setDeskripsi('');
      // Muat ulang daftar progress saja (bukan seluruh halaman).
      await loadProgress();
    } catch (err) {
      // Pertahankan input pengguna; ambil pesan error per-field yang jelas.
      const errors = err?.errors || {};
      const firstKey = Object.keys(errors)[0];
      const fieldError =
        errors?.deskripsi?.[0] ||
        errors?.progress?.[0] ||
        (firstKey ? errors[firstKey]?.[0] : '');
      setSubmitError(fieldError || err.message || 'Gagal menyimpan progress.');
    } finally {
      setIsSaving(false);
      setUploadPercent(null);
    }
  };

  // Buka lampiran lewat endpoint backend terautentikasi (bukan URL storage
  // publik langsung) lalu jadikan object URL di browser.
  const handleOpenAttachment = async (file) => {
    setNotice(null);
    setBusyAttachmentId(file.id);
    try {
      const ext = fileExtension(file.name);
      const response = await projectService.downloadProjectFile(uuid, file.id);
      const objectUrl = URL.createObjectURL(response.data);

      if (IMAGE_EXTENSIONS.includes(ext)) {
        setPreview({ url: objectUrl, name: file.name });
      } else if (INLINE_PREVIEW_EXTENSIONS.includes(ext)) {
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } else {
        triggerDownload(objectUrl, file.name);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      }
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'Gagal membuka lampiran.',
      });
    } finally {
      setBusyAttachmentId(null);
    }
  };

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-primary-600" />
            </span>
            <CardTitle>Progress Projek</CardTitle>
          </div>
          <Button
            type="button"
            size="sm"
            icon={Plus}
            onClick={openModal}
            className="whitespace-nowrap"
          >
            Tambah Progress
          </Button>
        </div>

        {notice && (
          <div
            className={`flex items-start gap-3 p-3 mb-4 rounded-lg border text-sm ${
              notice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
            role="status"
          >
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <p className="flex-1">{notice.message}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Tutup notifikasi"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : listError ? (
          <p className="text-sm text-error py-2">{listError}</p>
        ) : (
          <>
            {/* Nilai progress terbaru */}
            <div className="flex items-end justify-between gap-3 mb-2">
              <p className="text-3xl sm:text-4xl font-bold text-primary-600 tabular-nums leading-none">
                {latestValue}%
              </p>
              <p className="text-xs text-text-muted text-right">
                {latest
                  ? `Diperbarui ${formatTanggal(latest.created_at)}`
                  : 'Belum ada progress'}
              </p>
            </div>
            <ProgressBar value={latestValue} />

            {/* Riwayat progress */}
            <div className="mt-6 pt-5 border-t border-border">
              <p className="text-sm font-semibold text-text-primary mb-3">
                Riwayat Progress
              </p>

              {items.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="Belum ada progress"
                  description="Projek ini belum memiliki catatan progress. Klik Tambah Progress untuk mencatat perkembangan pertama."
                />
              ) : (
                <>
                  <ul className="space-y-3">
                    {visibleHistory.map((item) => {
                      const value = clampProgress(item.progress);
                      const attachments = Array.isArray(item.files)
                        ? item.files
                        : [];

                      return (
                        <li
                          key={item.id}
                          className="p-3 rounded-lg border border-border bg-white"
                        >
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <span className="text-sm font-semibold text-primary-600 tabular-nums">
                              {value}%
                            </span>
                            <span className="text-xs text-text-muted">
                              {formatTanggal(item.created_at)}
                            </span>
                          </div>
                          <ProgressBar value={value} className="mb-2" />
                          <p className="text-sm text-text-secondary whitespace-pre-line break-words">
                            {item.deskripsi}
                          </p>

                          {attachments.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
                                <Paperclip className="w-3 h-3" />
                                Lampiran ({attachments.length})
                              </p>
                              <ul className="flex flex-wrap gap-2">
                                {attachments.map((file) => {
                                  const ext =
                                    file.extension || fileExtension(file.name);
                                  const isBusy = busyAttachmentId === file.id;
                                  return (
                                    <li key={file.id}>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenAttachment(file)}
                                        disabled={isBusy}
                                        title={file.name}
                                        className="flex items-center gap-2 p-1.5 pr-3 rounded-lg border border-border bg-white hover:border-primary-300 hover:bg-primary-50/40 transition-colors max-w-[220px] disabled:opacity-60"
                                      >
                                        {isBusy ? (
                                          <span className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                                          </span>
                                        ) : (
                                          <FileThumb
                                            ext={ext}
                                            src={file.exists === false ? null : file.url}
                                            alt={file.name}
                                            size="w-10 h-10"
                                          />
                                        )}
                                        <span className="min-w-0 text-left">
                                          <span className="block text-xs text-text-primary truncate">
                                            {file.name}
                                          </span>
                                          <span className="block text-[10px] text-text-muted">
                                            {file.size_human || ''}
                                          </span>
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {items.length > HISTORY_PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => setShowAllHistory((prev) => !prev)}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      {showAllHistory ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          Tampilkan lebih sedikit
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          Lihat semua ({items.length})
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Modal Tambah Progress */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Tambah Progress"
        size="2xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            {isSaving && uploadPercent !== null && selectedFiles.length > 0 && (
              <span className="text-xs text-text-muted tabular-nums mr-auto">
                Mengunggah... {uploadPercent}%
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="progress-form"
              loading={isSaving}
              disabled={isSaving}
            >
              Simpan Progress
            </Button>
          </div>
        }
      >
        <form
          id="progress-form"
          onSubmit={handleSubmit}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Kolom kiri: slider progress + deskripsi */}
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="progress-slider"
                  className="block text-sm font-medium text-text-primary"
                >
                  Progress
                </label>
                <span className="text-2xl font-bold text-primary-600 tabular-nums">
                  {progressValue}%
                </span>
              </div>
              <input
                id="progress-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                value={progressValue}
                onChange={(e) => setProgressValue(clampProgress(e.target.value))}
                className="w-full h-2 cursor-pointer accent-primary-600"
                aria-label="Nilai progress"
                disabled={isSaving}
              />
              <div className="flex justify-between mt-1 text-xs text-text-muted">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <Textarea
              label="Deskripsi Perkembangan"
              placeholder="Jelaskan perkembangan pekerjaan..."
              rows={6}
              value={deskripsi}
              error={deskripsiError}
              onChange={(e) => {
                setDeskripsi(e.target.value);
                if (deskripsiError) setDeskripsiError('');
                if (submitError) setSubmitError('');
              }}
              disabled={isSaving}
            />

            {submitError && (
              <p className="text-xs text-error" role="alert">
                {submitError}
              </p>
            )}
          </div>

          {/* Kolom kanan: multiple upload + daftar file terpilih */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-text-primary">
                Lampiran (opsional)
              </span>
              <span className="text-xs text-text-muted tabular-nums">
                {selectedFiles.length}/{MAX_PROGRESS_FILES}
              </span>
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-label="Area upload lampiran progress"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (fileInputRef.current) fileInputRef.current.click();
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-border bg-gray-50 hover:border-primary-300 hover:bg-primary-50/60'
              } ${isSaving ? 'pointer-events-none opacity-60' : ''}`}
            >
              <UploadCloud
                className={`w-6 h-6 mx-auto mb-1.5 ${
                  dragActive ? 'text-primary-600' : 'text-text-muted'
                }`}
              />
              <p className="text-sm text-text-primary font-medium">
                Seret &amp; letakkan file di sini
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                atau klik untuk memilih beberapa file sekaligus
              </p>
              <p className="text-xs text-text-muted mt-1.5">
                PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPG/PNG/WEBP/GIF, ZIP/RAR/7Z,
                TXT, CSV - maks {formatSize(MAX_FILE_SIZE)}/file, maks{' '}
                {MAX_PROGRESS_FILES} file
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              onChange={handleFileInput}
              className="hidden"
              disabled={isSaving}
            />

            {fileError && (
              <p className="mt-2 text-xs text-error" role="alert">
                {fileError}
              </p>
            )}

            {selectedFiles.length > 0 ? (
              <ul className="mt-3 space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {selectedFiles.map((item) => {
                  const ext = fileExtension(item.file.name);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 p-2 rounded-lg border border-border bg-white"
                    >
                      <FileThumb
                        ext={ext}
                        src={item.previewUrl}
                        alt={item.file.name}
                        size="w-10 h-10"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm text-text-primary truncate"
                          title={item.file.name}
                        >
                          {item.file.name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatSize(item.file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        disabled={isSaving}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                        title="Hapus dari daftar"
                        aria-label={`Hapus ${item.file.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-text-muted text-center py-2">
                Belum ada file yang dipilih.
              </p>
            )}
          </div>
        </form>
      </Modal>

      {/* Preview gambar lampiran */}
      <Modal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name || 'Preview'}
        size="xl"
      >
        <div className="flex items-center justify-center bg-gray-50 rounded-lg p-2 min-h-[200px]">
          {preview?.url && (
            <img
              src={preview.url}
              alt={preview?.name || 'Preview'}
              className="max-h-[70vh] max-w-full object-contain rounded"
            />
          )}
        </div>
      </Modal>
    </>
  );
}
