import { normalizeBarcode, sameBarcode } from '../lib/barcode';
import { normalizeName, nowIso, todayIsoDate } from '../lib/misc';
import type {
  Collection,
  Credit,
  Loan,
  MusicRecord,
  RecordDraft,
  RecordOwnership,
  Spin,
  Track,
} from '../model/entities';
import type { MnemoStore } from '../repositories';
import { itemIdsOf, unlinkFromCollections } from './collections';
import { resolveCreatorIds } from './creators';

async function getRecord(store: MnemoStore, id: string): Promise<MusicRecord> {
  const record = await store.records.get(id);
  if (!record) throw new Error(`Record ${id} not found`);
  return record;
}

/**
 * Everyone named on a record, artists first, each once. `creatorIds` follows this order, so the
 * person behind a name is `creatorIds[recordPeople(record).indexOf(name)]`.
 */
export function recordPeople(record: { artists: readonly string[]; credits: readonly Credit[] }) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [...record.artists, ...record.credits.map((c) => c.name)]) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name.trim());
  }
  return names;
}

/** The linked person behind a name on the record, if any. */
export function recordCreatorId(
  record: Pick<MusicRecord, 'artists' | 'credits' | 'creatorIds'>,
  name: string,
): string | undefined {
  const key = normalizeName(name);
  const index = recordPeople(record).findIndex((n) => normalizeName(n) === key);
  return index >= 0 ? record.creatorIds[index] : undefined;
}

/**
 * Creates or updates a record, normalising its barcode and linking artists and credited people
 * (designers, producers, …) as creators. On updates, fields missing from the draft stay as they
 * are.
 */
export async function saveRecord(
  store: MnemoStore,
  draft: RecordDraft,
  id?: string,
): Promise<MusicRecord> {
  const existing = id ? await store.records.get(id) : undefined;
  const artists = (draft.artists ?? existing?.artists ?? []).map((a) => a.trim()).filter(Boolean);
  const credits = draft.credits ?? existing?.credits ?? [];
  const creatorIds =
    draft.creatorIds ??
    (await resolveCreatorIds(
      store,
      recordPeople({ artists, credits }),
      existing && { names: recordPeople(existing), creatorIds: existing.creatorIds },
    ));
  const next: RecordDraft = { ...draft, artists, credits, creatorIds };
  if ('barcode' in draft)
    next.barcode = draft.barcode ? normalizeBarcode(draft.barcode) : undefined;
  if (draft.ownership && draft.ownership !== 'owned') next.loan = undefined;
  return id ? store.records.update(id, next) : store.records.create(next);
}

/** A record already in the collection with the same barcode or catalogue id. */
export async function findRecord(
  store: MnemoStore,
  ids: { barcode?: string; musicbrainzId?: string; discogsId?: string },
): Promise<MusicRecord | undefined> {
  return (await store.records.list()).find(
    (r) =>
      (!!ids.musicbrainzId && r.musicbrainzId === ids.musicbrainzId) ||
      (!!ids.discogsId && r.discogsId === ids.discogsId) ||
      (!!ids.barcode && !!r.barcode && sameBarcode(r.barcode, ids.barcode)),
  );
}

export async function lendRecord(store: MnemoStore, id: string, loan: Loan): Promise<MusicRecord> {
  const record = await getRecord(store, id);
  if (record.ownership !== 'owned') throw new Error('Only owned records can be lent');
  return store.records.update(id, { loan });
}

export async function returnRecord(store: MnemoStore, id: string): Promise<MusicRecord> {
  return store.records.update(id, { loan: undefined });
}

/** Deletes a record with its images and listening log. */
export async function removeRecord(store: MnemoStore, id: string): Promise<void> {
  await store.transaction(async () => {
    const record = await store.records.get(id);
    if (!record) return;
    await unlinkFromCollections(store, { kind: 'record', id });
    for (const spin of await store.spins.list()) {
      if (spin.recordId === id) await store.spins.delete(spin.id);
    }
    for (const mediaId of record.mediaIds) await store.media.delete(mediaId);
    await store.records.delete(id);
  });
}

/** Logs that a record was played, now unless `playedAt` says otherwise. */
export async function logSpin(
  store: MnemoStore,
  recordId: string,
  spin: { playedAt?: string; sides?: string[]; note?: string } = {},
): Promise<Spin> {
  await getRecord(store, recordId);
  return store.spins.create({
    recordId,
    playedAt: spin.playedAt ?? nowIso(),
    sides: spin.sides ?? [],
    note: spin.note?.trim() || undefined,
  });
}

// ── Sides and durations ────────────────────────────────────────────────────

/** The side a track position belongs to: `A2` → `A`, `C` → `C`; plain numbers have none. */
export function sideOf(position: string): string | undefined {
  return position
    .trim()
    .match(/^([A-Za-z])/)?.[1]
    ?.toUpperCase();
}

export interface RecordSide {
  /** `undefined` for releases numbered without sides, e.g. CDs. */
  side: string | undefined;
  tracks: Track[];
  /** Sum of the track lengths in seconds; `undefined` when one is unknown. */
  duration: number | undefined;
}

const sumDurations = (tracks: readonly Track[]) =>
  tracks.every((t) => t.duration)
    ? tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0)
    : undefined;

/** Tracks grouped into consecutive sides, in the order of the tracklist. */
export function recordSides(tracks: readonly Track[]): RecordSide[] {
  const sides: RecordSide[] = [];
  for (const track of tracks) {
    const side = sideOf(track.position);
    const last = sides.at(-1);
    if (last && last.side === side) last.tracks.push(track);
    else sides.push({ side, tracks: [track], duration: undefined });
  }
  for (const s of sides) s.duration = sumDurations(s.tracks);
  return sides;
}

/** Total length in seconds, or `undefined` when a track length is missing. */
export function recordDuration(record: Pick<MusicRecord, 'tracks'>): number | undefined {
  return record.tracks.length > 0 ? sumDurations(record.tracks) : undefined;
}

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/** Parses `m:ss` or `h:mm:ss` into seconds. */
export function parseDuration(input: string): number | undefined {
  const parts = input.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || !parts.every((p) => /^\d+$/.test(p))) {
    return undefined;
  }
  const seconds = parts.reduce((sum, p) => sum * 60 + Number(p), 0);
  return seconds > 0 ? seconds : undefined;
}

/** `A1`, `b2`, `AA1` or `3`; a position needs a digit so titles like `So What` stay whole. */
const POSITION = /^(?:[A-Za-z]{1,2}\d{1,3}|\d{1,3})\.?$/;
const DURATION = /^\(?(\d{1,2}(?::\d{2}){1,2})\)?$/;

/**
 * Reads a tracklist typed one track per line, e.g. `A1  So What  9:22`. Position and length are
 * optional; tabs, dashes and dots between the parts are allowed.
 */
export function parseTracklist(text: string): Track[] {
  return text.split('\n').flatMap((line) => {
    const parts = line
      .trim()
      .split(/\s+/)
      .filter((p) => !/^[-–—·.]$/.test(p));
    if (parts.length === 0) return [];
    let position = '';
    if (parts.length > 1 && POSITION.test(parts[0]!)) position = parts.shift()!.replace(/\.$/, '');
    const last = parts.at(-1)!.match(DURATION);
    const duration = last && parts.length > 1 ? parseDuration(last[1]!) : undefined;
    if (duration) parts.pop();
    const title = parts.join(' ').trim();
    return title ? [{ position: position.toUpperCase(), title, duration }] : [];
  });
}

/** The text form `parseTracklist` reads. */
export function formatTracklist(
  tracks: ReadonlyArray<Pick<Track, 'title' | 'duration'> & { position?: string }>,
): string {
  return tracks
    .map((t) =>
      [t.position, t.title, t.duration ? formatDuration(t.duration) : '']
        .filter(Boolean)
        .join('  '),
    )
    .join('\n');
}

/** How long a spin lasted: the sides it names, or the whole record. */
export function spinSeconds(record: Pick<MusicRecord, 'tracks'>, spin: Pick<Spin, 'sides'>) {
  if (spin.sides.length === 0) return recordDuration(record);
  const wanted = new Set(spin.sides.map((s) => s.toUpperCase()));
  const sides = recordSides(record.tracks).filter((s) => s.side && wanted.has(s.side));
  if (sides.length === 0 || sides.some((s) => s.duration === undefined)) return undefined;
  return sides.reduce((sum, s) => sum + (s.duration ?? 0), 0);
}

// ── Listening log ──────────────────────────────────────────────────────────

/** Spin statistics per record. */
export interface SpinStats {
  count: number;
  last: string | undefined;
}

export function spinStats(spins: readonly Spin[]): Map<string, SpinStats> {
  const stats = new Map<string, SpinStats>();
  for (const spin of spins) {
    const s = stats.get(spin.recordId) ?? { count: 0, last: undefined };
    s.count += 1;
    if (!s.last || spin.playedAt > s.last) s.last = spin.playedAt;
    stats.set(spin.recordId, s);
  }
  return stats;
}

/** The most recent spin, e.g. for "on the turntable". */
export function latestSpin(spins: readonly Spin[]): Spin | undefined {
  let latest: Spin | undefined;
  for (const spin of spins) if (!latest || spin.playedAt > latest.playedAt) latest = spin;
  return latest;
}

const DAY = 86_400_000;

/** Whole days since a record was last played, or since it joined the collection if never. */
export function daysSincePlayed(
  record: Pick<MusicRecord, 'createdAt' | 'acquisition'>,
  last: string | undefined,
  now = new Date(),
): number {
  const since = last ?? record.acquisition?.date ?? record.createdAt;
  return Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY));
}

/** Records that can be played right now: on the shelf and not lent. */
export const playable = (r: MusicRecord) => r.ownership === 'owned' && !r.loan;

export interface PickOptions {
  genre?: string;
  /** Upper bound for the record's length in minutes; records of unknown length pass. */
  maxMinutes?: number;
  /** Only records not played for a year. */
  dusty?: boolean;
  now?: Date;
  random?: () => number;
}

/**
 * "What shall I play?": a random playable record, favouring ones that have not been played for
 * a while; the record played last is skipped when there is any other choice.
 */
export function pickRecord(
  records: readonly MusicRecord[],
  spins: readonly Spin[],
  options: PickOptions = {},
): MusicRecord | undefined {
  const { now = new Date(), random = Math.random } = options;
  const stats = spinStats(spins);
  const genre = options.genre ? normalizeName(options.genre) : undefined;
  let candidates = records.filter((r) => {
    if (!playable(r)) return false;
    if (genre && !r.genres.some((g) => normalizeName(g) === genre)) return false;
    const duration = recordDuration(r);
    if (options.maxMinutes && duration && duration > options.maxMinutes * 60) return false;
    if (options.dusty && daysSincePlayed(r, stats.get(r.id)?.last, now) < 365) return false;
    return true;
  });
  const last = latestSpin(spins)?.recordId;
  if (candidates.length > 1) candidates = candidates.filter((r) => r.id !== last);
  if (candidates.length === 0) return undefined;

  const weights = candidates.map(
    (r) => 1 + Math.min(daysSincePlayed(r, stats.get(r.id)?.last, now), 365) / 30,
  );
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return candidates[i];
  }
  return candidates.at(-1);
}

// ── Queries ────────────────────────────────────────────────────────────────

export const recordSorts = ['added', 'artist', 'title', 'year', 'played'] as const;
export type RecordSort = (typeof recordSorts)[number];

export interface RecordFilter {
  query?: string;
  ownership?: RecordOwnership;
  lent?: boolean;
  favorite?: boolean;
  artist?: string;
  genre?: string;
  label?: string;
  /** First year of a decade, e.g. `1960`. */
  decade?: number;
  tag?: string;
  collectionId?: string;
  /** Ignored inside a list, which keeps its own order. */
  sort?: RecordSort;
}

export const decadeOf = (year: number | undefined) =>
  year === undefined ? undefined : Math.floor(year / 10) * 10;

/** Sort key of the first artist; a leading article is ignored: `The Beatles` → `beatles`. */
function artistKey(record: MusicRecord): string {
  return normalizeName(record.artists[0] ?? '').replace(/^(the|die|der|les|la|le) /, '');
}

export function filterRecords(
  records: readonly MusicRecord[],
  filter: RecordFilter,
  collections: readonly Collection[] = [],
  spins: readonly Spin[] = [],
): MusicRecord[] {
  const terms = filter.query ? normalizeName(filter.query).split(' ').filter(Boolean) : [];
  const collection = filter.collectionId
    ? collections.find((c) => c.id === filter.collectionId)
    : undefined;
  const order = collection
    ? new Map(itemIdsOf(collection, 'record').map((id, i) => [id, i]))
    : undefined;
  const artist = filter.artist ? normalizeName(filter.artist) : undefined;
  const genre = filter.genre ? normalizeName(filter.genre) : undefined;
  const label = filter.label ? normalizeName(filter.label) : undefined;

  const result = records.filter((r) => {
    if (filter.ownership && r.ownership !== filter.ownership) return false;
    if (filter.lent && !r.loan) return false;
    if (filter.favorite && !r.favorite) return false;
    if (artist && !recordPeople(r).some((a) => normalizeName(a) === artist)) return false;
    if (genre && !r.genres.some((g) => normalizeName(g) === genre)) return false;
    if (label && normalizeName(r.label ?? '') !== label) return false;
    if (filter.decade !== undefined && decadeOf(r.releaseYear) !== filter.decade) return false;
    if (filter.tag && !r.tags.includes(filter.tag)) return false;
    if (order && !order.has(r.id)) return false;
    if (terms.length > 0) {
      const haystack = normalizeName(
        [
          r.title,
          ...recordPeople(r),
          r.label,
          r.catalogNumber,
          r.barcode,
          r.releaseYear,
          r.country,
          r.variant,
          r.notes,
          r.loan?.name,
          r.acquisition?.from,
          ...r.genres,
          ...r.tags,
          ...r.tracks.map((t) => t.title),
        ].join(' '),
      );
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });

  if (order) return result.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const stats = filter.sort === 'played' ? spinStats(spins) : undefined;
  const by: Record<RecordSort, (a: MusicRecord, b: MusicRecord) => number> = {
    added: (a, b) => b.createdAt.localeCompare(a.createdAt),
    title: (a, b) => a.title.localeCompare(b.title),
    artist: (a, b) =>
      artistKey(a).localeCompare(artistKey(b)) ||
      (a.releaseYear ?? 0) - (b.releaseYear ?? 0) ||
      a.title.localeCompare(b.title),
    year: (a, b) =>
      (a.releaseYear ?? Number.POSITIVE_INFINITY) - (b.releaseYear ?? Number.POSITIVE_INFINITY) ||
      artistKey(a).localeCompare(artistKey(b)),
    played: (a, b) => (stats?.get(b.id)?.last ?? '').localeCompare(stats?.get(a.id)?.last ?? ''),
  };
  return result.sort(by[filter.sort ?? 'added']);
}

// ── Insights ───────────────────────────────────────────────────────────────

export interface MusicInsight {
  /** Records on the shelf; wishlist and sold ones are left out. */
  records: number;
  wishlist: number;
  spins: number;
  /** Seconds listened, counting only spins whose length is known. */
  listened: number;
  spinsByYear: Array<{ year: number; count: number }>;
  /** Spins per local day (`YYYY-MM-DD`) within the last year, for a calendar heatmap. */
  spinsByDay: Map<string, number>;
  decades: Array<{ decade: number; count: number }>;
  genres: Array<{ name: string; count: number }>;
  labels: Array<{ name: string; count: number }>;
  mostPlayed: Array<{ record: MusicRecord; count: number }>;
  /** Owned records not played for a year, longest-waiting first. */
  dusty: Array<{ record: MusicRecord; days: number }>;
  /** What the shelf cost, per currency. */
  spent: Array<{ currency: string; amount: number }>;
}

function topCounts(values: Iterable<string>, limit = 8) {
  const counts = new Map<string, { name: string; count: number }>();
  for (const value of values) {
    const key = normalizeName(value);
    if (!key) continue;
    const entry = counts.get(key) ?? { name: value, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function computeMusicInsights(
  records: readonly MusicRecord[],
  spins: readonly Spin[],
  now = new Date(),
): MusicInsight {
  const shelf = records.filter((r) => r.ownership === 'owned');
  const byId = new Map(records.map((r) => [r.id, r]));
  const stats = spinStats(spins);

  const years = new Map<number, number>();
  const days = new Map<string, number>();
  const yearAgo = todayIsoDate(new Date(now.getTime() - 365 * DAY));
  let listened = 0;
  for (const spin of spins) {
    const day = todayIsoDate(new Date(spin.playedAt));
    const year = Number(day.slice(0, 4));
    years.set(year, (years.get(year) ?? 0) + 1);
    if (day > yearAgo) days.set(day, (days.get(day) ?? 0) + 1);
    const record = byId.get(spin.recordId);
    listened += (record && spinSeconds(record, spin)) || 0;
  }

  const decades = new Map<number, number>();
  for (const r of shelf) {
    const decade = decadeOf(r.releaseYear);
    if (decade !== undefined) decades.set(decade, (decades.get(decade) ?? 0) + 1);
  }

  const spent = new Map<string, number>();
  for (const r of shelf) {
    const { price, currency = 'EUR' } = r.acquisition ?? {};
    if (price) spent.set(currency, (spent.get(currency) ?? 0) + price);
  }

  return {
    records: shelf.length,
    wishlist: records.filter((r) => r.ownership === 'wishlist').length,
    spins: spins.length,
    listened,
    spinsByYear: [...years]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year),
    spinsByDay: days,
    decades: [...decades]
      .map(([decade, count]) => ({ decade, count }))
      .sort((a, b) => a.decade - b.decade),
    genres: topCounts(shelf.flatMap((r) => r.genres)),
    labels: topCounts(shelf.flatMap((r) => (r.label ? [r.label] : []))),
    mostPlayed: [...stats]
      .flatMap(([id, s]) => {
        const record = byId.get(id);
        return record ? [{ record, count: s.count }] : [];
      })
      .sort((a, b) => b.count - a.count || a.record.title.localeCompare(b.record.title))
      .slice(0, 5),
    dusty: shelf
      .map((record) => ({ record, days: daysSincePlayed(record, stats.get(record.id)?.last, now) }))
      .filter((d) => d.days >= 365)
      .sort((a, b) => b.days - a.days),
    spent: [...spent]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}
