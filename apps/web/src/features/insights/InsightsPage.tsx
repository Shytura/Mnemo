import {
  epochOf,
  epochs,
  formatDuration,
  type LibraryInsight,
  type MusicInsight,
  parseYear,
  todayIsoDate,
} from '@mnemo/core';
import { EmptyState, PageHeader, SectionTitle, Stat } from '@mnemo/ui';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useArtworks, useInsights } from '../../app/data';
import { Flag } from '../../components/bits';
import { RecordCard } from '../../components/RecordCard';
import { useFormat } from '../../lib/format';

export function InsightsPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const insights = useInsights();
  const artworks = useArtworks();

  const epochCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of artworks ?? []) {
      if (a.status !== 'seen') continue;
      const e = epochOf(parseYear(a.year));
      if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
    }
    return epochs.map((e) => ({
      label: t(`epochs.${e.id}`),
      value: counts.get(e.id) ?? 0,
      key: e.id,
    }));
  }, [artworks, t]);

  if (!insights) return null;
  const { totals } = insights;

  if (
    totals.visits === 0 &&
    totals.artworks === 0 &&
    insights.library.books === 0 &&
    insights.music.records === 0
  ) {
    return (
      <>
        <PageHeader eyebrow={t('insights.eyebrow')} title={t('insights.title')} />
        <EmptyState title={t('insights.emptyTitle')} description={t('insights.emptyText')} />
      </>
    );
  }

  const since = insights.firstVisit
    ? format.date(insights.firstVisit.date, 'monthYear')
    : undefined;

  return (
    <>
      <PageHeader
        eyebrow={t('insights.eyebrow')}
        title={t('insights.title')}
        lede={since ? t('insights.ledeSince', { since }) : t('insights.lede')}
      />

      {/* Travel and art figures only once there is something to count. */}
      {(totals.visits > 0 || totals.artworks > 0 || totals.wishlist > 0) && (
        <section className="grid grid-cols-2 gap-x-6 gap-y-12 border-b border-line py-14 md:grid-cols-3 lg:grid-cols-6">
          <Stat
            value={totals.countries}
            label={t('stats.countries', { count: totals.countries })}
          />
          <Stat value={totals.places} label={t('stats.cities', { count: totals.places })} />
          <Stat value={totals.venues} label={t('stats.venues', { count: totals.venues })} />
          <Stat value={totals.visits} label={t('stats.visits', { count: totals.visits })} />
          <Stat value={totals.artworks} label={t('stats.artworks', { count: totals.artworks })} />
          <Stat value={totals.wishlist} label={t('stats.wishlist', { count: totals.wishlist })} />
        </section>
      )}

      {insights.spectrum.length > 0 && (
        <section className="mt-20">
          <SectionTitle>{t('insights.spectrum')}</SectionTitle>
          <p className="caption -mt-2 mb-6 text-lg text-ink-3">{t('insights.spectrumText')}</p>
          <div
            className="flex h-24 overflow-hidden rounded-frame shadow-frame"
            role="img"
            aria-label={t('insights.spectrum')}
          >
            {insights.spectrum.map((c, i) => (
              <Link
                // biome-ignore lint/suspicious/noArrayIndexKey: colours may repeat
                key={`${c}-${i}`}
                to="/collection"
                search={{ color: c }}
                className="min-w-0.5 flex-1 transition-[flex-grow] duration-500 ease-gallery hover:flex-[4]"
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </section>
      )}

      <div className="mt-20 grid grid-cols-1 gap-16 lg:grid-cols-2">
        {insights.visitsByYear.length > 0 && (
          <section>
            <SectionTitle>{t('insights.visitsPerYear')}</SectionTitle>
            <ColumnChart
              data={insights.visitsByYear.map((y) => ({
                key: String(y.year),
                label: String(y.year),
                value: y.count,
              }))}
              caption={t('insights.visitsPerYear')}
              valueLabel={(n) => t('stats.visits', { count: n })}
            />
          </section>
        )}
        {totals.artworks > 0 && (
          <section>
            <SectionTitle>{t('insights.epochs')}</SectionTitle>
            <ColumnChart
              data={epochCounts}
              caption={t('insights.epochs')}
              valueLabel={(n) => t('stats.artworks', { count: n })}
              compactLabels
            />
          </section>
        )}
      </div>

      {insights.library.books > 0 && <LibrarySection library={insights.library} />}
      {insights.music.records > 0 && <MusicSection music={insights.music} />}

      <div className="mt-20 grid grid-cols-1 gap-16 lg:grid-cols-3">
        <section>
          <SectionTitle>{t('insights.artists')}</SectionTitle>
          <RankList
            items={insights.topCreators.map((c) => ({
              key: c.creator.id,
              label: c.creator.name,
              value: c.count,
              creatorId: c.creator.id,
            }))}
          />
        </section>
        {insights.topVenues.length > 0 && (
          <section>
            <SectionTitle>{t('insights.venues')}</SectionTitle>
            <RankList
              items={insights.topVenues.map((v) => ({
                key: v.venue.id,
                label: v.venue.name,
                value: v.count,
                venueId: v.venue.id,
              }))}
            />
          </section>
        )}
        {insights.countries.length > 0 && (
          <section>
            <SectionTitle>{t('insights.countries')}</SectionTitle>
            <ul className="space-y-3">
              {insights.countries.map((c) => (
                <li key={c.code ?? c.name} className="flex items-center gap-3">
                  <Flag code={c.code} className="text-2xl" />
                  <span className="flex-1 text-sm">{format.country(c.code, c.name)}</span>
                  <span className="text-xs text-ink-3 tabular-nums">
                    {t('stats.cities', { count: c.places.length })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

interface Datum {
  key: string;
  label: string;
  value: number;
}

function LibrarySection({ library }: { library: LibraryInsight }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <section className="mt-20">
      <SectionTitle>{t('insights.library')}</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 gap-y-12 py-6 md:grid-cols-4">
        <Stat value={library.books} label={t('stats.books', { count: library.books })} />
        <Stat value={library.read} label={t('stats.booksRead', { count: library.read })} />
        <Stat
          value={format.number(library.pagesRead)}
          label={t('stats.pages', { count: library.pagesRead })}
        />
        <Stat value={library.lent.length} label={t('stats.lent', { count: library.lent.length })} />
      </div>
      {library.readByYear.length > 0 && (
        <div className="mt-12 max-w-3xl">
          <p className="eyebrow mb-4 text-ink-3">{t('insights.readPerYear')}</p>
          <ColumnChart
            data={library.readByYear.map((y) => ({
              key: String(y.year),
              label: String(y.year),
              value: y.count,
            }))}
            caption={t('insights.readPerYear')}
            valueLabel={(n) => t('stats.booksRead', { count: n })}
          />
        </div>
      )}
    </section>
  );
}

function MusicSection({ music }: { music: MusicInsight }) {
  const { t } = useTranslation();
  const format = useFormat();
  const hours = Math.round(music.listened / 3600);
  return (
    <section className="mt-20">
      <SectionTitle>{t('insights.music')}</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 gap-y-12 py-6 md:grid-cols-4">
        <Stat value={music.records} label={t('stats.records', { count: music.records })} />
        <Stat value={music.spins} label={t('stats.spins', { count: music.spins })} />
        <Stat
          value={hours > 0 ? format.number(hours) : formatDuration(music.listened)}
          label={hours > 0 ? t('stats.hoursListened', { count: hours }) : t('stats.listened')}
        />
        <Stat value={music.wishlist} label={t('stats.recordWishlist', { count: music.wishlist })} />
      </div>
      {music.spins > 0 && (
        <div className="mt-10">
          <p className="eyebrow mb-4 text-ink-3">{t('insights.listeningYear')}</p>
          <SpinCalendar days={music.spinsByDay} />
        </div>
      )}
      <div className="mt-16 grid grid-cols-1 gap-16 lg:grid-cols-3">
        {music.decades.length > 0 && (
          <section className="lg:col-span-1">
            <p className="eyebrow mb-4 text-ink-3">{t('insights.decades')}</p>
            <ColumnChart
              data={music.decades.map((d) => ({
                key: String(d.decade),
                label: t('records.decadeName', { decade: d.decade }),
                value: d.count,
              }))}
              caption={t('insights.decades')}
              valueLabel={(n) => t('stats.records', { count: n })}
              compactLabels
            />
          </section>
        )}
        {music.genres.length > 0 && (
          <section>
            <p className="eyebrow mb-4 text-ink-3">{t('insights.genres')}</p>
            <RankList
              items={music.genres.map((g) => ({
                key: g.name,
                label: g.name,
                value: g.count,
                recordsSearch: { genre: g.name },
              }))}
            />
          </section>
        )}
        {music.labels.length > 0 && (
          <section>
            <p className="eyebrow mb-4 text-ink-3">{t('insights.labels')}</p>
            <RankList
              items={music.labels.map((l) => ({
                key: l.name,
                label: l.name,
                value: l.count,
                recordsSearch: { label: l.name },
              }))}
            />
          </section>
        )}
        {music.mostPlayed.length > 0 && (
          <section>
            <p className="eyebrow mb-4 text-ink-3">{t('insights.mostPlayed')}</p>
            <RankList
              items={music.mostPlayed.map((m) => ({
                key: m.record.id,
                label: m.record.title,
                value: m.count,
                recordId: m.record.id,
              }))}
            />
          </section>
        )}
      </div>
      {music.dusty.length > 0 && (
        <div className="mt-16">
          <p className="eyebrow mb-1 text-ink-3">{t('insights.dusty')}</p>
          <p className="caption mb-6 text-lg text-ink-3">{t('insights.dustyText')}</p>
          <div className="grid grid-cols-3 gap-x-5 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
            {music.dusty.slice(0, 6).map(({ record }) => (
              <RecordCard key={record.id} record={record} />
            ))}
          </div>
        </div>
      )}
      {music.spent.length > 0 && (
        <p className="mt-12 text-sm text-ink-3">
          {t('insights.spent', {
            amount: music.spent.map((s) => format.money(s.amount, s.currency)).join(' · '),
          })}
        </p>
      )}
    </section>
  );
}

const WEEKS = 53;

/**
 * A year of listening, one square per day and one column per week, the way a diary is kept:
 * darker squares are days with more records played.
 */
function SpinCalendar({ days }: { days: Map<string, number> }) {
  const { t } = useTranslation();
  const format = useFormat();
  const today = new Date();
  // Columns start on Monday; the last column holds the current week.
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const iso = todayIsoDate(date);
    return { iso, count: days.get(iso) ?? 0, future: date > today };
  });
  // A month is named above the first week that starts in it.
  const months = cells.filter((c, i) => i % 7 === 0 && Number(c.iso.slice(8)) <= 7);
  return (
    <figure className="overflow-x-auto pb-2">
      <div className="min-w-[640px]">
        <div
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
          role="img"
          aria-label={t('insights.listeningYear')}
        >
          {cells.map((c) => (
            <span
              key={c.iso}
              title={
                c.future
                  ? undefined
                  : `${format.date(c.iso, 'medium')}: ${t('stats.spins', { count: c.count })}`
              }
              className="aspect-square rounded-[2px]"
              style={{
                background: c.future
                  ? 'transparent'
                  : c.count === 0
                    ? 'var(--mn-line)'
                    : `color-mix(in oklab, var(--mn-accent) ${Math.min(100, 35 + c.count * 22)}%, transparent)`,
              }}
            />
          ))}
        </div>
        <div
          className="mt-2 grid text-[0.625rem] text-ink-3"
          style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {months.map((c) => (
            <span
              key={c.iso}
              style={{ gridColumnStart: Math.floor(cells.indexOf(c) / 7) + 1 }}
              className="whitespace-nowrap"
            >
              {new Date(`${c.iso}T12:00:00`).toLocaleDateString(format.locale, { month: 'short' })}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** Single-series column chart: thin accent bars, rounded data end, value on hover. */
function ColumnChart({
  data,
  caption,
  valueLabel,
  compactLabels,
}: {
  data: Datum[];
  caption: string;
  valueLabel: (n: number) => string;
  compactLabels?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    // Clip sideways only: hover labels at the edges must not widen the page.
    <figure className="overflow-x-clip">
      <div
        className="relative flex h-56 items-end gap-0.5 border-b border-line-strong"
        aria-hidden="true"
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <span
            key={f}
            className="pointer-events-none absolute inset-x-0 border-t border-line"
            style={{ bottom: `${f * 100}%` }}
          />
        ))}
        {data.map((d) => (
          <div
            key={d.key}
            className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
          >
            <div
              className="w-full max-w-10 rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full mb-2 rounded-[2px] bg-ink px-2 py-1 text-[0.6875rem] whitespace-nowrap text-paper opacity-0 shadow-frame transition-opacity group-hover:opacity-100">
              {d.label}: {valueLabel(d.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-0.5" aria-hidden="true">
        {data.map((d) => (
          <span
            key={d.key}
            className={`min-w-0 flex-1 truncate text-center text-ink-3 tabular-nums ${compactLabels ? 'text-[0.625rem]' : 'text-xs'}`}
            title={d.label}
          >
            {d.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

type RankItem = {
  key: string;
  label: string;
  value: number;
  creatorId?: string;
  venueId?: string;
  recordId?: string;
  /** A link into the record collection filtered by this value. */
  recordsSearch?: { genre?: string; label?: string };
};

function RankList({ items }: { items: RankItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="space-y-4">
      {items.map((item, index) => {
        const label = <span className="truncate">{item.label}</span>;
        return (
          <li key={item.key}>
            <div className="flex items-baseline gap-3 text-sm">
              <span className="w-5 text-xs text-ink-3 tabular-nums">{index + 1}</span>
              {item.creatorId ? (
                <Link
                  to="/creator/$creatorId"
                  params={{ creatorId: item.creatorId }}
                  className="min-w-0 flex-1 truncate hover:text-accent"
                >
                  {label}
                </Link>
              ) : item.recordId ? (
                <Link
                  to="/record/$recordId"
                  params={{ recordId: item.recordId }}
                  className="min-w-0 flex-1 truncate hover:text-accent"
                >
                  {label}
                </Link>
              ) : item.recordsSearch ? (
                <Link
                  to="/records"
                  search={item.recordsSearch}
                  className="min-w-0 flex-1 truncate hover:text-accent"
                >
                  {label}
                </Link>
              ) : item.venueId ? (
                <Link
                  to="/venue/$venueId"
                  params={{ venueId: item.venueId }}
                  className="min-w-0 flex-1 truncate hover:text-accent"
                >
                  {label}
                </Link>
              ) : (
                <span className="min-w-0 flex-1">{label}</span>
              )}
              <span className="text-xs text-ink-3 tabular-nums">{item.value}</span>
            </div>
            <div className="mt-1.5 ml-8 h-0.5 bg-line">
              <div
                className="h-full rounded-r-full bg-accent"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
