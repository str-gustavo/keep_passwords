import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { buttonClass } from '@/components/ui/buttonClass';
import { StatusScreen } from '@/components/ui/StatusScreen';
import { t } from '@/lib/i18n/pt-br';

export default function NotFound() {
  return (
    <StatusScreen
      fullScreen icon={<SearchX />} title={t.notFoundTitle} description={t.notFoundText}
      action={(
        // Same look as <Button variant="primary">, as a link.
        <Link href="/cofre" data-testid="not-found-home" className={buttonClass('primary', 'md')}>
          {t.goToVault}
        </Link>
      )}
    />
  );
}
