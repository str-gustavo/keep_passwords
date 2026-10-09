'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Repeat, ShieldAlert, ShieldCheck } from 'lucide-react';
import { auditRecords, type AuditInput, type AuditItem, type AuditReport } from '@/lib/audit/audit';
import { passwordStrength } from '@/lib/generator/strength';
import { t } from '@/lib/i18n/pt-br';
import { passwordFields } from '@/lib/record-types/record-data';
import { cn } from '@/lib/ui/cn';
import { useVault } from '@/lib/vault/store';
import { AuditList, type AuditRow } from './AuditList';
import { ToolLayout } from './ToolLayout';

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const DAY_MS = 86_400_000;
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** Ring colour by score: below 50 danger, below 80 primary (orange), otherwise success. */
const scoreTone = (score: number) => (score < 50 ? 'text-danger' : score < 80 ? 'text-primary' : 'text-success');
const scoreMessage = (score: number) => (score < 50 ? t.auditScorePoor : score < 80 ? t.auditScoreFair : t.auditScoreGood);

function buildRows(inputs: AuditInput[], report: AuditReport): Record<'weak' | 'reused' | 'old', AuditRow[]> {
  const byId = new Map(inputs.map((i) => [i.id, i.data]));
  const holders = new Map<string, Set<string>>();
  for (const i of inputs) for (const f of passwordFields(i.data)) holders.set(f.value, (holders.get(f.value) ?? new Set<string>()).add(i.id));
  const strengths = new Map<string, { score: number; label: string }>();
  const strengthOf = (value: string) => {
    let s = strengths.get(value);
    if (!s) { s = passwordStrength(value); strengths.set(value, s); }
    return s;
  };
  const now = Date.now();
  const toEntries = (items: AuditItem[], reasonOf: (item: AuditItem, value: string) => string) =>
    items.flatMap((item) => {
      const data = byId.get(item.recordId);
      if (!data) return [];
      const value = data.fields[item.fieldKey] ?? '';
      const row: AuditRow = { key: `${item.recordId}:${item.fieldKey}`, recordId: item.recordId, title: item.title, type: data.type, reason: reasonOf(item, value), strength: strengthOf(value) };
      return [{ row, value }];
    }).sort((a, b) => collator.compare(a.row.title, b.row.title));
  const toRows = (...args: Parameters<typeof toEntries>) => toEntries(...args).map((e) => e.row);
  // Reused rows sharing a password stay next to each other (groups ordered by their first title; sort is stable).
  const reused = toEntries(report.reused, (_, value) => t.auditReasonReused(holders.get(value)?.size ?? 0));
  const groupRank = new Map<string, number>();
  for (const e of reused) if (!groupRank.has(e.value)) groupRank.set(e.value, groupRank.size);
  return {
    weak: toRows(report.weak, () => t.auditReasonWeak),
    reused: reused.sort((a, b) => (groupRank.get(a.value) ?? 0) - (groupRank.get(b.value) ?? 0)).map((e) => e.row),
    old: toRows(report.old, (item) => {
      const changed = byId.get(item.recordId)?.passwordChangedAt[item.fieldKey];
      return t.auditReasonOld(changed ? Math.floor((now - new Date(changed).getTime()) / DAY_MS) : 0);
    }),
  };
}

export function AuditView() {
  const router = useRouter();
  const records = useVault((s) => s.records);
  const inputs = useMemo<AuditInput[]>(() => records.flatMap((r) => (r.data !== null && r.deletedAt === null ? [{ id: r.id, title: r.data.title, data: r.data }] : [])), [records]);
  const report = useMemo(() => auditRecords(inputs), [inputs]);
  const rows = useMemo(() => buildRows(inputs, report), [inputs, report]);
  const open = (recordId: string) => router.push(`/cofre?r=${encodeURIComponent(recordId)}`);
  const tone = scoreTone(report.score);
  const stats = [
    { label: t.auditWeak, value: rows.weak.length },
    { label: t.auditReused, value: rows.reused.length },
    { label: t.auditOld, value: rows.old.length },
  ];

  return (
    <ToolLayout icon={ShieldCheck} title={t.audit} description={t.auditSubtitle}>
      <section aria-labelledby="audit-score-title" className="flex flex-col items-center gap-6 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:p-6">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={RING_RADIUS} fill="none" strokeWidth="10" className="stroke-border" />
            <circle
              cx="60"
              cy="60"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - report.score / 100)}
              className={cn('transition-[stroke-dashoffset] duration-500', tone)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span data-testid="audit-score" className="text-4xl font-semibold tabular-nums text-fg-strong">{report.score}</span>
            <span className="text-xs text-fg-muted">{t.auditOutOf}</span>
          </div>
        </div>
        <div className="w-full min-w-0 flex-1 text-center sm:text-left">
          <h2 id="audit-score-title" className="text-base font-semibold text-fg-strong">{t.auditScore}</h2>
          <p className="mt-1 text-sm font-medium text-fg">{report.totalPasswords === 0 ? t.auditNoPasswords : scoreMessage(report.score)}</p>
          <p className="mt-1 text-xs text-fg-muted">{t.auditAnalyzed(report.totalPasswords)}</p>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs leading-tight text-fg-muted">{s.label}</dt>
                <dd className={cn('text-xl font-semibold tabular-nums', s.value > 0 ? 'text-fg-strong' : 'text-success')}>{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <AuditList id="audit-weak" testId="audit-weak" title={t.auditWeak} hint={t.auditWeakHint} icon={ShieldAlert} severity="danger" rows={rows.weak} onOpen={open} />
      <AuditList id="audit-reused" testId="audit-reused" title={t.auditReused} hint={t.auditReusedHint} icon={Repeat} severity="danger" rows={rows.reused} onOpen={open} />
      <AuditList id="audit-old" testId="audit-old" title={t.auditOld} hint={t.auditOldHint} icon={Clock} severity="primary" rows={rows.old} onOpen={open} />
    </ToolLayout>
  );
}
