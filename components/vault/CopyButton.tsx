'use client';
import { Copy } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { copyWithAutoClear } from '@/lib/vault/clipboard';
import { IconButton } from './IconButton';

/** Copies the raw value (never the masked or formatted display) and clears the clipboard after 30 s. */
export function CopyButton({ value, label, testId }: { value: string; label: string; testId: string }) {
  async function copy() {
    try { await copyWithAutoClear(value); toast.success(t.copied); }
    catch { toast.error(t.copyFailed); }
  }
  return (
    <IconButton data-testid={testId} label={`${t.copy} ${label}`} title={t.copy} onClick={() => { void copy(); }}>
      <Copy className="h-4 w-4" aria-hidden="true" />
    </IconButton>
  );
}
