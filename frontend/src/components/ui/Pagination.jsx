import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/helpers';

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
      <p className="text-sm text-text-secondary">
        Showing <span className="font-medium text-text-primary">{startItem}</span> to{' '}
        <span className="font-medium text-text-primary">{endItem}</span> of{' '}
        <span className="font-medium text-text-primary">{totalItems}</span> results
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={cn(
            'p-2 rounded-lg border border-border transition-colors',
            currentPage === 1
              ? 'text-text-muted cursor-not-allowed'
              : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getPageNumbers().map((page, index) =>
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-text-muted">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={cn(
                'w-9 h-9 rounded-lg text-sm font-medium transition-colors',
                currentPage === page
                  ? 'bg-primary-600 text-white'
                  : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
              )}
            >
              {page}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={cn(
            'p-2 rounded-lg border border-border transition-colors',
            currentPage === totalPages
              ? 'text-text-muted cursor-not-allowed'
              : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
