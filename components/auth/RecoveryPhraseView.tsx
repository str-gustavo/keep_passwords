'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { t } from '@/lib/i18n/pt-br';
import { copyWithAutoClear } from '@/lib/vault/clipboard';

export function RecoveryPhraseView({ phrase, onContinue, continueLabel = 'Continuar para o cofre' }: { phrase: string; onContinue: () => void; continueLabel?: string }) {
  const [ack, setAck] = useState(false);
  const copy = () => copyWithAutoClear(phrase, 60_000).then(() => toast.success(t.copied), () => toast.error(t.copyPhraseFailed));
  return (
    <div className="space-y-4">
      <p className="text-sm">Esta é a sua frase de recuperação. Anote e guarde em lugar seguro: ela é a única forma de recuperar o cofre se você esquecer a senha mestra.</p>
      <ol data-testid="recovery-phrase" className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm sm:grid-cols-3">
        {phrase.split(' ').map((w, i) => <li key={i} className="flex gap-2"><span className="w-5 text-right text-fg-muted">{i + 1}.</span><span className="font-mono">{w}</span></li>)}
      </ol>
      <Button type="button" variant="secondary" onClick={copy}>Copiar frase</Button>
      <label htmlFor="recovery-ack" className="flex items-center gap-2 text-sm"><input id="recovery-ack" data-testid="recovery-ack" type="checkbox" className="h-4 w-4 accent-primary" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Anotei a frase em lugar seguro</label>
      <Button type="button" data-testid="recovery-continue" disabled={!ack} onClick={onContinue} className="w-full">{continueLabel}</Button>
    </div>
  );
}
