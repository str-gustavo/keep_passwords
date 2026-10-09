import { VaultPreview } from '@/components/brand/VaultPreview';
import { Wordmark } from '@/components/brand/Wordmark';
import { t } from '@/lib/i18n/pt-br';

/**
 * Sign-in, sign-up and recovery, split (spec 2026-10-09 §3.1): the form loose on the white surface at the left
 * (max 400 px, wordmark above, language footer below — help and privacy join it once those pages exist) and, from
 * 1024 px up, the navy hero at the right with the vault preview and the product line. Below 1024 px only the form
 * column shows.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-surface text-fg">
      <section className="relative flex w-full flex-col px-6 py-10 lg:w-1/2 lg:px-16">
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">
          <Wordmark className="mb-8 text-2xl" />
          {children}
        </div>
        <footer className="mx-auto mt-10 flex w-full max-w-[400px] flex-wrap gap-x-5 gap-y-2 text-xs text-fg-muted">
          <span>{t.footerLanguage}</span>
        </footer>
      </section>
      <aside data-testid="auth-hero" aria-hidden="true" className="bg-hero hidden w-1/2 flex-col items-center justify-center gap-8 px-12 text-center text-rail-fg lg:flex">
        <VaultPreview className="w-[86%] max-w-[560px] rounded-xl shadow-[0_24px_60px_rgba(0,0,0,.35)]" />
        <div className="max-w-md">
          <p className="text-lg font-semibold text-white">{t.heroTitle}</p>
          <p className="mt-2 text-sm text-rail-fg/85">{t.heroBody}</p>
        </div>
      </aside>
    </main>
  );
}
