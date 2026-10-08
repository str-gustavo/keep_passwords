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
      // Resets the UA popover box (centred, bordered, padded, opaque) to the bottom-right stack.
      style={{ inset: 'auto 1rem 1rem auto' }}
      className="pointer-events-none fixed z-50 m-0 flex flex-col gap-2 overflow-visible border-0 bg-transparent p-0"
    >
      {toasts.map((t) => <div key={t.id} role="status" className={`rounded-lg px-4 py-2 text-sm text-fg-on-status shadow ${t.kind === 'error' ? 'bg-danger' : 'bg-success'}`}>{t.message}</div>)}
    </div>
  );
}
