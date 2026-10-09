'use client';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
export interface ToastItem { id: number; kind: 'success' | 'error'; message: string }
interface ToastState { toasts: ToastItem[]; push: (kind: ToastItem['kind'], message: string) => void; dismiss: (id: number) => void }
let seq = 0;
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => { const id = ++seq; set((s) => ({ toasts: [...s.toasts, { id, kind, message }] })); setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000); },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
export const toast = { success: (m: string) => useToastStore.getState().push('success', m), error: (m: string) => useToastStore.getState().push('error', m) };
export const useToasts = () => useToastStore((s) => s.toasts);

const supportsPopover = (el: HTMLElement) => typeof el.showPopover === 'function' && typeof el.hidePopover === 'function';

/**
 * Shows the toaster in the top layer (`popover="manual"`), so toasts stay visible above modal <dialog>s.
 * The top layer stacks in show order: each new toast re-shows the popover to put it above any dialog opened since.
 * Without the Popover API the attribute is ignored and the container is a plain fixed <div>, as before.
 */
export function syncToasterPopover(el: HTMLElement, count: number): void {
  if (!supportsPopover(el)) return;
  const open = el.matches(':popover-open');
  if (open) el.hidePopover();
  if (count > 0) el.showPopover();
}

export function Toaster() {
  const toasts = useToasts();
  const ref = useRef<HTMLDivElement>(null);
  const count = toasts.length;
  const lastId = toasts.at(-1)?.id ?? 0;
  useEffect(() => { if (ref.current) syncToasterPopover(ref.current, count); }, [count, lastId]);
  return (
    <div
      ref={ref} popover="manual" data-testid="toast" aria-live="polite"
      // Resets the UA popover box (centred, bordered, padded, opaque) to the bottom-right stack; below lg it sits
      // above the vault's bottom navigation bar (3.5rem).
      className="pointer-events-none fixed top-auto right-4 bottom-[4.5rem] left-auto z-50 m-0 flex flex-col gap-2 overflow-visible border-0 bg-transparent p-0 lg:bottom-4"
    >
      {toasts.map((t) => (
        <div key={t.id} role="status" className={`flex items-center gap-2 rounded-lg border border-border border-l-[3px] bg-surface px-4 py-2.5 text-sm text-fg shadow-float ${t.kind === 'error' ? 'border-l-danger' : 'border-l-success'}`}>
          {/* The status dot: E2E checks for an error toast with `[data-testid="toast"] .bg-danger`. */}
          <span aria-hidden="true" className={`${t.kind === 'error' ? 'bg-danger' : 'bg-success'} inline-block h-2 w-2 shrink-0 rounded-full`} />
          {t.message}
        </div>
      ))}
    </div>
  );
}
