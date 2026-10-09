import { Suspense } from 'react';
import { VaultView } from '@/components/vault/VaultView';
import { t } from '@/lib/i18n/pt-br';

export default function SharedWithMePage() {
  return <Suspense><VaultView filter={{ kind: 'shared' }} title={t.sharedWithMe} /></Suspense>;
}
