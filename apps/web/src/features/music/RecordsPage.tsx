import {
  decadeOf,
  facet,
  filterRecords,
  itemIdsOf,
  type MusicRecord,
  recordSorts,
} from '@mnemo/core';
import {
  Button,
  Chip,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  Select,
} from '@mnemo/ui';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  GalleryHorizontalIcon,
  HandshakeIcon,
  HeartIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  ScanBarcodeIcon,
  SearchIcon,
  ShuffleIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCollections, useRecords, useSpins } from '../../app/data';
import { useDialogs } from '../../app/dialogs';
import { RecordCard } from '../../components/RecordCard';
import { RecordSleeve } from '../../components/RecordSleeve';
import { useFormat } from '../../lib/format';
import { RecordCrate } from './RecordCrate';
import { RecordShelf } from './RecordShelf';
import type { RecordsSearch, RecordView } from './search';

const routeApi = getRouteApi('/records');

export function RecordsPage() {
  const { t } = useTranslation();
  const dialogs = useDialogs();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const records = useRecords();
  const spins = useSpins();
  const collections = useCollections();

  const setSearch = (patch: Partial<RecordsSearch>) =>
    void navigate({
      search: (prev) =>
        Object.fromEntries(
          Object.entries({ ...prev, ...patch }).filter(([, v]) => v !== undefined && v !== ''),
        ),
      replace: true,
    });

  const results = useMemo(
    () =>
      filterRecords(
        records ?? [],
        {
          query: search.q,
          ownership: search.own,
          lent: search.lent,
          favorite: search.fav,
          artist: search.artist,
          genre: search.genre,
          label: search.label,
          decade: search.decade,
          tag: search.tag,
          collectionId: search.collection,
          sort: search.sort,
        },
        collections ?? [],
        spins ?? [],
      ),
    [records, collections, spins, search],
  );

  const lists = (collections ?? []).filter(
    (c) => itemIdsOf(c, 'record').length > 0 || c.id === search.collection,
  );
  const activeCollection = collections?.find((c) => c.id === search.collection);
  const hasFilters = Boolean(
    search.q ||
      search.own ||
      search.lent ||
      search.fav ||
      search.artist ||
      search.genre ||
      search.label ||
      search.decade ||
      search.tag,
  );
  const add = () => dialogs.open({ type: 'addRecord' });
  const scan = () => dialogs.open({ type: 'addRecord', scan: true });

  if (records && records.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow={t('records.eyebrowPage')}
          title={t('records.title')}
          lede={t('records.lede')}
        />
        <EmptyState
          title={t('records.emptyTitle')}
          description={t('records.emptyText')}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={add}>
                <PlusIcon /> {t('records.addFirst')}
              </Button>
              <Button variant="outline" onClick={scan}>
                <ScanBarcodeIcon /> {t('record.scan.button')}
              </Button>
              <Button variant="ghost" onClick={() => dialogs.open({ type: 'record' })}>
                {t('record.add.manual')}
              </Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t('records.eyebrowPage')}
        title={activeCollection?.name ?? t('records.title')}
        lede={activeCollection?.description || t('records.lede')}
        actions={
          <>
            {activeCollection && (
              <Button asChild variant="outline">
                <Link to="/list/$collectionId" params={{ collectionId: activeCollection.id }}>
                  <ListIcon /> {t('lists.open')}
                </Link>
              </Button>
            )}
            {(records ?? []).some((r) => r.ownership === 'owned') && (
              <Button variant="outline" onClick={() => dialogs.open({ type: 'whatToPlay' })}>
                <ShuffleIcon /> {t('record.pick.title')}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={t('record.scan.button')}
              title={t('record.scan.button')}
              onClick={scan}
            >
              <ScanBarcodeIcon />
            </Button>
            <Button onClick={add}>
              <PlusIcon /> {t('records.add')}
            </Button>
          </>
        }
      />

      {lists.length > 0 && (
        <div className="-mx-1 mt-8 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip active={!search.collection} onClick={() => setSearch({ collection: undefined })}>
            {t('records.all')}
          </Chip>
          {lists.map((c) => (
            <Chip
              key={c.id}
              active={search.collection === c.id}
              onClick={() => setSearch({ collection: c.id })}
            >
              {c.name} <span className="opacity-50">{itemIdsOf(c, 'record').length}</span>
            </Chip>
          ))}
        </div>
      )}

      <Toolbar search={search} setSearch={setSearch} records={records ?? []} />

      <div className="mt-6 mb-8 flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <span>{t('records.count', { count: results.length })}</span>
        {hasFilters && (
          <Button
            variant="link"
            size="sm"
            className="ml-2 text-ink-3"
            onClick={() =>
              void navigate({
                search: { collection: search.collection, view: search.view, sort: search.sort },
              })
            }
          >
            {t('records.reset')}
          </Button>
        )}
      </div>

      {results.length === 0 ? (
        records && (
          <EmptyState title={t('records.noMatchTitle')} description={t('records.noMatchText')} />
        )
      ) : (
        <RecordResults view={search.view ?? 'wall'} records={results} />
      )}
    </>
  );
}

function RecordResults({ view, records }: { view: RecordView; records: MusicRecord[] }) {
  switch (view) {
    case 'crate':
      return <RecordCrate records={records} />;
    case 'shelf':
      return <RecordShelf records={records} />;
    case 'list':
      return <RecordTable records={records} />;
    default:
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:gap-x-10 lg:grid-cols-4 xl:grid-cols-5">
          {records.map((r, i) => (
            <RecordCard
              key={r.id}
              record={r}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i, 15) * 35}ms` }}
            />
          ))}
        </div>
      );
  }
}

function Toolbar({
  search,
  setSearch,
  records,
}: {
  search: RecordsSearch;
  setSearch: (patch: Partial<RecordsSearch>) => void;
  records: MusicRecord[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(search.q ?? '');
  const artists = useMemo(() => facet(records.flatMap((r) => r.artists)), [records]);
  const genres = useMemo(() => facet(records.flatMap((r) => r.genres)), [records]);
  const labels = useMemo(
    () => facet(records.flatMap((r) => (r.label ? [r.label] : []))),
    [records],
  );
  const decades = useMemo(
    () => [...new Set(records.flatMap((r) => decadeOf(r.releaseYear) ?? []))].sort((a, b) => a - b),
    [records],
  );
  const tags = useMemo(() => facet(records.flatMap((r) => r.tags)), [records]);
  const advancedCount = [
    search.artist,
    search.genre,
    search.label,
    search.decade,
    search.tag,
  ].filter(Boolean).length;

  const views: Array<{ value: RecordView; icon: typeof ListIcon }> = [
    { value: 'wall', icon: LayoutGridIcon },
    { value: 'crate', icon: LayersIcon },
    { value: 'shelf', icon: GalleryHorizontalIcon },
    { value: 'list', icon: ListIcon },
  ];

  return (
    <div className="mt-6 flex flex-col gap-4 border-y border-line py-4 lg:flex-row lg:items-center">
      <form
        className="relative lg:w-72"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch({ q: query.trim() || undefined });
        }}
      >
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          type="search"
          value={query}
          placeholder={t('records.searchPlaceholder')}
          aria-label={t('records.searchPlaceholder')}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value === '') setSearch({ q: undefined });
          }}
          onBlur={() => setSearch({ q: query.trim() || undefined })}
          className="rounded-full pl-9"
        />
      </form>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Segmented
          aria-label={t('record.fields.ownership')}
          value={search.own ?? 'all'}
          onChange={(v) => setSearch({ own: v === 'all' ? undefined : v })}
          options={[
            { value: 'all', label: t('records.filterAll') },
            { value: 'owned', label: t('record.ownership.owned') },
            { value: 'wishlist', label: t('record.ownership.wishlist') },
          ]}
        />
        <Chip
          active={search.fav}
          onClick={() => setSearch({ fav: search.fav ? undefined : true })}
          leading={<HeartIcon className="size-3.5" />}
        >
          {t('records.favorites')}
        </Chip>
        <Chip
          active={search.lent}
          onClick={() => setSearch({ lent: search.lent ? undefined : true })}
          leading={<HandshakeIcon className="size-3.5" />}
        >
          {t('records.lent')}
        </Chip>
        <Popover>
          <PopoverTrigger asChild>
            <Chip
              active={advancedCount > 0}
              leading={<SlidersHorizontalIcon className="size-3.5" />}
            >
              {t('records.filters')}
              {advancedCount > 0 && <span className="opacity-60">{advancedCount}</span>}
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-4">
            <FacetSelect
              id="records-artist"
              label={t('records.artist')}
              any={t('records.anyArtist')}
              value={search.artist}
              options={artists}
              onChange={(artist) => setSearch({ artist })}
            />
            <FacetSelect
              id="records-genre"
              label={t('record.fields.genres')}
              any={t('records.anyGenre')}
              value={search.genre}
              options={genres}
              onChange={(genre) => setSearch({ genre })}
            />
            <FacetSelect
              id="records-label"
              label={t('record.fields.label')}
              any={t('records.anyLabel')}
              value={search.label}
              options={labels}
              onChange={(label) => setSearch({ label })}
            />
            {decades.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="records-decade">{t('records.decade')}</Label>
                <Select
                  id="records-decade"
                  value={search.decade ?? ''}
                  onChange={(e) =>
                    setSearch({ decade: e.target.value ? Number(e.target.value) : undefined })
                  }
                >
                  <option value="">{t('records.anyDecade')}</option>
                  {decades.map((d) => (
                    <option key={d} value={d}>
                      {t('records.decadeName', { decade: d })}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {tags.length > 0 && (
              <FacetSelect
                id="records-tag"
                label={t('records.tag')}
                any={t('records.anyTag')}
                value={search.tag}
                options={tags.map((tag) => ({ ...tag, label: `#${tag.value}` }))}
                onChange={(tag) => setSearch({ tag })}
              />
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2 lg:ml-auto">
        <Select
          aria-label={t('records.sort')}
          value={search.sort ?? 'added'}
          onChange={(e) =>
            setSearch({
              sort:
                e.target.value === 'added' ? undefined : (e.target.value as RecordsSearch['sort']),
            })
          }
          className="h-9 w-auto rounded-full text-xs"
          disabled={Boolean(search.collection)}
        >
          {recordSorts.map((s) => (
            <option key={s} value={s}>
              {t(`records.sorts.${s}`)}
            </option>
          ))}
        </Select>
        <Segmented
          aria-label={t('records.view')}
          value={search.view ?? 'wall'}
          onChange={(v) => setSearch({ view: v === 'wall' ? undefined : v })}
          options={views.map(({ value, icon: Icon }) => ({
            value,
            label: (
              <>
                <Icon className="size-4" />
                <span className="sr-only">{t(`records.views.${value}`)}</span>
              </>
            ),
          }))}
        />
      </div>
    </div>
  );
}

function FacetSelect({
  id,
  label,
  any,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  any: string;
  value: string | undefined;
  options: Array<{ value: string; count: number; label?: string }>;
  onChange: (value: string | undefined) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label ?? o.value} ({o.count})
          </option>
        ))}
      </Select>
    </div>
  );
}

function RecordTable({ records }: { records: MusicRecord[] }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="eyebrow border-b border-line-strong text-ink-3">
            <th className="w-14 py-3 font-semibold" />
            <th className="py-3 font-semibold">{t('record.fields.title')}</th>
            <th className="py-3 font-semibold">{t('record.fields.artists')}</th>
            <th className="py-3 font-semibold">{t('record.fields.label')}</th>
            <th className="py-3 font-semibold">{t('record.fields.year')}</th>
            <th className="py-3 font-semibold">{t('record.fields.condition')}</th>
            <th className="py-3 text-right font-semibold">{t('record.fields.added')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="group border-b border-line transition-colors hover:bg-ink/3">
              <td className="py-2 pr-3">
                <RecordSleeve record={r} className="w-10 shadow-soft" />
              </td>
              <td className="py-2 pr-4">
                <Link
                  to="/record/$recordId"
                  params={{ recordId: r.id }}
                  className="caption text-base group-hover:text-accent"
                >
                  {r.title}
                </Link>
                {r.favorite && (
                  <HeartIcon className="ml-2 inline size-3.5 fill-accent text-accent" />
                )}
              </td>
              <td className="py-2 pr-4 text-ink-2">{r.artists.join(', ')}</td>
              <td className="py-2 pr-4 text-ink-2">
                {r.label}
                {r.catalogNumber && (
                  <span className="ml-2 font-mono text-[0.7rem] tracking-wide text-ink-3">
                    {r.catalogNumber}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 text-ink-2 tabular-nums">{r.releaseYear}</td>
              <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                {[r.conditionMedia, r.conditionSleeve].filter(Boolean).join(' / ')}
              </td>
              <td className="py-2 text-right text-ink-3 tabular-nums">
                {r.ownership === 'owned'
                  ? format.date(r.createdAt, 'medium')
                  : t(`record.ownership.${r.ownership}`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
