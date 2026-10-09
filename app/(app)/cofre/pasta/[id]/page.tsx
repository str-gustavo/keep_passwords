import { Suspense } from 'react';
import { VaultView } from '@/components/vault/VaultView';
import { t } from '@/lib/i18n/pt-br';

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key: switching between folders remounts the view, so search and form state reset per folder.
  return <Suspense><VaultView key={id} filter={{ kind: 'folder', folderId: id }} title={t.folder} /></Suspense>;
}
