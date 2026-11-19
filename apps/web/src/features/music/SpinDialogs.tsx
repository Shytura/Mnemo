import {
  daysSincePlayed,
  facet,
  logSpin,
  type MusicRecord,
  pickRecord,
  playable,
  recordSides,
  spinStats,
  todayIsoDate,
} from '@mnemo/core';
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  Field,
  Input,
  Label,
  Segmented,
  Select,
  Switch,
} from '@mnemo/ui';
import { Link } from '@tanstack/react-router';
import { DiscIcon, ShuffleIcon } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRecords, useSpins } from '../../app/data';
import type { DialogProps } from '../../app/dialogs';
import { useStore } from '../../app/store';
import { Turntable } from '../../components/Turntable';
import { WithRecord } from './RecordDialogs';

const twoDigits = (n: number) => String(n).padStart(2, '0');

/** Puts a record on now: logs a spin and offers to take it back, like lifting the arm again. */
export function usePlayRecord() {
  const { t } = useTranslation();
  const store = useStore();
  return async (record: MusicRecord) => {
    const spin = await logSpin(store, record.id);
    toast.success(t('record.spin.playing', { title: record.title }), {
      action: { label: t('record.spin.undo'), onClick: () => void store.spins.delete(spin.id) },
    });
  };
}

export function SpinDialog({ spec, onClose }: DialogProps<'spin'>) {
  return (
    <WithRecord recordId={spec.recordId} onClose={onClose}>
      {(record) => <SpinForm record={record} onClose={onClose} />}
    </WithRecord>
  );
}

function SpinForm({ record, onClose }: { record: MusicRecord; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const now = new Date();
  const [date, setDate] = useState(todayIsoDate(now));
  const [time, setTime] = useState(`${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}`);
  const sides = recordSides(record.tracks).flatMap((s) => (s.side ? [s.side] : []));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const playedAt = new Date(`${date}T${time || '20:00'}`);
    if (Number.isNaN(playedAt.getTime())) return;
    try {
      await logSpin(store, record.id, {
        playedAt: playedAt.toISOString(),
        // Every side ticked is the same as the whole record.
        sides: picked.size === sides.length ? [] : sides.filter((s) => picked.has(s)),
        note,
      });
      toast.success(t('record.spin.logged'));
      onClose();
    } catch (error) {
      toast.error(t('common.saveFailed'), { description: (error as Error).message });
    }
  };

  return (
    <DialogContent
      size="sm"
      eyebrow={t('record.spin.eyebrow')}
      title={record.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="spin-form" disabled={!date}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="spin-form" onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('record.spin.date')}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={date}
                max={todayIsoDate()}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('record.spin.time')}>
            {(id) => (
              <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            )}
          </Field>
        </div>
        {sides.length > 1 && (
          <div className="space-y-2">
            <Label>{t('record.spin.sides')}</Label>
            <div className="flex flex-wrap gap-2">
              {sides.map((side) => (
                <Chip
                  key={side}
                  active={picked.has(side)}
                  onClick={() =>
                    setPicked((set) => {
                      const next = new Set(set);
                      if (next.has(side)) next.delete(side);
                      else next.add(side);
                      return next;
                    })
                  }
                >
                  {t('record.side', { side })}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-ink-3">{t('record.spin.sidesHint')}</p>
          </div>
        )}
        <Field label={t('record.spin.note')}>
          {(id) => (
            <Input
              id={id}
              value={note}
              placeholder={t('record.spin.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
      </form>
    </DialogContent>
  );
}

type Length = 'any' | '30' | '45';

/** "What shall I play?": a record from the shelf, favouring the ones that waited longest. */
export function WhatToPlayDialog({ spec, onClose }: DialogProps<'whatToPlay'>) {
  const { t } = useTranslation();
  const play = usePlayRecord();
  const records = useRecords();
  const spins = useSpins();
  const [genre, setGenre] = useState(spec.genre ?? '');
  const [length, setLength] = useState<Length>('any');
  const [dusty, setDusty] = useState(false);
  const [pickedId, setPickedId] = useState<string>();

  const shelf = useMemo(() => (records ?? []).filter(playable), [records]);
  const genres = useMemo(() => facet(shelf.flatMap((r) => r.genres)), [shelf]);

  /** Picks again; the record just shown is left out when there is another choice. */
  const reroll = useCallback(
    (skip?: string) => {
      const pool = skip && shelf.length > 1 ? shelf.filter((r) => r.id !== skip) : shelf;
      const options = {
        genre: genre || undefined,
        maxMinutes: length === 'any' ? undefined : Number(length),
        dusty,
      };
      setPickedId(pickRecord(pool, spins ?? [], options)?.id);
    },
    [shelf, spins, genre, length, dusty],
  );
  useEffect(() => reroll(), [reroll]);
  const suggestion = shelf.find((r) => r.id === pickedId);

  const last = suggestion ? spinStats(spins ?? []).get(suggestion.id)?.last : undefined;
  const days = suggestion ? daysSincePlayed(suggestion, last) : 0;
  const year = suggestion?.releaseYear ?? suggestion?.pressingYear;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        eyebrow={t('record.pick.eyebrow')}
        title={t('record.pick.title')}
        footer={
          suggestion ? (
            <>
              <Button variant="ghost" onClick={() => reroll(suggestion.id)}>
                <ShuffleIcon /> {t('record.pick.another')}
              </Button>
              <Button
                onClick={async () => {
                  await play(suggestion);
                  onClose();
                }}
              >
                <DiscIcon /> {t('record.spin.play')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {genres.length > 0 && (
            <Select
              aria-label={t('record.fields.genres')}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="h-8 w-auto rounded-full text-xs"
            >
              <option value="">{t('records.anyGenre')}</option>
              {genres.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.value}
                </option>
              ))}
            </Select>
          )}
          <Segmented
            aria-label={t('record.fields.duration')}
            value={length}
            onChange={setLength}
            options={[
              { value: 'any', label: t('record.pick.anyLength') },
              { value: '30', label: t('record.pick.upTo', { minutes: 30 }) },
              { value: '45', label: t('record.pick.upTo', { minutes: 45 }) },
            ]}
          />
          <label
            htmlFor="pick-dusty"
            className="ml-auto flex cursor-pointer items-center gap-2 text-xs"
          >
            <Switch id="pick-dusty" checked={dusty} onCheckedChange={setDusty} />
            {t('record.pick.dusty')}
          </label>
        </div>

        {suggestion ? (
          <div className="mt-8 grid items-center gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Turntable record={suggestion} />
            <div className="min-w-0 animate-rise">
              <p className="eyebrow text-accent">
                {last ? t('record.pick.lastPlayed', { count: days }) : t('record.pick.neverPlayed')}
              </p>
              <Link
                to="/record/$recordId"
                params={{ recordId: suggestion.id }}
                onClick={onClose}
                className="display mt-3 block text-[clamp(1.75rem,3.5vw,2.5rem)] font-[400] hover:text-accent"
              >
                {suggestion.title}
              </Link>
              <p className="caption mt-2 text-xl text-ink-2">
                {suggestion.artists.join(', ')}
                {year && <span className="text-ink-3"> · {year}</span>}
              </p>
            </div>
          </div>
        ) : (
          <p className="caption mt-8 text-lg text-ink-3">
            {shelf.length === 0 ? t('record.pick.empty') : t('record.pick.none')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
