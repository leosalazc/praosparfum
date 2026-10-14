import { useState } from 'react';

const FALLBACK = '/perfume.webp';


/** Lazy-loaded product image with a graceful fallback. */
export function ProductImage({
  src,
  alt,
  className = '',
  eager = false,
  fallback,
}: {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
  /** Tried before the generic bottle if `src` fails (e.g. static copy of the photo). */
  fallback?: string;
}) {
  const [failures, setFailures] = useState(0);
  const chain = [src && src !== '/perfume.png' ? src : undefined, fallback, FALLBACK].filter(Boolean) as string[];
  const url = chain[Math.min(failures, chain.length - 1)];
  return (
    <img
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailures((n) => n + 1)}
      className={className}
    />
  );
}
