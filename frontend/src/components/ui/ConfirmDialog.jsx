import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed? This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-error" />
        </div>
        <p className="text-sm text-text-secondary mb-6 whitespace-pre-line">{message}</p>
        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
