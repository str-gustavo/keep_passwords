'use client';
import { ErrorFallback } from '@/components/ui/ErrorFallback';

/** Rendered inside the vault shell (sidebar and keys stay), so "Recarregar" retries without locking the vault. */
export default function VaultError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} />;
}
