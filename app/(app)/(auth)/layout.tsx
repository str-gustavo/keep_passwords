import { NexusLock } from '@/components/brand/NexusLock';
import { NexusMark } from '@/components/brand/NexusMark';
import { t } from '@/lib/i18n/pt-br';

/**
 * Sign-in, sign-up and recovery: the Nexus navy backdrop (both themes) with the product lock and the
 * "NEXUS Passwords" wordmark, then the form card on the theme surface. The wordmark is drawn as text
 * plus the vector X (the 2750×850 nexus-logo.png weighs 788 KB and its navy letters vanish on navy).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-rail px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center text-rail-fg">
          <NexusLock size={56} className="drop-shadow-lg" />
          <p className="mt-4 text-[1.75rem] leading-none">
            <span className="sr-only">{t.appName}</span>
            <span aria-hidden="true" className="inline-flex items-baseline gap-2.5">
              <span className="font-extrabold tracking-[0.08em]">
                NE<NexusMark size={24} className="mx-[0.02em] inline-block h-[0.89em] w-[0.89em] align-[-0.08em]" />US
              </span>
              <span className="font-medium tracking-tight">Passwords</span>
            </span>
          </p>
          <p className="mt-2 text-sm text-rail-fg/80">{t.appTagline}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
