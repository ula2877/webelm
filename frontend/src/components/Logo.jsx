import { cn } from '../utils/helpers';
// Imported (not a "/src/..." path) so Vite bundles the asset into the build output.
import logoElmech from '../assets/logo/logo_elmech.png';

export default function Logo({ size = 'md', className }) {
  const sizes = {
    sm: { wrapper: 'w-8 h-8', text: 'text-sm' },
    md: { wrapper: 'w-10 h-10', text: 'text-base' },
    lg: { wrapper: 'w-12 h-12', text: 'text-lg' },
    xl: { wrapper: 'w-16 h-16', text: 'text-xl' },
  };

  const currentSize = sizes[size] || sizes.md;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn('relative flex-shrink-0', currentSize.wrapper)}>
        <img
          src={logoElmech}
          alt="ELMECH Logo"
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
