import { useState } from 'react';
import { cn } from '../../utils/helpers';

const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
  '2xl': 'w-32 h-32 text-4xl',
};

const colors = [
  'bg-primary-100 text-primary-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

export default function Avatar({ name, src, size = 'md', className, onError }) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const colorIndex = name
    ? name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    : 0;

  // A photo URL that cannot be loaded falls back to the initials avatar
  // instead of rendering a broken image. Tracking WHICH src failed means the
  // fallback resets by itself whenever a different src arrives, with no effect.
  const [failedSrc, setFailedSrc] = useState(null);
  const showPhoto = Boolean(src) && failedSrc !== src;

  if (showPhoto) {
    return (
      <img
        src={src}
        alt={name}
        onError={(event) => {
          setFailedSrc(src);
          onError?.(event);
        }}
        className={cn('rounded-full object-cover', sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-medium',
        sizes[size],
        colors[colorIndex],
        className
      )}
    >
      {initials}
    </div>
  );
}
