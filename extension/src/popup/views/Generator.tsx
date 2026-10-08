import { useState } from 'react';
import { generatePassword } from '@app/generator/password';
import { t } from '@app/i18n/pt-br';
import type { GenOptions } from '@/shared/messages';
import { copyWithAutoClear } from '../lib/clipboard';
import { Button, cx, focusRing, inputClass } from '../ui/controls';
import { NoticeBar, useNotice } from '../ui/notice';

// Same password options as the web app's generator (GenOptions). Generated locally with the app's generator
// (crypto.getRandomValues), so no round trip and no secret ever crosses a message. The generated value is shown —
// it is not stored anywhere until the user pastes it.
const LENGTH_MIN = 8;
const LENGTH_MAX = 64;
const DEFAULTS: GenOptions = { length: 20, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false };
type CharClass = 'upper' | 'lower' | 'digits' | 'symbols';
const CLASSES: { key: CharClass; label: string }[] = [
  { key: 'upper', label: t.genUpper },
  { key: 'lower', label: t.genLower },
  { key: 'digits', label: t.genDigits },
  { key: 'symbols', label: t.genSymbols },
];
const clamp = (n: number) => Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, Math.round(n)));
const checkbox = cx('h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed', focusRing);

export function Generator() {
  const [opts, setOpts] = useState<GenOptions>(DEFAULTS);
  const [lengthText, setLengthText] = useState(String(DEFAULTS.length));
  const [output, setOutput] = useState(() => generatePassword(DEFAULTS));
  const [notice, notify] = useNotice();

  const update = (patch: Partial<GenOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    setOutput(generatePassword(next));
  };
  const setLength = (n: number) => { if (n !== opts.length) update({ length: n }); };
  const onLengthText = (text: string) => {
    setLengthText(text);
    const n = Number(text);
    if (text.trim() !== '' && Number.isInteger(n) && n >= LENGTH_MIN && n <= LENGTH_MAX) setLength(n);
  };
  const onLengthBlur = () => {
    const n = Number(lengthText);
    const v = lengthText.trim() !== '' && Number.isFinite(n) ? clamp(n) : opts.length;
    setLength(v);
    setLengthText(String(v));
  };
  const enabled = CLASSES.filter((c) => opts[c.key]).length;

  async function copy() {
    try {
      await copyWithAutoClear(output);
      notify({ kind: 'success', text: t.copiedAutoClear });
    } catch {
      notify({ kind: 'error', text: t.copyFailed });
    }
  }

  return (
    <div>
      <div className="space-y-4 p-4">
        <section aria-labelledby="gen-output-title" className="rounded-lg border border-border bg-surface-2 p-3">
          <h2 id="gen-output-title" className="text-xs font-medium text-fg-muted">{t.genGenerated}</h2>
          <p data-testid="gen-output" className="mt-1 min-h-6 font-mono text-base break-all text-fg select-all">{output}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" size="sm" onClick={copy}>{t.copy}</Button>
            <Button size="sm" onClick={() => setOutput(generatePassword(opts))}>{t.genRegenerate}</Button>
          </div>
        </section>

        <div>
          <label htmlFor="gen-length" className="block text-sm font-medium text-fg">{t.genLength}</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={LENGTH_MIN}
              max={LENGTH_MAX}
              value={opts.length}
              aria-label={t.genLengthSlider}
              onChange={(e) => { const v = clamp(Number(e.target.value)); setLength(v); setLengthText(String(v)); }}
              className={cx('h-2 min-w-0 flex-1 cursor-pointer accent-primary', focusRing)}
            />
            <input
              id="gen-length"
              type="number"
              inputMode="numeric"
              min={LENGTH_MIN}
              max={LENGTH_MAX}
              value={lengthText}
              onChange={(e) => onLengthText(e.target.value)}
              onBlur={onLengthBlur}
              className={cx(inputClass, 'w-16 text-center tabular-nums')}
            />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="sr-only">{t.genOptions}</legend>
          {CLASSES.map((c) => {
            const last = opts[c.key] && enabled === 1;
            return (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <input type="checkbox" className={checkbox} checked={opts[c.key]} disabled={last} onChange={(e) => update({ [c.key]: e.target.checked })} />
                {c.label}
              </label>
            );
          })}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
            <input type="checkbox" className={checkbox} checked={opts.excludeAmbiguous} onChange={(e) => update({ excludeAmbiguous: e.target.checked })} />
            {t.genExcludeAmbiguous}
          </label>
          {enabled === 1 && <p className="text-xs text-fg-muted">{t.genKeepOneClass}</p>}
        </fieldset>
      </div>
      <NoticeBar notice={notice} />
    </div>
  );
}
