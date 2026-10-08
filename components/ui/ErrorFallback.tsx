'use client';
import { useEffect } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { t } from '@/lib/i18n/pt-br';
import { Button } from './Button';
import { StatusScreen } from './StatusScreen';

/** Body of the route error boundaries: "Algo deu errado." with a "Recarregar" button that re-renders the segment. */
export function ErrorFallback({ error, reset, fullScreen }: { error: Error & { digest?: string }; reset: () => void; fullScreen?: boolean }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <StatusScreen
      alert fullScreen={fullScreen} icon={<TriangleAlert />} title={t.errorTitle} description={t.errorText}
      action={<Button data-testid="error-reload" onClick={reset}><RotateCw className="h-4 w-4" aria-hidden="true" />{t.reload}</Button>}
    />
  );
}
