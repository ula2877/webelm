// Shared helper untuk menampilkan file di UI (dipakai ProjectFileManager dan
// ProjectProgress). Nilai di sini harus sejalan dengan aturan backend:
//   - ProjectController@uploadFile / @addProgress
//   - config/elmech.php: project_file.mimes / project_file.max_kb
//   - config/elmech.php: project_progress.max_files
import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Presentation,
} from 'lucide-react';
import { formatDateTime } from './helpers';

export const ACCEPTED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'zip',
  'rar',
  '7z',
  'txt',
  'csv',
];

export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

// backend: project_file.max_kb = 20480 KB (20 MB) per file.
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

// backend: project_progress.max_files = 10 lampiran per catatan progress.
export const MAX_PROGRESS_FILES = 10;

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
export const INLINE_PREVIEW_EXTENSIONS = ['pdf', 'txt', ...IMAGE_EXTENSIONS];

export function fileExtension(name = '') {
  const parts = String(name).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ikon dan warna berdasarkan jenis file. */
export function fileVisual(ext) {
  if (IMAGE_EXTENSIONS.includes(ext)) {
    return { Icon: FileImage, className: 'text-emerald-600 bg-emerald-50' };
  }
  if (ext === 'pdf') {
    return { Icon: FileText, className: 'text-red-600 bg-red-50' };
  }
  if (['doc', 'docx'].includes(ext)) {
    return { Icon: FileType, className: 'text-blue-600 bg-blue-50' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return { Icon: FileSpreadsheet, className: 'text-green-600 bg-green-50' };
  }
  if (['ppt', 'pptx'].includes(ext)) {
    return { Icon: Presentation, className: 'text-orange-600 bg-orange-50' };
  }
  if (['zip', 'rar', '7z'].includes(ext)) {
    return { Icon: FileArchive, className: 'text-amber-600 bg-amber-50' };
  }
  return { Icon: File, className: 'text-text-muted bg-gray-100' };
}

/** created_at dari MySQL ("YYYY-MM-DD HH:mm:ss") -> label tanggal/waktu. */
export function formatFileDateTime(value) {
  if (!value) return '-';
  const normalized = String(value).includes('T')
    ? String(value)
    : String(value).replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? String(value) : formatDateTime(date);
}

/** Unduh object/blob URL dengan nama file tertentu. */
export function triggerDownload(objectUrl, filename) {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename || 'file';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
