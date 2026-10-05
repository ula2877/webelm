import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import Card, { CardTitle } from './ui/Card';
import Button from './ui/Button';
import { Select } from './ui/Input';
import ConfirmDialog from './ui/ConfirmDialog';
import EmptyState from './ui/EmptyState';
import * as usersService from '../services/users';
import { formatDateTime } from '../utils/helpers';

// Harus sejajar dengan aturan backend (UserManagementController@uploadWorkerFile).
const JENIS_OPTIONS = [
  'KTP',
  'NPWP',
  'CV',
  'Surat Perjanjian Kerja',
  'Sertifikat Keahlian',
];

const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // backend: max:10240 KB (10 MB)

function fileExtension(name = '') {
  const parts = String(name).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function isImageFile(file) {
  const name = file?.filename || file?.path || file?.url || '';
  return ['jpg', 'jpeg', 'png', 'webp'].includes(fileExtension(name));
}

function formatTanggal(value) {
  if (!value) return '-';
  const normalized = String(value).includes('T')
    ? String(value)
    : String(value).replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? String(value) : formatDateTime(date);
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Preview thumbnail untuk gambar; jatuh ke ikon file jika gambar gagal dimuat. */
function FileThumbnail({ file }) {
  const [failed, setFailed] = useState(false);

  if (!failed && isImageFile(file) && file.url) {
    return (
      <img
        src={file.url}
        alt={file.filename || 'preview'}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-11 h-11 rounded-lg object-cover border border-border bg-gray-50 shrink-0"
      />
    );
  }

  return (
    <div className="w-11 h-11 rounded-lg bg-gray-100 border border-border flex items-center justify-center shrink-0">
      <FileText className="w-5 h-5 text-text-muted" />
    </div>
  );
}

/**
 * Card "Upload File Worker" + Card "File Worker" untuk halaman Edit User.
 * Hanya dirender untuk level worker / worker pcb.
 *
 * Data diambil dari tb_file_worker (berdasarkan id_user) dan file fisik
 * disimpan di storage Laravel (public disk), bukan di database.
 */
export default function WorkerFilePanel({ userId }) {
  const fileInputRef = useRef(null);

  const [jenis, setJenis] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [notice, setNotice] = useState(null);

  const [files, setFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [listError, setListError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!userId) return;

    setIsLoadingFiles(true);
    setListError('');
    try {
      const response = await usersService.fetchWorkerFiles(userId);
      setFiles(
        response.status === 'ok' && Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      setListError(err.message || 'Gagal memuat daftar file worker.');
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [userId]);

  useEffect(() => {
    setJenis('');
    setSelectedFile(null);
    setNotice(null);
    loadFiles();
  }, [loadFiles]);

  // Validasi sisi klien mengikuti rule backend (format + ukuran). Backend tetap
  // menjadi penentu akhir.
  const validateFile = (file) => {
    if (!file) return 'Silakan pilih file.';

    const extension = fileExtension(file.name);
    const mimeOk =
      !file.type || ACCEPTED_MIME_TYPES.includes(file.type) || file.type === 'application/x-pdf';

    if (!ACCEPTED_EXTENSIONS.includes(extension) || !mimeOk) {
      return 'Format file harus PDF, JPG, JPEG, PNG, atau WEBP.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'Ukuran file maksimal 10 MB.';
    }

    return '';
  };

  const handleFile = (file) => {
    if (!file) return;
    const error = validateFile(file);
    setUploadError(error);
    setSelectedFile(error ? null : file);
    setNotice(null);
  };

  const handleInputChange = (event) => {
    handleFile(event.target.files && event.target.files[0]);
    // Reset agar file yang sama bisa dipilih ulang setelah dibatalkan.
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
    handleFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    setUploadError('');
    setNotice(null);

    if (!jenis) {
      setUploadError('Silakan pilih jenis file.');
      return;
    }

    const error = validateFile(selectedFile);
    if (error) {
      setUploadError(error);
      return;
    }

    setIsUploading(true);
    try {
      const response = await usersService.uploadWorkerFile(userId, {
        jenis,
        file: selectedFile,
      });
      setNotice({
        type: 'success',
        message: response.message || 'File berhasil diunggah.',
      });
      setSelectedFile(null);
      setJenis('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadFiles();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'Gagal mengunggah file.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmTarget) return;

    setIsDeleting(true);
    try {
      const response = await usersService.deleteWorkerFileById(
        confirmTarget.id,
        userId
      );
      setNotice({
        type: 'success',
        message: response.message || 'File berhasil dihapus.',
      });
      setConfirmTarget(null);
      await loadFiles();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'Gagal menghapus file.',
      });
      setConfirmTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const openFile = (file) => {
    if (!file || !file.url) return;
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {/* =============== Card: Upload File Worker =============== */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <UploadCloud className="w-5 h-5 text-primary-600" />
          <CardTitle>Upload File Worker</CardTitle>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Jenis file: KTP, NPWP, CV, Surat Perjanjian Kerja, atau Sertifikat
          Keahlian.
        </p>

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

        <div className="space-y-4">
          <Select
            label="Jenis File"
            value={jenis}
            onChange={(event) => {
              setJenis(event.target.value);
              if (uploadError) setUploadError('');
            }}
            disabled={isUploading}
          >
            <option value="">Pilih Jenis File</option>
            {JENIS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>

          {/* Drag & drop area - file dipilih dulu, upload saat tombol ditekan */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Area upload file worker"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current && fileInputRef.current.click();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-primary-500 bg-primary-50'
                : 'border-border bg-gray-50 hover:border-primary-300 hover:bg-primary-50/60'
            } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
          >
            <UploadCloud
              className={`w-8 h-8 mx-auto mb-2 ${
                dragActive ? 'text-primary-600' : 'text-text-muted'
              }`}
            />
            <p className="text-sm text-text-primary font-medium">
              Seret &amp; letakkan file di sini
            </p>
            <p className="text-xs text-text-muted mt-1">
              atau klik untuk memilih file dari file explorer
            </p>
            <p className="text-xs text-text-muted mt-2">
              Format PDF, JPG, JPEG, PNG, WEBP - maksimal 10 MB
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={handleInputChange}
            className="hidden"
            disabled={isUploading}
          />

          {selectedFile && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-white">
              <FileText className="w-4 h-4 text-primary-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-text-muted">
                  {formatSize(selectedFile.size)} - siap diunggah
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isUploading}
                className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Batalkan pilihan file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {uploadError && (
            <p className="text-xs text-error">{uploadError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSelectedFile(null);
                setJenis('');
                setUploadError('');
                setNotice(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              disabled={isUploading || (!selectedFile && !jenis)}
            >
              Reset
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              loading={isUploading}
              disabled={!selectedFile}
            >
              Upload
            </Button>
          </div>
        </div>
      </Card>

      {/* =============== Card: File Worker =============== */}
      <Card>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            <CardTitle>File Worker</CardTitle>
          </div>
          <button
            type="button"
            onClick={loadFiles}
            disabled={isLoadingFiles}
            className="text-xs text-text-secondary hover:text-primary-600 transition-colors"
          >
            Muat ulang
          </button>
        </div>

        {isLoadingFiles ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : listError ? (
          <p className="text-sm text-error py-4">{listError}</p>
        ) : files.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Belum ada file"
            description="File worker yang diunggah untuk user ini akan tampil di sini."
          />
        ) : (
          <ul className="space-y-3">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-white"
              >
                <FileThumbnail file={file} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {file.filename}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {file.jenis} - {formatTanggal(file.tanggal_upload)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openFile(file)}
                    className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    title={isImageFile(file) ? 'Preview' : 'Buka / Preview'}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <a
                    href={file.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    title="Download"
                    download
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setConfirmTarget(file)}
                    className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        isOpen={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleDelete}
        title="Hapus File Worker"
        message={
          confirmTarget
            ? `File "${confirmTarget.filename}" (${confirmTarget.jenis}) akan dihapus permanen. Lanjutkan?`
            : ''
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        loading={isDeleting}
      />
    </>
  );
}
