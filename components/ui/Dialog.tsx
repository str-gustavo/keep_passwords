'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  // Only a click outside the dialog's box is a backdrop click. A click can also target the <dialog> itself from
  // inside the box: its scrollbar, or a press and release on different children when the content scrolls between.
  const onBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const d = ref.current;
    if (!d || e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
  };
  return (
    // React bubbles `close` through the component tree: ignore the close of a dialog nested inside this one.
    // The backdrop is the rail navy in both themes (fg-strong, the same navy in light, turns white in dark).
    <dialog ref={ref} onClose={(e) => { if (e.target === e.currentTarget) onClose(); }} onClick={onBackdropClick} className={`m-auto w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl border border-border bg-surface p-0 text-fg shadow-float backdrop:bg-rail/40`}>
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-fg-strong">{title}</h2>
        <button type="button" aria-label="Fechar" onClick={onClose} className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-2"><X className="h-4 w-4" /></button>
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
    </dialog>
  );
}
