import { lendRecord, type MusicRecord, todayIsoDate } from '@mnemo/core';
import { Button, Dialog, DialogContent, Field, Input } from '@mnemo/ui';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRecord } from '../../app/data';
import type { DialogProps } from '../../app/dialogs';
import { useStore } from '../../app/store';

/** Renders `children` once the record is loaded; closes silently if it no longer exists. */
export function WithRecord({
  recordId,
  onClose,
  children,
}: {
  recordId: string;
  onClose: () => void;
  children: (record: MusicRecord) => ReactNode;
}) {
  const query = useRecord(recordId);
  if (!query.data) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {children(query.data)}
    </Dialog>
  );
}

export function RecordLoanDialog({ spec, onClose }: DialogProps<'recordLoan'>) {
  return (
    <WithRecord recordId={spec.recordId} onClose={onClose}>
      {(record) => <LoanForm record={record} onClose={onClose} />}
    </WithRecord>
  );
}

function LoanForm({ record, onClose }: { record: MusicRecord; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const [name, setName] = useState('');
  const [since, setSince] = useState(todayIsoDate());
  const [due, setDue] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !since) return;
    try {
      await lendRecord(store, record.id, { name: name.trim(), since, due: due || undefined });
      toast.success(t('record.lentTo', { name: name.trim() }));
      onClose();
    } catch (error) {
      toast.error(t('common.saveFailed'), { description: (error as Error).message });
    }
  };

  return (
    <DialogContent
      size="sm"
      eyebrow={t('record.lend')}
      title={t('record.lendTitle', { title: record.title })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="record-loan-form" disabled={!name.trim() || !since}>
            {t('record.lend')}
          </Button>
        </>
      }
    >
      <form id="record-loan-form" onSubmit={submit} className="space-y-5">
        <Field label={t('book.lendName')}>
          {(id) => (
            <Input
              id={id}
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('book.lendSince')}>
            {(id) => (
              <Input id={id} type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            )}
          </Field>
          <Field label={t('book.lendDue')}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={due}
                min={since}
                onChange={(e) => setDue(e.target.value)}
              />
            )}
          </Field>
        </div>
      </form>
    </DialogContent>
  );
}
