'use client';
import { useEffect } from 'react';

/**
 * Guards for the record dialog while it is mounted:
 * - a file dropped anywhere outside the attachments drop zone (which handles its own drop) is swallowed, so the
 *   browser never opens it and navigates away from the unlocked vault;
 * - while `blockEscape` is true, Escape is cancelled so the native <dialog> cannot be dismissed (attachment work in flight).
 */
export function useFormDialogGuards(blockEscape: boolean) {
  useEffect(() => {
    const swallow = (e: DragEvent) => {
      if (e.defaultPrevented) return; // the drop zone took it
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => { window.removeEventListener('dragover', swallow); window.removeEventListener('drop', swallow); };
  }, []);

  useEffect(() => {
    if (!blockEscape) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') e.preventDefault(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [blockEscape]);
}
