import { barcodeVariants, type Credit, type Track } from '@mnemo/core';
import { compact, fetchJson, query } from '../http';
import type { RecordDetails, RecordSearchProvider, RecordSearchResult } from '../types';
import {
  capitalize,
  carrierFrom,
  creditRoleFrom,
  firstBarcode,
  mergeCredits,
  yearFrom,
} from './common';

interface MbArtistCredit {
  name: string;
  joinphrase?: string;
}

interface MbRelation {
  type: string;
  attributes?: string[];
  artist?: { name: string };
}

interface MbMedium {
  format?: string | null;
  position?: number;
  'track-count'?: number;
  tracks?: Array<{
    number: string;
    position: number;
    title: string;
    length?: number | null;
    recording?: { relations?: MbRelation[] };
  }>;
}

export interface MbRelease {
  id: string;
  title: string;
  date?: string;
  country?: string;
  barcode?: string | null;
  'artist-credit'?: MbArtistCredit[];
  'label-info'?: Array<{ 'catalog-number'?: string | null; label?: { name: string } | null }>;
  'release-group'?: { 'primary-type'?: string | null; 'first-release-date'?: string };
  media?: MbMedium[];
  genres?: Array<{ name: string; count: number }>;
  relations?: MbRelation[];
  'cover-art-archive'?: { front: boolean };
}

export interface MbSearchResponse {
  releases: MbRelease[];
}

const API = 'https://musicbrainz.org/ws/2';
/** MusicBrainz allows one request per second per client. */
const RATE = { minIntervalMs: 1100 };
const cover = (id: string, size: 250 | 500) =>
  `https://coverartarchive.org/release/${id}/front-${size}`;

/**
 * Credited names, one per artist. MusicBrainz credits each artist on its own; a duo known as one
 * (`Simon & Garfunkel`) is a single artist there too.
 */
const artistsOf = (credits: MbArtistCredit[] | undefined) => (credits ?? []).map((c) => c.name);

function vinylMedia(media: MbMedium[] | undefined) {
  return (media ?? []).filter((m) => /vinyl|shellac/i.test(m.format ?? ''));
}

export function mapMusicBrainzRelease(release: MbRelease): RecordSearchResult {
  const media = release.media ?? [];
  const vinyl = vinylMedia(media);
  const formats = media.map((m) => m.format ?? '').filter(Boolean);
  const carrier = carrierFrom(formats, release['release-group']?.['primary-type'] ?? undefined);
  const label = release['label-info']?.find((l) => l.label?.name);
  const hasCover = release['cover-art-archive']?.front !== false;
  const counted = vinyl.length > 0 ? vinyl.length : media.length;
  return compact({
    provider: 'musicbrainz',
    externalId: release.id,
    title: release.title,
    artists: artistsOf(release['artist-credit']),
    label: label?.label?.name,
    catalogNumber: label?.['catalog-number'] ?? undefined,
    barcode: firstBarcode(release.barcode ? [release.barcode] : []),
    year: yearFrom(release.date),
    country: release.country,
    formatText:
      formats.length > 1 && new Set(formats).size === 1
        ? `${formats.length}×${formats[0]}`
        : formats.join(' + '),
    ...carrier,
    discCount: counted > 0 ? counted : undefined,
    genres: release.genres
      ?.sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((g) => capitalize(g.name)),
    coverUrl: hasCover ? cover(release.id, 500) : undefined,
    thumbUrl: hasCover ? cover(release.id, 250) : undefined,
    url: `https://musicbrainz.org/release/${release.id}`,
  });
}

/** Search results with vinyl pressings first, otherwise in the order of relevance. */
export function mapMusicBrainzSearch(response: MbSearchResponse): RecordSearchResult[] {
  const results = response.releases.map(mapMusicBrainzRelease);
  return [...results.filter((r) => r.vinyl), ...results.filter((r) => !r.vinyl)];
}

function creditsOf(relations: MbRelation[] | undefined): Credit[] {
  return (relations ?? []).flatMap((rel) => {
    const role = rel.artist ? creditRoleFrom(rel.type, rel.attributes) : undefined;
    return role && rel.artist ? [{ name: rel.artist.name, ...role }] : [];
  });
}

export function mapMusicBrainzDetails(release: MbRelease): RecordDetails {
  const media = release.media ?? [];
  const sided = vinylMedia(media).length > 0 ? vinylMedia(media) : media;
  const tracks: Track[] = sided.flatMap((m) =>
    (m.tracks ?? []).map((t) =>
      compact({
        position: t.number,
        title: t.title,
        duration: t.length ? Math.round(t.length / 1000) : undefined,
      }),
    ),
  );
  const recordingRelations = sided.flatMap((m) =>
    (m.tracks ?? []).flatMap((t) => t.recording?.relations ?? []),
  );
  return {
    ...mapMusicBrainzRelease(release),
    releaseYear: yearFrom(release['release-group']?.['first-release-date']),
    tracks,
    credits: mergeCredits([...creditsOf(release.relations), ...creditsOf(recordingRelations)]),
  };
}

export const musicBrainzProvider: RecordSearchProvider = {
  id: 'musicbrainz',
  name: 'MusicBrainz',
  homepage: 'https://musicbrainz.org/doc/MusicBrainz_API',
  async search(q, ctx) {
    // Dismax matches the words against title, artist and label together.
    const url = `${API}/release/?${query({ query: q, dismax: true, limit: 25, fmt: 'json' })}`;
    return mapMusicBrainzSearch(await fetchJson<MbSearchResponse>('musicbrainz', url, ctx, RATE));
  },
  async byBarcode(code, ctx) {
    const variants = barcodeVariants(code);
    if (variants.length === 0) return [];
    const lucene = variants.map((v) => `barcode:${v}`).join(' OR ');
    const url = `${API}/release/?${query({ query: lucene, limit: 10, fmt: 'json' })}`;
    return mapMusicBrainzSearch(await fetchJson<MbSearchResponse>('musicbrainz', url, ctx, RATE));
  },
  async details(id, ctx) {
    const inc =
      'artist-credits+labels+recordings+release-groups+genres+artist-rels+recording-level-rels';
    const url = `${API}/release/${encodeURIComponent(id)}?${query({ inc, fmt: 'json' })}`;
    return mapMusicBrainzDetails(await fetchJson<MbRelease>('musicbrainz', url, ctx, RATE));
  },
};
