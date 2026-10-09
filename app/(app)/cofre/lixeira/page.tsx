import { Suspense } from 'react';
import { VaultView } from '@/components/vault/VaultView';
import { t } from '@/lib/i18n/pt-br';

export default function TrashPage() {
  return <Suspense><VaultView filter={{ kind: 'trash' }} title={t.trash} /></Suspense>;
}
