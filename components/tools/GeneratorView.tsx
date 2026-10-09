'use client';
import { useEffect, useState } from 'react';
import { Copy, RefreshCw, WandSparkles } from 'lucide-react';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { toast } from '@/components/ui/Toast';
import { generatePassphrase, generatePassword, type PassphraseOptions, type PasswordOptions } from '@/lib/generator/password';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { copyWithAutoClear } from '@/lib/vault/clipboard';
import { ToolLayout } from './ToolLayout';

type Mode = 'password' | 'passphrase';
type CharClass = 'upper' | 'lower' | 'digits' | 'symbols';

const LENGTH_MIN = 8;
const LENGTH_MAX = 64;
const WORDS_MIN = 3;
const WORDS_MAX = 8;
const MODES: { id: Mode; label: string }[] = [
  { id: 'password', label: t.genModePassword },
  { id: 'passphrase', label: t.genModePassphrase },
];
const CHAR_CLASSES: { key: CharClass; label: string; testId: string }[] = [
  { key: 'upper', label: t.genUpper, testId: 'gen-upper' },
  { key: 'lower', label: t.genLower, testId: 'gen-lower' },
  { key: 'digits', label: t.genDigits, testId: 'gen-digits' },
  { key: 'symbols', label: t.genSymbols, testId: 'gen-symbols' },
];
const SEPARATORS = [
  { value: '-', label: t.genSeparatorHyphen },
  { value: ' ', label: t.genSeparatorSpace },
  { value: '.', label: t.genSeparatorDot },
  { value: '_', label: t.genSeparatorUnderscore },
  { value: '', label: t.genSeparatorNone },
];

const clampLength = (n: number) => Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, Math.round(n)));
const card = 'rounded-xl border border-border bg-surface p-4 sm:p-6';
const optionRow = 'flex cursor-pointer items-center justify-between gap-4 py-3 text-sm text-fg';
const slider = 'h-2 min-w-0 flex-1 cursor-pointer accent-primary';

export function GeneratorView() {
  const [mode, setMode] = useState<Mode>('password');
  const [password, setPassword] = useState<PasswordOptions>({ length: 20, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false });
  const [lengthText, setLengthText] = useState('20');
  const [passphrase, setPassphrase] = useState<PassphraseOptions>({ words: 5, separator: '-', capitalize: true });
  const [nonce, setNonce] = useState(0);
  const [output, setOutput] = useState('');

  // Any option change, and "Gerar novamente" (via nonce), yields a fresh value. Generating after mount keeps the
  // random output out of server rendering.
  useEffect(() => {
    setOutput(mode === 'password' ? generatePassword(password) : generatePassphrase(passphrase));
  }, [mode, password, passphrase, nonce]);

  // Returning the same object when nothing changed lets React bail out, so a no-op never regenerates.
  const applyLength = (n: number) => setPassword((o) => (o.length === n ? o : { ...o, length: n }));
  const onSlider = (n: number) => { const v = clampLength(n); applyLength(v); setLengthText(String(v)); };
  const onLengthText = (text: string) => {
    setLengthText(text);
    const n = Number(text);
    if (text.trim() !== '' && Number.isInteger(n) && n >= LENGTH_MIN && n <= LENGTH_MAX) applyLength(n);
  };
  const onLengthBlur = () => {
    const n = Number(lengthText);
    const v = lengthText.trim() !== '' && Number.isFinite(n) ? clampLength(n) : password.length;
    applyLength(v);
    setLengthText(String(v));
  };

  const enabledClasses = CHAR_CLASSES.filter((c) => password[c.key]).length;
  const toggleClass = (key: CharClass, on: boolean) => {
    if (!on && enabledClasses === 1) return; // at least one character class must stay on
    setPassword((o) => ({ ...o, [key]: on }));
  };

  async function onCopy() {
    if (!output) return;
    try {
      await copyWithAutoClear(output);
      toast.success(t.copiedAutoClear);
    } catch {
      toast.error(t.copyFailed);
    }
  }

  return (
    <ToolLayout icon={WandSparkles} title={t.generator} description={t.generatorSubtitle}>
      <div role="group" aria-label={t.genMode} className="inline-flex rounded-lg border border-border bg-surface p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            data-testid={`gen-mode-${m.id}`}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn('rounded-md px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40', mode === m.id ? 'bg-primary-soft text-primary-text' : 'text-fg-muted hover:bg-surface-2 hover:text-fg')}
          >
            {m.label}
          </button>
        ))}
      </div>

      <section aria-labelledby="gen-output-title" className={card}>
        <h2 id="gen-output-title" className="text-xs font-medium text-fg-muted">{t.genGenerated}</h2>
        <p data-testid="gen-output" className="mt-2 min-h-7 select-all break-all font-mono text-lg text-fg-strong">{output}</p>
        <PasswordStrengthMeter password={output} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button data-testid="gen-copy" onClick={onCopy} disabled={!output}>
            <Copy className="h-4 w-4" aria-hidden="true" />{t.copy}
          </Button>
          <Button variant="secondary" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />{t.genRegenerate}
          </Button>
        </div>
      </section>

      <section aria-labelledby="gen-options-title" className={card}>
        <h2 id="gen-options-title" className="text-sm font-semibold text-fg-strong">{t.genOptions}</h2>
        {mode === 'password' ? (
          <>
            <div className="mt-4">
              <Label htmlFor="gen-length">{t.genLength}</Label>
              <div className="flex items-center gap-3">
                <input type="range" min={LENGTH_MIN} max={LENGTH_MAX} value={password.length} aria-label={t.genLengthSlider} onChange={(e) => onSlider(Number(e.target.value))} className={slider} />
                <div className="w-20 shrink-0">
                  <Input
                    id="gen-length"
                    data-testid="gen-length"
                    type="number"
                    inputMode="numeric"
                    min={LENGTH_MIN}
                    max={LENGTH_MAX}
                    value={lengthText}
                    onChange={(e) => onLengthText(e.target.value)}
                    onBlur={onLengthBlur}
                    className="text-center tabular-nums"
                  />
                </div>
              </div>
            </div>
            <div className="mt-2 divide-y divide-border">
              {CHAR_CLASSES.map((c) => (
                <label key={c.key} className={optionRow}>
                  <span>{c.label}</span>
                  <Switch checked={password[c.key]} onChange={(v) => toggleClass(c.key, v)} label={c.label} testId={c.testId} />
                </label>
              ))}
              <label className={optionRow}>
                <span>{t.genExcludeAmbiguous}</span>
                <Switch checked={password.excludeAmbiguous} onChange={(v) => setPassword((o) => ({ ...o, excludeAmbiguous: v }))} label={t.genExcludeAmbiguous} />
              </label>
            </div>
            {enabledClasses === 1 && <p className="mt-2 text-xs text-fg-muted">{t.genKeepOneClass}</p>}
          </>
        ) : (
          <>
            <div className="mt-4">
              <Label htmlFor="gen-words">{t.genWords}</Label>
              <div className="flex items-center gap-3">
                <input id="gen-words" type="range" min={WORDS_MIN} max={WORDS_MAX} value={passphrase.words} onChange={(e) => setPassphrase((o) => ({ ...o, words: Number(e.target.value) }))} className={slider} />
                <output htmlFor="gen-words" className="w-20 shrink-0 text-center text-sm font-medium tabular-nums text-fg">{passphrase.words}</output>
              </div>
            </div>
            <div className="mt-4">
              <Label htmlFor="gen-separator">{t.genSeparator}</Label>
              <Select id="gen-separator" value={passphrase.separator} onChange={(e) => setPassphrase((o) => ({ ...o, separator: e.target.value }))}>
                {SEPARATORS.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
            <div className="mt-2">
              <label className={optionRow}>
                <span>{t.genCapitalize}</span>
                <Switch checked={passphrase.capitalize} onChange={(v) => setPassphrase((o) => ({ ...o, capitalize: v }))} label={t.genCapitalize} />
              </label>
            </div>
          </>
        )}
      </section>
    </ToolLayout>
  );
}
