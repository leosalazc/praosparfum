import { useEffect } from 'react';

let locks = 0;

/** Prevents the page behind a modal/drawer from scrolling and closes it with Escape. */
export function useLockBody(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open) return;
    locks++;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      locks = Math.max(0, locks - 1);
      if (!locks) document.body.style.overflow = '';
    };
  }, [open, onClose]);
}
