import {
  type CreditRole,
  collectionHas,
  creditRoles,
  formatDuration,
  type ItemRef,
  type MusicRecord,
  type RecordGrade,
  recordCreatorId,
  recordDuration,
  recordGrades,
  recordSides,
  removeRecord,
  returnRecord,
  todayIsoDate,
  toggleInCollection,
} from '@mnemo/core';
import {
  Button,
  Chip,
  cn,
  EmptyState,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Rating,
  SectionTitle,
  Skeleton,
  Tag,
  Tooltip,
} from '@mnemo/ui';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckIcon,
  EllipsisIcon,
  GiftIcon,
  HandshakeIcon,
  HeartIcon,
  ListPlusIcon,
  MapIcon,
  PencilIcon,
  ShoppingBagIcon,
  Trash2Icon,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  useCollections,
  useCreators,
  useLookups,
  useRecord,
  useRecords,
  useTrips,
} from '../../app/data';
import { useDialogs } from '../../app/dialogs';
import { useStore } from '../../app/store';
import { Confirm, Fact } from '../../components/bits';
import { RecordCard } from '../../components/RecordCard';
import { RecordSleeve, VinylDisc } from '../../components/RecordSleeve';
import { usePaletteAccent } from '../../lib/accent';
import { useFormat } from '../../lib/format';
import { gradeKey } from './grades';

const routeApi = getRouteApi('/record/$recordId');

export function RecordDetailPage() {
  const { t } = useTranslation();
  const { recordId } = routeApi.useParams();
  const query = useRecord(recordId);
  const record = query.data;
  const store = useStore();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const collections = useCollections();
  const allRecords = useRecords();
  const accentStyle = usePaletteAccent(record?.palette);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const moreByArtist = useMemo(() => {
    if (!record || !allRecords) return [];
    const artistIds = record.creatorIds.slice(0, record.artists.length);
    return allRecords
      .filter((r) => r.id !== record.id && r.creatorIds.some((id) => artistIds.includes(id)))
      .slice(0, 5);
  }, [record, allRecords]);

  if (query.isPending) {
    return (
      <div className="grid gap-12 md:grid-cols-[22rem_1fr]">
        <Skeleton className="aspect-square" />
        <div className="space-y-4">
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <EmptyState
        title={t('record.notFound')}
        action={
          <Button asChild variant="outline">
            <Link to="/records">{t('record.backToRecords')}</Link>
          </Button>
        }
      />
    );
  }

  const ref: ItemRef = { kind: 'record', id: record.id };
  const memberOf = (collections ?? []).filter((c) => collectionHas(c, ref));

  return (
    <article style={accentStyle}>
      <Link
        to="/records"
        className="eyebrow mb-8 inline-flex items-center gap-2 text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeftIcon className="size-3.5" /> {t('nav.records')}
      </Link>

      <div className="grid gap-10 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-14 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-sm md:max-w-none">
          <SleeveWithRecord record={record} />
          {record.palette.length > 0 && (
            <div className="mt-6 flex h-2 w-[78%] overflow-hidden rounded-full">
              {record.palette.map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </div>
          )}
        </div>

        <section className="min-w-0">
          <p className="eyebrow mb-4 text-accent">
            <StatusLine record={record} />
          </p>
          <h1 className="display text-[clamp(2.25rem,5vw,4rem)] font-[380] animate-rise">
            {record.title}
          </h1>
          {record.artists.length > 0 && (
            <p className="caption mt-4 text-2xl text-ink-2">
              <People record={record} names={record.artists} />
            </p>
          )}

          <ObjectLabel record={record} />

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Tooltip content={record.favorite ? t('record.unfavorite') : t('record.favorite')}>
              <Button
                variant={record.favorite ? 'accent' : 'outline'}
                size="icon"
                className="rounded-full"
                aria-pressed={record.favorite}
                aria-label={t('record.favorite')}
                onClick={() => void store.records.update(record.id, { favorite: !record.favorite })}
              >
                <HeartIcon className={cn(record.favorite && 'fill-current')} />
              </Button>
            </Tooltip>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => dialogs.open({ type: 'record', recordId: record.id })}
            >
              <PencilIcon /> {t('common.edit')}
            </Button>
            <Menu modal={false}>
              <MenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label={t('common.more')}
                >
                  <EllipsisIcon />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuLabel>{t('record.fields.collections')}</MenuLabel>
                {collections?.map((c) => (
                  <MenuItem
                    key={c.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      void toggleInCollection(store, c.id, ref);
                    }}
                  >
                    <CheckIcon className={cn(!collectionHas(c, ref) && 'opacity-0')} /> {c.name}
                  </MenuItem>
                ))}
                <MenuItem onSelect={() => dialogs.open({ type: 'collection', addItem: ref })}>
                  <ListPlusIcon /> {t('collection.new')}
                </MenuItem>
                <MenuSeparator />
                {record.ownership === 'owned' && !record.loan && (
                  <MenuItem
                    onSelect={() => dialogs.open({ type: 'recordLoan', recordId: record.id })}
                  >
                    <HandshakeIcon /> {t('record.lend')}
                  </MenuItem>
                )}
                <MenuItem className="text-danger" onSelect={() => setDeleteOpen(true)}>
                  <Trash2Icon /> {t('common.delete')}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>

          {record.loan && <LoanNote record={record} />}

          <div className="mt-10 flex items-center gap-4 border-t border-line pt-6">
            <span className="eyebrow text-ink-3">{t('record.fields.rating')}</span>
            <Rating
              label={t('record.fields.rating')}
              value={record.rating}
              onChange={(rating) => void store.records.update(record.id, { rating })}
            />
          </div>

          <Facts record={record} />

          {record.description && (
            <div className="mt-10">
              <p className="eyebrow mb-3 text-ink-3">{t('record.fields.description')}</p>
              <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-ink-2">
                {record.description}
              </p>
            </div>
          )}

          {record.notes && (
            <blockquote className="mt-10 border-l-2 border-gold pl-5 font-display text-lg leading-relaxed whitespace-pre-line text-ink-2 italic">
              {record.notes}
            </blockquote>
          )}

          {(record.tags.length > 0 || memberOf.length > 0) && (
            <div className="mt-8 flex flex-wrap gap-2">
              {memberOf.map((c) => (
                <Link key={c.id} to="/list/$collectionId" params={{ collectionId: c.id }}>
                  <Chip>{c.name}</Chip>
                </Link>
              ))}
              {record.tags.map((tag) => (
                <Link key={tag} to="/records" search={{ tag }}>
                  <Tag className="hover:border-ink-3">#{tag}</Tag>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <Tracklist record={record} />
      <Credits record={record} />
      <Provenance record={record} />

      {moreByArtist.length > 0 && (
        <section className="mt-24">
          <SectionTitle>
            {t('record.moreBy', { artist: record.artists[0] ?? record.title })}
          </SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {moreByArtist.map((r) => (
              <RecordCard key={r.id} record={r} />
            ))}
          </div>
        </section>
      )}

      <Confirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('record.deleteTitle')}
        description={t('record.deleteText', { title: record.title })}
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          await removeRecord(store, record.id);
          toast.success(t('record.deleted'));
          void navigate({ to: '/records' });
        }}
      />
    </article>
  );
}

/** The sleeve with the record pulled halfway out; it slides out once the page has opened. */
export function SleeveWithRecord({
  record,
  spinning,
}: {
  record: MusicRecord;
  spinning?: boolean;
}) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOut(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const hasDisc = record.ownership !== 'wishlist';
  return (
    <div className="relative w-[78%]">
      {hasDisc && (
        <div
          className="absolute inset-[3%] transition-transform delay-200 duration-[1400ms] ease-gallery"
          style={{ transform: out ? 'translateX(32%)' : undefined }}
        >
          <VinylDisc record={record} spinning={spinning} className="size-full" />
        </div>
      )}
      <RecordSleeve
        record={record}
        variant="full"
        eager
        className="relative shadow-float"
        style={{ viewTransitionName: `record-${record.id}` }}
      />
    </div>
  );
}

function StatusLine({ record }: { record: MusicRecord }) {
  const { t } = useTranslation();
  const format = useFormat();
  if (record.ownership === 'wishlist') return t('record.eyebrow.wishlist');
  if (record.ownership === 'sold') return t('record.eyebrow.sold');
  const since = record.acquisition?.date;
  return since
    ? t('record.eyebrow.ownedSince', { date: format.date(since, 'monthYear') })
    : t('record.eyebrow.owned');
}

/** Names on the record, each linked to its person page when there is one. */
function People({ record, names }: { record: MusicRecord; names: readonly string[] }) {
  const creators = useCreators();
  return names.map((name, i) => {
    const id = recordCreatorId(record, name);
    const creator = id ? creators?.find((c) => c.id === id) : undefined;
    return (
      <span key={name}>
        {i > 0 && ', '}
        {creator ? (
          <Link
            to="/creator/$creatorId"
            params={{ creatorId: creator.id }}
            className="underline decoration-line-strong decoration-1 underline-offset-[6px] transition-colors hover:text-ink hover:decoration-accent"
          >
            {name}
          </Link>
        ) : (
          name
        )}
      </span>
    );
  });
}

/**
 * The object label, set like the card next to a work in a museum: label and catalogue number,
 * where and when it was pressed, and what it is.
 */
function ObjectLabel({ record }: { record: MusicRecord }) {
  const { t } = useTranslation();
  const pressing = [
    record.country,
    record.pressingYear ?? record.releaseYear,
    record.firstPressing ? t('record.firstPressing') : undefined,
    record.signed ? t('record.signed') : undefined,
  ].filter(Boolean);
  const object = [
    record.discCount > 1
      ? `${record.discCount} × ${t(`record.formats.${record.format}`)}`
      : t(`record.formats.${record.format}`),
    record.size && `${record.size}″`,
    record.speed && t(`record.speeds.${record.speed}`),
    record.channels && t(`record.channels.${record.channels}`),
    record.variant,
  ].filter(Boolean);
  if (!record.label && !record.catalogNumber && pressing.length === 0) return null;
  return (
    <div className="mt-7 max-w-md border-y border-line py-3 text-sm leading-relaxed">
      {(record.label || record.catalogNumber) && (
        <p className="flex flex-wrap items-baseline gap-x-3">
          {record.label && (
            <Link
              to="/records"
              search={{ label: record.label }}
              className="eyebrow text-ink transition-colors hover:text-accent"
            >
              {record.label}
            </Link>
          )}
          {record.catalogNumber && (
            <span className="font-mono text-xs tracking-wide text-ink-2">
              {record.catalogNumber}
            </span>
          )}
        </p>
      )}
      {pressing.length > 0 && <p className="text-ink-2">{pressing.join(' · ')}</p>}
      <p className="text-ink-3">{object.join(' · ')}</p>
    </div>
  );
}

function Facts({ record }: { record: MusicRecord }) {
  const { t } = useTranslation();
  const duration = recordDuration(record);
  return (
    <dl className="mt-8 border-t border-line">
      <Fact label={t('record.fields.releaseYear')}>
        {record.pressingYear && record.releaseYear !== record.pressingYear
          ? record.releaseYear
          : undefined}
      </Fact>
      <Fact label={t('record.fields.genres')}>
        {record.genres.length > 0 && (
          <span className="flex flex-wrap gap-x-3">
            {record.genres.map((genre) => (
              <Link
                key={genre}
                to="/records"
                search={{ genre }}
                className="underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                {genre}
              </Link>
            ))}
          </span>
        )}
      </Fact>
      <Fact label={t('record.fields.duration')}>{duration && formatDuration(duration)}</Fact>
      <Fact label={t('record.fields.condition')}>
        {(record.conditionMedia || record.conditionSleeve) && (
          <span className="flex flex-col gap-2">
            {record.conditionMedia && (
              <Grade label={t('record.conditionMedia')} grade={record.conditionMedia} />
            )}
            {record.conditionSleeve && (
              <Grade label={t('record.conditionSleeve')} grade={record.conditionSleeve} />
            )}
          </span>
        )}
      </Fact>
      <Fact label={t('record.fields.barcode')}>
        {record.barcode && (
          <span className="font-mono text-xs tracking-wide">{record.barcode}</span>
        )}
      </Fact>
      <Fact label={t('record.fields.matrix')}>
        {record.matrix && <span className="font-mono text-xs tracking-wide">{record.matrix}</span>}
      </Fact>
      <Fact label={t('record.fields.source')}>
        {record.source?.url && (
          <a
            href={record.source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            {t(
              `record.sources.${record.source.provider === 'discogs' ? 'discogs' : 'musicbrainz'}`,
            )}
            <ArrowUpRightIcon className="size-3" />
          </a>
        )}
      </Fact>
    </dl>
  );
}

/** A Goldmine grade as eight ticks, best on the right. */
function Grade({ label, grade }: { label: string; grade: RecordGrade }) {
  const { t } = useTranslation();
  const level = recordGrades.length - recordGrades.indexOf(grade);
  return (
    <span className="flex items-center gap-3" title={t(`record.grades.${gradeKey(grade)}`)}>
      <span className="w-14 text-xs text-ink-3">{label}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {recordGrades.map((g, i) => (
          <span
            key={g}
            className={cn('h-2.5 w-1.5 rounded-[1px]', i < level ? 'bg-accent' : 'bg-line-strong')}
          />
        ))}
      </span>
      <span className="font-mono text-xs">{grade}</span>
      <span className="sr-only">{t(`record.grades.${gradeKey(grade)}`)}</span>
    </span>
  );
}

/** Sides set like the labels they are printed on: position, title, a dotted leader, length. */
function Tracklist({ record }: { record: MusicRecord }) {
  const { t } = useTranslation();
  const sides = recordSides(record.tracks);
  if (sides.length === 0) return null;
  return (
    <section className="mt-24">
      <SectionTitle>{t('record.tracklist')}</SectionTitle>
      <div className="grid gap-x-16 gap-y-12 md:grid-cols-2">
        {sides.map((side) => (
          <div key={`${side.side ?? ''}:${side.tracks[0]?.position}:${side.tracks[0]?.title}`}>
            {side.side && (
              <div className="mb-4 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-accent font-display text-lg text-accent-ink italic">
                  {side.side}
                </span>
                <span className="eyebrow text-ink-2">{t('record.side', { side: side.side })}</span>
                {side.duration && (
                  <span className="ml-auto text-xs text-ink-3 tabular-nums">
                    {formatDuration(side.duration)}
                  </span>
                )}
              </div>
            )}
            <ol className="space-y-2.5">
              {side.tracks.map((track, j) => (
                <li
                  // Tracks have no id; their order is the identity within a side.
                  // biome-ignore lint/suspicious/noArrayIndexKey: see above
                  key={j}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-2"
                >
                  <span className="font-mono text-xs text-accent">{track.position}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="caption text-lg leading-snug text-ink">{track.title}</span>
                    {track.duration && (
                      <>
                        <span className="min-w-6 flex-1 translate-y-[-0.2em] border-b border-dotted border-line-strong" />
                        <span className="text-xs text-ink-3 tabular-nums">
                          {formatDuration(track.duration)}
                        </span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Who made the record besides the artists, grouped by what they did. */
function Credits({ record }: { record: MusicRecord }) {
  const { t } = useTranslation();
  if (record.credits.length === 0) return null;
  const groups = creditRoles
    .map((role) => ({ role, credits: record.credits.filter((c) => c.role === role) }))
    .filter((g) => g.credits.length > 0);
  return (
    <section className="mt-20">
      <SectionTitle>{t('record.credits')}</SectionTitle>
      <dl className="grid gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(({ role, credits }) => (
          <div key={role}>
            <dt className="eyebrow mb-2 text-ink-3">{t(`record.roles.${role as CreditRole}`)}</dt>
            {credits.map((credit) => (
              <dd key={`${credit.name}-${credit.detail ?? ''}`} className="text-ink">
                <span className="caption text-lg">
                  <People record={record} names={[credit.name]} />
                </span>
                {credit.detail && <span className="ml-2 text-xs text-ink-3">{credit.detail}</span>}
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** How the record came here: bought where and when, a gift, brought home from a trip. */
function Provenance({ record }: { record: MusicRecord }) {
  const { t } = useTranslation();
  const format = useFormat();
  const lookups = useLookups();
  const trips = useTrips();
  const a = record.acquisition;
  if (!a) return null;
  const venue = a.venueId ? lookups.venues.get(a.venueId) : undefined;
  const place = lookups.placeOfVenue(a.venueId);
  const trip = a.tripId ? trips?.find((tr) => tr.id === a.tripId) : undefined;
  const lines: Array<{ icon: typeof GiftIcon; content: ReactNode }> = [];

  if (a.gift) {
    lines.push({
      icon: GiftIcon,
      content: a.from
        ? t('record.provenance.giftFrom', { name: a.from })
        : t('record.provenance.gift'),
    });
  }
  if (!a.gift || venue || a.date || a.price) {
    const where = venue ? (
      <Link
        to="/venue/$venueId"
        params={{ venueId: venue.id }}
        className="underline decoration-line-strong underline-offset-4 hover:decoration-accent"
      >
        {venue.name}
        {place && `, ${place.name}`}
      </Link>
    ) : !a.gift && a.from ? (
      a.from
    ) : undefined;
    const when = a.date
      ? t(a.gift ? 'record.provenance.receivedOn' : 'record.provenance.boughtOn', {
          date: format.date(a.date),
        })
      : t(a.gift ? 'record.provenance.received' : 'record.provenance.bought');
    lines.push({
      icon: ShoppingBagIcon,
      content: (
        <>
          {when}
          {where && (
            <>
              {' '}
              {t('record.provenance.at')} {where}
            </>
          )}
          {a.price !== undefined && (
            <span className="text-ink-3"> · {format.money(a.price, a.currency)}</span>
          )}
        </>
      ),
    });
  }
  if (trip) {
    lines.push({
      icon: MapIcon,
      content: (
        <>
          {t('record.provenance.trip')}{' '}
          <Link
            to="/trip/$tripId"
            params={{ tripId: trip.id }}
            className="underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            {trip.title}
          </Link>
        </>
      ),
    });
  }

  return (
    <section className="mt-20">
      <SectionTitle>{t('record.provenance.title')}</SectionTitle>
      <ul className="space-y-3">
        {lines.map(({ icon: Icon, content }, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sequence of lines
          <li key={i} className="flex items-baseline gap-3 font-display text-xl text-ink-2">
            <Icon className="size-4 shrink-0 translate-y-0.5 text-accent" strokeWidth={1.5} />
            <span>{content}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoanNote({ record }: { record: MusicRecord }) {
  const { t } = useTranslation();
  const store = useStore();
  const format = useFormat();
  if (!record.loan) return null;
  const overdue = record.loan.due !== undefined && record.loan.due < todayIsoDate();
  return (
    <div
      className={cn(
        'mt-6 flex flex-wrap items-center gap-3 rounded-frame border px-4 py-3 text-sm animate-rise',
        overdue ? 'border-danger/40 bg-danger/5' : 'border-accent/30 bg-accent-soft',
      )}
    >
      <HandshakeIcon className={cn('size-4 shrink-0', overdue ? 'text-danger' : 'text-accent')} />
      <span className="min-w-0 flex-1 text-ink-2">
        {t('record.lentSince', { name: record.loan.name, date: format.date(record.loan.since) })}
        {record.loan.due && (
          <span className="block text-xs text-ink-3">
            {overdue
              ? t('book.overdue', { date: format.date(record.loan.due) })
              : t('book.due', { date: format.date(record.loan.due) })}
          </span>
        )}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await returnRecord(store, record.id);
          toast.success(t('record.returned'));
        }}
      >
        {t('book.giveBack')}
      </Button>
    </div>
  );
}
