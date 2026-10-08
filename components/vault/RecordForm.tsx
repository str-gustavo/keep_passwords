'use client';
import { useReducer, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/Toast';
import { ApiClientError } from '@/lib/api/client';
import { t } from '@/lib/i18n/pt-br';
import { getRecordType, type RecordTypeId } from '@/lib/record-types/catalog';
import { createRecord, updateRecord } from '@/lib/vault/actions';
import { dataForSave, firstInvalidKey, formReducer, initialFormState, isFormDirty, validateForm, type FormAction } from '@/lib/vault/record-form-state';
import { useVault, type VaultRecord } from '@/lib/vault/store';
import { useSelectedRecordId } from '@/lib/vault/use-selected-record';
import { AttachmentsEditor } from './AttachmentsEditor';
import { ConfirmDialog } from './ConfirmDialog';
import { fieldInputId } from './FieldInput';
import { FormFields } from './FormFields';
import { TypeIcon } from './TypeIcon';
import { TypePicker } from './TypePicker';

const FORM_ID = 'record-form';
const errorKeyOf = (a: FormAction) => (a.type === 'field' ? a.key : a.type === 'title' || a.type === 'notes' ? a.type : null);
const without = (e: Record<string, string>, key: string) => { const next = { ...e }; delete next[key]; return next; };

/**
 * Create/edit dialog. New records start with the type picker (step 1); in edit mode the type is fixed.
 * Closing a form with unsaved edits asks "Descartar alterações?" first.
 */
export function RecordForm({ mode, record, folderId = null, onClose }: { mode: 'new' | 'edit'; record?: VaultRecord; folderId?: string | null; onClose: () => void }) {
  const editing = mode === 'edit' ? record : undefined;
  const [state, dispatchRaw] = useReducer(formReducer, undefined, () => initialFormState(editing?.data?.type ?? 'login', editing));
  const [initial] = useState(() => state.data);
  const [picked, setPicked] = useState<RecordTypeId | null>(editing ? state.data.type : null);
  const [choosingType, setChoosingType] = useState(!editing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  // Escape closes the native <dialog> before onClose runs; `hidden` mirrors that so the form can be shown again.
  const [hidden, setHidden] = useState(false);
  const [, setSelected] = useSelectedRecordId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const typeDef = getRecordType(state.data.type);

  const dispatch = (a: FormAction) => {
    dispatchRaw(a);
    const key = errorKeyOf(a);
    if (key) setErrors((e) => (key in e ? without(e, key) : e));
  };
  const syncNativeClose = () => { if (!bodyRef.current?.closest('dialog')?.open) setHidden(true); };

  function requestClose() {
    if (saving) { syncNativeClose(); return; }
    if (!isFormDirty(initial, state.data)) { onClose(); return; }
    syncNativeClose();
    setDiscardPrompt(true);
  }

  function pickType(type: RecordTypeId) {
    if (type !== state.data.type) dispatchRaw({ type: 'setType', recordType: type });
    setPicked(type);
    setErrors({});
    setChoosingType(false);
  }

  async function save() {
    if (saving || uploading) return;
    const found = validateForm(state);
    setErrors(found);
    const first = firstInvalidKey(state, found);
    if (first) { document.getElementById(fieldInputId(first))?.focus(); return; }
    setSaving(true);
    try {
      const data = dataForSave(state);
      let id: string;
      if (editing) {
        // Attachments were uploaded/deleted on the spot: keep the record's current list, not the form's snapshot.
        const current = useVault.getState().records.find((r) => r.id === editing.id)?.data?.attachments;
        id = (await updateRecord(editing.id, { ...data, attachments: current ?? data.attachments })).id;
      } else {
        id = (await createRecord(data, folderId)).id;
      }
      setSelected(id);
      toast.success(t.recordSaved);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t.genericSaveError);
      setSaving(false);
      setHidden(false);
    }
  }

  return (
    <>
      <Dialog
        open={!hidden} onClose={requestClose} title={editing ? t.editRecord : t.newRecord} wide
        footer={(
          <>
            {uploading && <p className="mr-auto self-center text-xs text-fg-muted">{t.waitForUploads}</p>}
            <Button type="button" variant="secondary" data-testid="record-cancel" disabled={saving} onClick={requestClose}>{t.cancel}</Button>
            {!choosingType && <Button type="submit" form={FORM_ID} data-testid="record-save" loading={saving} disabled={uploading}>{t.save}</Button>}
          </>
        )}
      >
        <div ref={bodyRef}>
          {choosingType ? (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">{t.chooseRecordType}</p>
              <TypePicker value={picked} onPick={pickType} />
            </div>
          ) : (
            <form id={FORM_ID} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-6 [&_[aria-invalid=true]]:border-danger">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <TypeIcon type={typeDef.id} className="h-5 w-5" />
                </span>
                <Badge>{typeDef.label}</Badge>
                {!editing && (
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setChoosingType(true)}>{t.changeType}</Button>
                )}
              </div>
              <FormFields state={state} dispatch={dispatch} errors={errors} />
              <section aria-labelledby="record-attachments-title" className="space-y-3">
                <h3 id="record-attachments-title" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t.attachments}</h3>
                <AttachmentsEditor recordId={editing?.id ?? null} attachments={editing?.data?.attachments ?? []} onBusyChange={setUploading} />
              </section>
            </form>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={discardPrompt} title={t.discardChangesTitle} description={t.discardChangesText} confirmLabel={t.discard}
        confirmTestId="record-discard-confirm"
        onClose={() => { setDiscardPrompt(false); setHidden(false); }}
        onConfirm={async () => onClose()}
      />
    </>
  );
}
