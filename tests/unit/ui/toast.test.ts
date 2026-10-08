import { describe, expect, it } from 'vitest';
import { toast, useToastStore } from '@/components/ui/Toast';

describe('toast store', () => {
  it('adds and removes toasts', () => {
    toast.success('ok');
    toast.error('ruim');
    const list = useToastStore.getState().toasts;
    expect(list.map((t) => [t.kind, t.message])).toEqual([['success', 'ok'], ['error', 'ruim']]);
    useToastStore.getState().dismiss(list[0]!.id);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
