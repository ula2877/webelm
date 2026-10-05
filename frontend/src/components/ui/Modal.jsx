import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/helpers';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-card rounded-xl shadow-xl w-full animate-scale-in',
          sizes[size]
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            {showClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
