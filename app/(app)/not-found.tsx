import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { StatusScreen } from '@/components/ui/StatusScreen';
import { t } from '@/lib/i18n/pt-br';

export default function NotFound() {
  return (
    <StatusScreen
      fullScreen icon={<SearchX />} title={t.notFoundTitle} description={t.notFoundText}
      action={(
        // Same look as <Button variant="primary">, as a link.
        <Link
          href="/cofre" data-testid="not-found-home"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-fg-on-primary outline-none transition hover:bg-primary-hover active:bg-primary-active active:text-white focus-visible:ring-[3px] focus-visible:ring-primary-soft"
        >
          {t.goToVault}
        </Link>
      )}
    />
  );
}
