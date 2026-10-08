'use client';
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
export function Toaster() {
  const toasts = useToasts();
  return (
    <div data-testid="toast" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => <div key={t.id} role="status" className={`rounded-lg px-4 py-2 text-sm text-white shadow ${t.kind === 'error' ? 'bg-danger' : 'bg-success'}`}>{t.message}</div>)}
    </div>
  );
}
