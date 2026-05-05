'use client';

import { useEffect } from 'react';

/**
 * Calls `onEscape` whenever the user presses the Escape key while the
 * component is mounted. Used by modals so they close on Esc — a basic
 * a11y / power-user expectation.
 */
export default function useEscapeKey(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onEscape, enabled]);
}
