'use client';
import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { generateTotp, parseOtpauth, totpRemainingSeconds, type TotpParams } from '@/lib/crypto/totp';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { CopyButton } from './CopyButton';

const RADIUS = 15;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function parse(uri: string): TotpParams | null {
  try {
    const p = parseOtpauth(uri);
    const sane = Number.isInteger(p.period) && p.period > 0 && Number.isInteger(p.digits) && p.digits >= 6 && p.digits <= 10 && /[A-Z2-7]/.test(p.secret);
    return sane ? p : null;
  } catch {
    return null;
  }
}

/** "123456" → "123 456". */
const groupCode = (code: string) => { const half = Math.ceil(code.length / 2); return `${code.slice(0, half)} ${code.slice(half)}`; };

export function TotpView({ uri }: { uri: string }) {
  const params = useMemo(() => parse(uri), [uri]);
  const [code, setCode] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(() => (params ? totpRemainingSeconds(params.period) : 0));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!params) return;
    let cancelled = false;
    let counter = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = Date.now();
      setRemaining(totpRemainingSeconds(params.period, now));
      const current = Math.floor(now / 1000 / params.period);
      if (current !== counter) {
        counter = current;
        generateTotp(params, now).then(
          (next) => { if (!cancelled && counter === current) setCode(next); },
          () => { if (!cancelled) setFailed(true); },
        );
      }
      // Wake just after the next whole second: periods start on whole seconds, so the new code lands at the boundary.
      timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [params]);

  if (!params || failed) return <p className="text-sm text-danger">{t.totpInvalid}</p>;
  if (!code) return <Spinner className="h-4 w-4 text-primary" />;

  const ending = remaining <= 5;
  return (
    <div className="flex items-center gap-3">
      <span data-testid="detail-totp-code" className="font-mono text-xl font-semibold tracking-wider text-fg-strong">{groupCode(code)}</span>
      <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center" role="timer" aria-label={`${remaining} ${t.totpSecondsLeft}`}>
        <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r={RADIUS} fill="none" strokeWidth="3" className="stroke-border" />
          <circle
            cx="18" cy="18" r={RADIUS} fill="none" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(CIRCUMFERENCE * remaining) / params.period} ${CIRCUMFERENCE}`}
            className="stroke-primary transition-[stroke-dasharray] duration-1000 ease-linear"
          />
        </svg>
        <span className={cn('relative text-[11px] font-semibold tabular-nums', ending ? 'text-danger' : 'text-fg-muted')} aria-hidden="true">{remaining}</span>
      </span>
      <CopyButton value={code} label={t.totpCode} testId="detail-copy-totp" />
    </div>
  );
}
