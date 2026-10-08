import { describe, expect, it, vi } from 'vitest';
import { syncToasterPopover, toast, useToastStore } from '@/components/ui/Toast';

describe('toast store', () => {
  it('adds and removes toasts', () => {
    toast.success('ok');
    toast.error('ruim');
    const list = useToastStore.getState().toasts;
    expect(list.map((t) => [t.kind, t.message])).toEqual([['success', 'ok'], ['error', 'ruim']]);
    useToastStore.getState().dismiss(list[0]!.id);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
  it('auto-dismisses after 4 s', () => {
    vi.useFakeTimers();
    try {
      useToastStore.setState({ toasts: [] });
      toast.success('some');
      vi.advanceTimersByTime(3999);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });
});

describe('syncToasterPopover', () => {
  const fakePopover = () => {
    let open = false;
    const calls: string[] = [];
    const el = {
      matches: (sel: string) => sel === ':popover-open' && open,
      showPopover: () => { calls.push('show'); open = true; },
      hidePopover: () => { calls.push('hide'); open = false; },
    };
    return { el: el as unknown as HTMLElement, calls, isOpen: () => open };
  };

  it('shows the top-layer popover for the first toast and hides it when the list empties', () => {
    const p = fakePopover();
    syncToasterPopover(p.el, 1);
    expect(p.calls).toEqual(['show']);
    syncToasterPopover(p.el, 0);
    expect(p.calls).toEqual(['show', 'hide']);
    expect(p.isOpen()).toBe(false);
    syncToasterPopover(p.el, 0);
    expect(p.calls).toEqual(['show', 'hide']);
  });
  it('re-shows on a new toast so it stacks above dialogs opened meanwhile', () => {
    const p = fakePopover();
    syncToasterPopover(p.el, 1);
    syncToasterPopover(p.el, 2);
    expect(p.calls).toEqual(['show', 'hide', 'show']);
    expect(p.isOpen()).toBe(true);
  });
  it('does nothing without the Popover API (plain fixed container)', () => {
    const el = { matches: () => { throw new Error('unsupported selector'); } } as unknown as HTMLElement;
    expect(() => syncToasterPopover(el, 1)).not.toThrow();
  });
});
