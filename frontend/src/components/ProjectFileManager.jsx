import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import Card, { CardTitle } from './ui/Card';
import Button from './ui/Button';
import ConfirmDialog from './ui/ConfirmDialog';
import EmptyState from './ui/EmptyState';
import Modal from './ui/Modal';
import * as projectService from '../services/projects';
import {
  ACCEPTED_EXTENSIONS,
  ACCEPT_ATTR,
  IMAGE_EXTENSIONS,
  INLINE_PREVIEW_EXTENSIONS,
  MAX_FILE_SIZE,
  fileExtension,
  fileVisual,
  formatFileDateTime,
  formatSize,
  triggerDownload,
} from '../utils/fileTypes';

/**
 * Card "File Manager" pada halaman View Project.
 *
 * File diambil dari tabel existing `tb_files` berdasarkan
 * `id_parent = tb_project.id_project`. Projek diidentifikasi dari URL memakai
 * `uuid_project`, sedangkan `id_project` internal hanya dipakai backend untuk
 * relasi `tb_files.id_parent`. Tidak ada perubahan skema database.
 */
export default function ProjectFileManager({ uuid }) {
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [listError, setListError] = useState('');

  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [notice, setNotice] = useState(null);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [preview, setPreview] = useState(null);

  const loadFiles = useCallback(async () => {
    if (!uuid) return;

    setIsLoadingFiles(true);
    setListError('');
    try {
      const response = await projectService.fetchProjectFiles(uuid);
      setFiles(
        response.status === 'ok' && Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      setListError(err.message || 'Gagal memuat daftar file.');
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [uuid]);

  useEffect(() => {
    setSelectedFile(null);
    setUploadError('');
    setNotice(null);
    loadFiles();
  }, [loadFiles]);

  // Bersihkan object URL preview saat ditutup / komponen dilepas.
  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview]
  );

  const validateFile = (file) => {
    if (!file) return 'Silakan pilih file.';

    const ext = fileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Format file tidak didukung. Format yang diperbolehkan: ${ACCEPTED_EXTENSIONS.join(', ')}.`;
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'Ukuran file maksimal 20 MB.';
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

  const resetSelection = () => {
    setSelectedFile(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    setUploadError('');
    setNotice(null);

    const error = validateFile(selectedFile);
    if (error) {
      setUploadError(error);
      return;
    }

    setIsUploading(true);
    try {
      const response = await projectService.uploadProjectFile(uuid, selectedFile);
      setNotice({
        type: 'success',
        message: response.message || 'File berhasil diunggah.',
      });
      resetSelection();
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

  // Ambil file lewat endpoint backend terautentikasi (bukan URL storage
  // publik langsung) lalu jadikan object URL di browser.
  const fetchObjectUrl = async (file) => {
    const response = await projectService.downloadProjectFile(uuid, file.id);
    return URL.createObjectURL(response.data);
  };

  const handleView = async (file) => {
    setNotice(null);
    setBusyId(file.id);
    try {
      const ext = fileExtension(file.name);
      const objectUrl = await fetchObjectUrl(file);

      if (IMAGE_EXTENSIONS.includes(ext)) {
        setPreview({ file, url: objectUrl });
      } else if (INLINE_PREVIEW_EXTENSIONS.includes(ext)) {
        // PDF / TXT - buka di tab baru, cabut URL setelah beberapa saat.
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } else {
        // Format yang tidak bisa dipreview -> unduh.
        triggerDownload(objectUrl, file.name);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      }
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'Gagal membuka file.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (file) => {
    setNotice(null);
    setBusyId(file.id);
    try {
      const objectUrl = await fetchObjectUrl(file);
      triggerDownload(objectUrl, file.name);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'Gagal mengunduh file.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const closePreview = () => {
    setPreview(null);
  };

  const handleDelete = async () => {
    if (!confirmTarget) return;

    setIsDeleting(true);
    try {
      const response = await projectService.deleteProjectFile(uuid, confirmTarget.id);
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

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <FolderOpen className="w-4 h-4 text-primary-600" />
            </span>
            <CardTitle>File Manager</CardTitle>
          </div>
          <button
            type="button"
            onClick={loadFiles}
            disabled={isLoadingFiles}
            className="text-xs text-text-secondary hover:text-primary-600 transition-colors disabled:opacity-50"
          >
            Muat ulang
          </button>
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

        {/* ===== Bagian A: Upload File ===== */}
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Area upload file projek"
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
              PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPG/PNG/WEBP/GIF, ZIP/RAR/7Z,
              TXT, CSV - maksimal 20 MB
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
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
                onClick={resetSelection}
                disabled={isUploading}
                className="p-1.5 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Batalkan pilihan file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {uploadError && <p className="text-xs text-error">{uploadError}</p>}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={resetSelection}
              disabled={isUploading || !selectedFile}
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

        {/* ===== Bagian B: Daftar File ===== */}
        <div className="mt-6 pt-5 border-t border-border">
          <p className="text-sm font-semibold text-text-primary mb-3">
            Daftar File
          </p>

          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : listError ? (
            <p className="text-sm text-error py-4">{listError}</p>
          ) : files.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Belum ada file untuk projek ini."
              description="File yang diunggah untuk projek ini akan tampil di sini."
            />
          ) : (
            <ul className="space-y-3">
              {files.map((file) => {
                const ext = file.extension || fileExtension(file.name);
                const { Icon, className } = fileVisual(ext);
                const isBusy = busyId === file.id;

                return (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-white"
                  >
                    <div
                      className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${className}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-medium text-text-primary truncate"
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p className="text-xs text-text-muted truncate">
                        {ext ? ext.toUpperCase() : 'FILE'}
                        {file.size_human ? ` - ${file.size_human}` : ''}
                        {file.datetime ? ` - ${formatFileDateTime(file.datetime)}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleView(file)}
                        disabled={isBusy}
                        className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50"
                        title="View"
                      >
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        disabled={isBusy}
                        className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
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
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* Preview gambar */}
      <Modal
        isOpen={Boolean(preview)}
        onClose={closePreview}
        title={preview?.file?.name || 'Preview'}
        size="xl"
      >
        <div className="flex items-center justify-center bg-gray-50 rounded-lg p-2 min-h-[200px]">
          {preview?.url && (
            <img
              src={preview.url}
              alt={preview?.file?.name || 'Preview'}
              className="max-h-[70vh] max-w-full object-contain rounded"
            />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleDelete}
        title="Hapus File"
        message={
          confirmTarget
            ? `File "${confirmTarget.name}" akan dihapus permanen. Lanjutkan?`
            : ''
        }
        confirmLabel="Hapus"
        cancelLabel="Batal"
        loading={isDeleting}
      />
    </>
  );
}
