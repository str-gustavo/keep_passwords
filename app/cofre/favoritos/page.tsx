import { Suspense } from 'react';
import { VaultView } from '@/components/vault/VaultView';
import { t } from '@/lib/i18n/pt-br';

export default function FavoritesPage() {
  return <Suspense><VaultView filter={{ kind: 'favorites' }} title={t.favorites} /></Suspense>;
}
