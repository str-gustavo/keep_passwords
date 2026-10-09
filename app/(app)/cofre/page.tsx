import { Suspense } from 'react';
import { VaultView } from '@/components/vault/VaultView';
import { t } from '@/lib/i18n/pt-br';

export default function AllRecordsPage() {
  return <Suspense><VaultView filter={{ kind: 'all' }} title={t.allRecords} /></Suspense>;
}
