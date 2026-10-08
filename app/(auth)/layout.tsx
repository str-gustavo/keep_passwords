import { KeyRound } from 'lucide-react';
import { t } from '@/lib/i18n/pt-br';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
            <KeyRound className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-fg">{t.appName}</p>
          <p className="mt-1 text-sm text-fg-muted">{t.appTagline}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
