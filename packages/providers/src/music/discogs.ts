import { normalizeBarcode, parseDuration, type Track } from '@mnemo/core';
import { compact, fetchJson, query } from '../http';
import type {
  ProviderContext,
  RecordDetails,
  RecordSearchProvider,
  RecordSearchResult,
} from '../types';
import {
  carrierFrom,
  cleanArtistName,
  creditRoleFrom,
  firstBarcode,
  mergeCredits,
  yearFrom,
} from './common';

interface DiscogsFormat {
  name: string;
  qty?: string;
  text?: string;
  descriptions?: string[];
}

export interface DiscogsSearchResponse {
  results: Array<{
    id: number;
    title: string;
    year?: string;
    country?: string;
    label?: string[];
    catno?: string;
    barcode?: string[];
    genre?: string[];
    style?: string[];
    formats?: DiscogsFormat[];
    thumb?: string;
    cover_image?: string;
    uri?: string;
  }>;
}

interface DiscogsArtist {
  name: string;
  anv?: string;
  role?: string;
}

export interface DiscogsRelease {
  id: number;
  title: string;
  year?: number;
  country?: string;
  uri?: string;
  master_id?: number;
  artists?: DiscogsArtist[];
  extraartists?: DiscogsArtist[];
  labels?: Array<{ name: string; catno?: string }>;
  formats?: DiscogsFormat[];
  identifiers?: Array<{ type: string; value: string }>;
  genres?: string[];
  styles?: string[];
  tracklist?: Array<{ position: string; type_: string; title: string; duration?: string }>;
  images?: Array<{ type: string; uri: string; uri150?: string }>;
}

const API = 'https://api.discogs.com';
/** 60 requests a minute with a token. */
const RATE = { minIntervalMs: 1000 };
const KEY = 'discogs';

/** The token travels as a parameter: a header would need a CORS preflight per request. */
const withToken = (params: Record<string, string | number | undefined>, ctx: ProviderContext) =>
  query({ ...params, token: ctx.keys?.[KEY] });

function carrierOf(formats: DiscogsFormat[] | undefined) {
  const words = (formats ?? []).flatMap((f) => [f.name, ...(f.descriptions ?? [])]);
  const vinylFormats = (formats ?? []).filter((f) => /vinyl|shellac/i.test(f.name));
  const discs = vinylFormats.reduce((sum, f) => sum + (Number(f.qty) || 1), 0);
  return {
    ...carrierFrom(words),
    discCount: discs > 0 ? discs : undefined,
    formatText: (formats ?? [])
      .map((f) => [f.name, ...(f.descriptions ?? [])].join(', '))
      .join(' + '),
  };
}

/** Discogs titles search results `Artist - Title`. */
function splitTitle(title: string): { artists: string[]; title: string } {
  const at = title.indexOf(' - ');
  return at < 0
    ? { artists: [], title }
    : { artists: [cleanArtistName(title.slice(0, at))], title: title.slice(at + 3) };
}

export function mapDiscogsSearch(response: DiscogsSearchResponse): RecordSearchResult[] {
  const results = response.results.map((r) =>
    compact({
      provider: 'discogs',
      externalId: String(r.id),
      ...splitTitle(r.title),
      label: r.label?.[0],
      catalogNumber: r.catno && r.catno !== 'none' ? r.catno : undefined,
      barcode: firstBarcode(r.barcode ?? []),
      year: yearFrom(r.year),
      country: r.country,
      ...carrierOf(r.formats),
      genres: [...(r.genre ?? []), ...(r.style ?? [])].slice(0, 4),
      coverUrl: r.cover_image || undefined,
      thumbUrl: r.thumb || undefined,
      url: r.uri ? `https://www.discogs.com${r.uri}` : undefined,
    }),
  );
  return [...results.filter((r) => r.vinyl), ...results.filter((r) => !r.vinyl)];
}

const artistName = (a: DiscogsArtist) => cleanArtistName(a.anv || a.name);

export function mapDiscogsRelease(release: DiscogsRelease, originalYear?: number): RecordDetails {
  const label = release.labels?.[0];
  const identifiers = release.identifiers ?? [];
  const tracks: Track[] = (release.tracklist ?? [])
    .filter((t) => t.type_ === 'track')
    .map((t) =>
      compact({
        position: t.position.toUpperCase(),
        title: t.title,
        duration: t.duration ? parseDuration(t.duration) : undefined,
      }),
    );
  const credits = (release.extraartists ?? []).flatMap((a) =>
    (a.role ?? '').split(',').flatMap((part) => {
      const role = creditRoleFrom(part.trim());
      return role ? [{ name: artistName(a), ...role }] : [];
    }),
  );
  const variant = (release.formats ?? []).flatMap((f) => (f.text ? [f.text] : [])).join(', ');
  const cover = release.images?.find((i) => i.type === 'primary') ?? release.images?.[0];
  const year = release.year || undefined;
  return compact({
    provider: 'discogs',
    externalId: String(release.id),
    title: release.title,
    artists: (release.artists ?? []).map(artistName),
    label: label?.name,
    catalogNumber: label?.catno && label.catno !== 'none' ? label.catno : undefined,
    barcode: firstBarcode(identifiers.filter((i) => i.type === 'Barcode').map((i) => i.value)),
    year,
    releaseYear: originalYear ?? year,
    country: release.country,
    ...carrierOf(release.formats),
    genres: [...(release.genres ?? []), ...(release.styles ?? [])].slice(0, 4),
    coverUrl: cover?.uri,
    thumbUrl: cover?.uri150,
    url: release.uri,
    tracks,
    credits: mergeCredits(credits),
    variant: variant || undefined,
    matrix: identifiers.find((i) => i.type === 'Matrix / Runout')?.value,
  }) as RecordDetails;
}

export const discogsProvider: RecordSearchProvider = {
  id: 'discogs',
  name: 'Discogs',
  homepage: 'https://www.discogs.com/developers',
  requiresKey: { id: KEY, signupUrl: 'https://www.discogs.com/settings/developers' },
  storableCovers: false,
  async search(q, ctx) {
    const params = withToken({ q, type: 'release', per_page: 25 }, ctx);
    const url = `${API}/database/search?${params}`;
    return mapDiscogsSearch(await fetchJson<DiscogsSearchResponse>('discogs', url, ctx, RATE));
  },
  async byBarcode(code, ctx) {
    const digits = normalizeBarcode(code);
    if (!digits) return [];
    const params = withToken({ barcode: digits, type: 'release', per_page: 10 }, ctx);
    const url = `${API}/database/search?${params}`;
    return mapDiscogsSearch(await fetchJson<DiscogsSearchResponse>('discogs', url, ctx, RATE));
  },
  async details(id, ctx) {
    const url = `${API}/releases/${encodeURIComponent(id)}?${withToken({}, ctx)}`;
    const release = await fetchJson<DiscogsRelease>('discogs', url, ctx, RATE);
    // The master release knows the year of the original; a reissue only its own.
    const master = release.master_id
      ? await fetchJson<{ year?: number }>(
          'discogs',
          `${API}/masters/${release.master_id}?${withToken({}, ctx)}`,
          ctx,
          RATE,
        ).catch(() => undefined)
      : undefined;
    return mapDiscogsRelease(release, master?.year || undefined);
  },
};
