import {
  hashString,
  latestSpin,
  nowPlaying,
  pickRecord,
  playable,
  recordSides,
  todayIsoDate,
} from '@mnemo/core';
import { Button, SectionTitle } from '@mnemo/ui';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, DiscIcon, ShuffleIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecords, useSpins } from '../../app/data';
import { useDialogs } from '../../app/dialogs';
import { Turntable } from '../../components/Turntable';
import { useFormat } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { usePlayRecord } from './SpinDialogs';

/** A pick that stays the same all day, so the Salon does not reshuffle on every visit. */
const dailyRandom = (seed: string) => () => (hashString(seed) % 10_000) / 10_000;

/**
 * The turntable in the Salon: the record playing now with the arm down, or the one played last,
 * or a suggestion for today when nothing has been played yet.
 */
export function OnTheTurntable() {
  const { t } = useTranslation();
  const format = useFormat();
  const dialogs = useDialogs();
  const play = usePlayRecord();
  const records = useRecords();
  const spins = useSpins();
  const now = useNow(30_000);
  const today = todayIsoDate(now);

  const shelf = useMemo(() => (records ?? []).filter(playable), [records]);
  const current = nowPlaying(records ?? [], spins ?? [], now);
  const last = latestSpin(spins ?? []);
  const lastRecord = last && records?.find((r) => r.id === last.recordId);
  const suggestion = useMemo(
    () => pickRecord(shelf, [], { random: dailyRandom(`turntable-${today}`) }),
    [shelf, today],
  );
  const record = current?.record ?? lastRecord ?? suggestion;
  if (!records || shelf.length === 0 || !record) return null;

  const side = current?.spin.sides[0] ?? recordSides(record.tracks)[0]?.side;
  const eyebrow = current
    ? side
      ? t('salon.turntable.playingSide', { side })
      : t('salon.turntable.playing')
    : last && lastRecord
      ? t('salon.turntable.lastPlayed', { date: format.date(last.playedAt, 'medium') })
      : t('salon.turntable.suggestion');
  const year = record.releaseYear ?? record.pressingYear;

  return (
    <section aria-label={t('salon.turntable.title')}>
      <SectionTitle
        action={
          <Link
            to="/records"
            className="eyebrow inline-flex items-center gap-1.5 text-ink-3 hover:text-accent"
          >
            {t('salon.toRecords')} <ArrowRightIcon className="size-3.5" />
          </Link>
        }
      >
        {t('salon.turntable.title')}
      </SectionTitle>
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:gap-16">
        <Turntable record={record} playing={Boolean(current)} className="max-w-xl" />
        <div className="min-w-0">
          <p className="eyebrow text-accent">{eyebrow}</p>
          <Link
            to="/record/$recordId"
            params={{ recordId: record.id }}
            className="display mt-4 block text-[clamp(2rem,4vw,3.25rem)] font-[380] transition-colors hover:text-accent"
          >
            {record.title}
          </Link>
          <p className="caption mt-3 text-2xl text-ink-2">
            {record.artists.join(', ')}
            {year && <span className="text-ink-3"> · {year}</span>}
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {!current && playable(record) && (
              <Button className="rounded-full" onClick={() => void play(record)}>
                <DiscIcon /> {lastRecord ? t('salon.turntable.again') : t('record.spin.play')}
              </Button>
            )}
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => dialogs.open({ type: 'whatToPlay' })}
            >
              <ShuffleIcon /> {t('record.pick.title')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
