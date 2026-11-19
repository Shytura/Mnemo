import { aicProvider } from './art/aic';
import { clevelandProvider } from './art/cleveland';
import { europeanaProvider, harvardProvider } from './art/keyed';
import { metProvider } from './art/met';
import { wikidataProvider } from './art/wikidata';
import { dnbProvider } from './books/dnb';
import { googleBooksProvider } from './books/googlebooks';
import { openLibraryProvider } from './books/openlibrary';
import { discogsProvider } from './music/discogs';
import { musicBrainzProvider } from './music/musicbrainz';
import type {
  ArtworkSearchProvider,
  BookSearchProvider,
  BookSearchResult,
  ProviderContext,
  ProviderKeySpec,
  ProviderKeys,
  RecordSearchProvider,
  RecordSearchResult,
} from './types';

export { aicProvider, mapAic } from './art/aic';
export { clevelandProvider, mapCleveland } from './art/cleveland';
export { commonsFileName, resolveCommonsImage } from './art/commons';
export { europeanaProvider, harvardProvider, mapEuropeana, mapHarvard } from './art/keyed';
export { mapMetObject, metProvider } from './art/met';
export { buildWikidataQuery, mapWikidata, wikidataProvider } from './art/wikidata';
export { languageFromMarc } from './books/common';
export { buildDnbQuery, dnbProvider, mapDnb, parseDcRecords } from './books/dnb';
export { googleBooksProvider, mapGoogleBooks } from './books/googlebooks';
export {
  mapOpenLibraryBook,
  mapOpenLibrarySearch,
  openLibraryProvider,
} from './books/openlibrary';
export { fetchJson, fetchText, ProviderError } from './http';
export { carrierFrom, creditRoleFrom, mergeCredits } from './music/common';
export { discogsProvider, mapDiscogsRelease, mapDiscogsSearch } from './music/discogs';
export {
  mapMusicBrainzDetails,
  mapMusicBrainzRelease,
  mapMusicBrainzSearch,
  musicBrainzProvider,
} from './music/musicbrainz';
export { mapWikidataPerson, wikidataPeopleProvider, wikidataYear } from './people/wikidata';
export { venueKindFromOsm, venueKindFromTags } from './places/osm';
export {
  buildOverpassQuery,
  mapOverpass,
  OVERPASS_ENDPOINTS,
  overpassProvider,
} from './places/overpass';
export { mapPhotonFeature, photonProvider } from './places/photon';
export { mapSummary, wikipediaSummary, wikipediaSummaryFromTag } from './places/wikipedia';
export * from './types';

/**
 * All art collection providers, in display order. To add a source, implement
 * `ArtworkSearchProvider` in `src/art/` and append it here.
 */
export const artProviders: readonly ArtworkSearchProvider[] = [
  wikidataProvider,
  aicProvider,
  metProvider,
  clevelandProvider,
  europeanaProvider,
  harvardProvider,
];

/**
 * All book catalogues, in display order. To add one, implement `BookSearchProvider` in
 * `src/books/` and append it here.
 */
export const bookProviders: readonly BookSearchProvider[] = [
  openLibraryProvider,
  dnbProvider,
  googleBooksProvider,
];

/**
 * All record catalogues, in display order. To add one, implement `RecordSearchProvider` in
 * `src/music/` and append it here.
 */
export const recordProviders: readonly RecordSearchProvider[] = [
  musicBrainzProvider,
  discogsProvider,
];

const usable =
  (keys: ProviderKeys) =>
  (p: { requiresKey?: ProviderKeySpec }): boolean =>
    !p.requiresKey || Boolean(keys[p.requiresKey.id]);

export function availableArtProviders(keys: ProviderKeys = {}): ArtworkSearchProvider[] {
  return artProviders.filter(usable(keys));
}

export function availableBookProviders(keys: ProviderKeys = {}): BookSearchProvider[] {
  return bookProviders.filter(usable(keys));
}

export function availableRecordProviders(keys: ProviderKeys = {}): RecordSearchProvider[] {
  return recordProviders.filter(usable(keys));
}

/** Providers of every kind that need a key from the user; the settings list one field each. */
export function providersNeedingKeys(): Array<{
  name: string;
  requiresKey: ProviderKeySpec;
}> {
  return [...artProviders, ...bookProviders, ...recordProviders].flatMap((p) =>
    p.requiresKey ? [{ name: p.name, requiresKey: p.requiresKey }] : [],
  );
}

/**
 * Combines what several catalogues know about one edition: each field comes from the first
 * result that has it, the cover preferably from one that can be stored offline.
 */
export function mergeBookResults(
  results: ReadonlyArray<{ result: BookSearchResult; storableCover: boolean }>,
): BookSearchResult | undefined {
  const [first] = results;
  if (!first) return undefined;
  const merged: BookSearchResult = { ...first.result };
  for (const { result } of results.slice(1)) {
    for (const [key, value] of Object.entries(result) as Array<[keyof BookSearchResult, never]>) {
      const current = merged[key];
      if (current === undefined || (Array.isArray(current) && current.length === 0)) {
        merged[key] = value;
      }
    }
  }
  const cover = results.find((r) => r.storableCover && r.result.coverUrl) ?? first;
  return { ...merged, coverUrl: cover.result.coverUrl ?? merged.coverUrl };
}

/**
 * Looks an ISBN up in every usable catalogue at once. With a German UI the national library
 * leads, since it is authoritative for German editions; otherwise Open Library does.
 */
export async function lookupIsbn(
  isbn: string,
  ctx: ProviderContext,
): Promise<BookSearchResult | undefined> {
  const leads = (p: BookSearchProvider) => Number(p.id === 'dnb' && ctx.locale === 'de');
  const providers = availableBookProviders(ctx.keys).sort((a, b) => leads(b) - leads(a));
  const settled = await Promise.allSettled(providers.map((p) => p.byIsbn(isbn, ctx)));
  if (ctx.signal?.aborted) throw ctx.signal.reason;
  const found = settled.flatMap((s, i) =>
    s.status === 'fulfilled' && s.value
      ? [{ result: s.value, storableCover: providers[i]!.storableCovers !== false }]
      : [],
  );
  if (found.length === 0 && settled.every((s) => s.status === 'rejected')) {
    throw (settled[0] as PromiseRejectedResult | undefined)?.reason ?? new Error('No catalogue');
  }
  return mergeBookResults(found);
}

/**
 * Looks a barcode up in every usable record catalogue at once. One barcode can name several
 * pressings (a reissue keeps the code of its first run), so all matches come back, vinyl first.
 */
export async function lookupRecordBarcode(
  code: string,
  ctx: ProviderContext,
): Promise<RecordSearchResult[]> {
  const providers = availableRecordProviders(ctx.keys);
  const settled = await Promise.allSettled(providers.map((p) => p.byBarcode(code, ctx)));
  if (ctx.signal?.aborted) throw ctx.signal.reason;
  if (settled.every((s) => s.status === 'rejected')) {
    throw (settled[0] as PromiseRejectedResult | undefined)?.reason ?? new Error('No catalogue');
  }
  const found = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  return [...found.filter((r) => r.vinyl), ...found.filter((r) => !r.vinyl)];
}
