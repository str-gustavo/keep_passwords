'use client';
import { Eye, ShieldAlert, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { t } from '@/lib/i18n/pt-br';
import { getRecordType } from '@/lib/record-types/catalog';
import { cn } from '@/lib/ui/cn';
import { formatTimestamp, urlHost } from '@/lib/ui/format';
import { useVault, type VaultRecord } from '@/lib/vault/store';
import { AttachmentsList } from './AttachmentsList';
import { DetailActions, FavoriteToggle, type DetailActionHandlers } from './DetailActions';
import { FieldView } from './FieldView';
import { TypeIcon } from './TypeIcon';

const hasValue = (v: string | undefined): v is string => v !== undefined && v.trim() !== '';
const card = 'divide-y divide-border rounded-xl border border-border bg-surface px-4';
const sectionTitle = 'mb-2 text-sm font-semibold text-fg-strong';

/** Render with `key={record.id}` so revealed secrets are re-masked when the selection changes. */
export function RecordDetail({ record, ...handlers }: { record: VaultRecord } & DetailActionHandlers) {
  const userId = useVault((s) => s.user?.id ?? '');
  const data = record.data;
  const typeDef = getRecordType(data?.type ?? record.type);
  const editable = data !== null && record.deletedAt === null && record.access.permission !== 'view';
  const fields = data ? typeDef.fields.filter((f) => hasValue(data.fields[f.key])) : [];
  const custom = data ? data.custom.map((c, i) => ({ ...c, i })).filter((c) => hasValue(c.value)) : [];
  const passwordDates = data ? typeDef.fields.filter((f) => f.kind === 'password' && data.passwordChangedAt[f.key]) : [];
  const updated = formatTimestamp(record.updatedAt);
  const subtitle = [data?.fields.url ? urlHost(data.fields.url) : null, updated && `${t.updatedAt} ${updated}`].filter(Boolean).join(' · ');

  return (
    <article className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6 lg:px-8">
      <header className="space-y-4">
        <div className="flex items-start gap-3">
          <TypeIcon type={typeDef.id} className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 data-testid="detail-title" className={cn('break-words text-xl font-semibold', data ? 'text-fg-strong' : 'italic text-fg-muted')}>
              {data ? data.title.trim() || t.untitled : t.recordUnavailable}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{typeDef.label}</Badge>
              {record.ownerId !== userId && (
                <Badge tone="neutral" className="gap-1" title={record.ownerEmail}><Users className="h-3 w-3" aria-hidden="true" />{t.sharedBy} {record.ownerEmail}</Badge>
              )}
              {record.access.permission === 'view' && <Badge tone="neutral" className="gap-1"><Eye className="h-3 w-3" aria-hidden="true" />{t.readOnly}</Badge>}
            </div>
          </div>
          <FavoriteToggle record={record} />
        </div>
        <DetailActions record={record} {...handlers} />
      </header>

      {!data && (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">
          <ShieldAlert className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />{t.recordUndecryptable}
        </p>
      )}

      {fields.length > 0 && data && (
        <dl className={card}>
          {fields.map((f) => <FieldView key={f.key} label={f.label} value={data.fields[f.key] ?? ''} kind={f.kind} testKey={f.key} />)}
        </dl>
      )}

      {custom.length > 0 && (
        <section>
          <h3 className={sectionTitle}>{t.customFields}</h3>
          <dl className={card}>
            {custom.map((c) => <FieldView key={c.i} label={c.label.trim() || t.customField} value={c.value} kind={c.kind} testKey={`custom-${c.i}`} />)}
          </dl>
        </section>
      )}

      {data && hasValue(data.notes) && (
        <dl className={card}><FieldView label={t.notes} value={data.notes} kind="multiline" testKey="notes" /></dl>
      )}

      {data && data.attachments.length > 0 && (
        <section>
          <h3 className={sectionTitle}>{t.attachments}</h3>
          <AttachmentsList recordId={record.id} attachments={data.attachments} editable={editable} />
        </section>
      )}

      <footer>
        <dl className="space-y-1 text-xs text-fg-muted">
          <div className="flex gap-1"><dt>{t.createdAt}</dt><dd>{formatTimestamp(record.createdAt)}</dd></div>
          {data && passwordDates.map((f) => (
            <div key={f.key} className="flex gap-1"><dt>{f.label} {t.changedAt}</dt><dd>{formatTimestamp(data.passwordChangedAt[f.key] ?? '')}</dd></div>
          ))}
        </dl>
      </footer>
    </article>
  );
}
