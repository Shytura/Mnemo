import {
  type Credit,
  type CreditRole,
  normalizeBarcode,
  normalizeName,
  type RecordFormat,
  type RecordSize,
  type RecordSpeed,
} from '@mnemo/core';

export interface CarrierInfo {
  vinyl: boolean;
  format?: RecordFormat;
  size?: RecordSize;
  speed?: RecordSpeed;
  channels?: 'mono' | 'stereo';
}

/**
 * Reads what a catalogue says about the carrier: MusicBrainz medium formats such as
 * `12" Vinyl`, Discogs descriptions such as `LP`, `45 RPM` or `Mono`.
 */
export function carrierFrom(words: readonly string[], releaseType?: string): CarrierInfo {
  const text = words.join(' ').toLowerCase();
  const vinyl = /vinyl|shellac|\blp\b|acetate|lathe/.test(text);
  const size = text.match(/\b(12|10|7)\s*(?:"|″|''|inch)/)?.[1] as RecordSize | undefined;
  const speed = /\b78\s*rpm\b/.test(text)
    ? '78'
    : /\b45\s*rpm\b/.test(text)
      ? '45'
      : /33\s*(?:⅓|1\/3)?\s*rpm/.test(text)
        ? '33'
        : undefined;
  const type = (releaseType ?? '').toLowerCase();
  let format: RecordFormat | undefined;
  if (/shellac/.test(text)) format = 'shellac';
  else if (/box set/.test(text)) format = 'box';
  else if (vinyl) {
    if (/\bsingle\b/.test(text) || type === 'single') format = 'single';
    else if (/\bep\b/.test(text) || type === 'ep') format = 'ep';
    else format = 'lp';
  } else if (/\bcd\b|sacd|dualdisc/.test(text)) format = 'cd';
  else if (/cassette/.test(text)) format = 'cassette';
  const channels = /\bmono\b/.test(text) ? 'mono' : /\bstereo\b/.test(text) ? 'stereo' : undefined;
  return { vinyl, format, size, speed, channels };
}

/** `2010-05-03` → 2010. */
export function yearFrom(date: string | number | undefined): number | undefined {
  const match = String(date ?? '').match(/\b(1[89]\d\d|20\d\d)\b/);
  return match?.[1] ? Number(match[1]) : undefined;
}

/** The first entry that is a valid EAN-13 or UPC-A, ignoring spaces in printed codes. */
export function firstBarcode(candidates: readonly string[]): string | undefined {
  for (const c of candidates) {
    const code = normalizeBarcode(c.replace(/\s/g, ''));
    if (code) return code;
  }
  return undefined;
}

/** Discogs adds a number to tell artists of the same name apart: `Paul Chambers (3)`. */
export const cleanArtistName = (name: string) => name.replace(/\s*\(\d+\)$/, '').trim();

/** Genres arrive in lower case from MusicBrainz. */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Credits that describe the song, not this record; they would crowd the people pages. */
const SONGWRITING = /written|composed|music by|lyrics|words by|songwriter|composer|lyricist/;

/**
 * Maps a catalogue role (MusicBrainz relationship types, Discogs roles such as
 * `Photography By [Cover]` or `Tenor Saxophone`) to a credit role, or `undefined` for credits
 * that are not kept.
 */
export function creditRoleFrom(
  role: string,
  attributes: readonly string[] = [],
): { role: CreditRole; detail?: string } | undefined {
  const bracket = role.match(/\[(.+)\]/)?.[1];
  const base = role
    .replace(/\[.*\]/, '')
    .trim()
    .toLowerCase();
  const detail = bracket ?? attributes.filter((a) => !/^(additional|guest|solo)$/.test(a))[0];
  if (SONGWRITING.test(base)) return undefined;
  if (/^(instrument|vocal|performer|performing orchestra|conductor)$/.test(base)) {
    return { role: 'musician', detail: detail ?? (base === 'vocal' ? 'vocals' : undefined) };
  }
  if (/producer|produced/.test(base)) return { role: 'producer', detail };
  if (/engineer|recorded|recording|mix|master|lacquer|cut by|remaster|sound/.test(base)) {
    return { role: 'engineer', detail: detail ?? (base === 'engineer' ? undefined : base) };
  }
  if (/photo/.test(base)) return { role: 'photography', detail };
  if (/liner notes/.test(base)) return { role: 'linerNotes' };
  if (/illustration|painting|artwork|cover|drawing/.test(base) && !/design/.test(base)) {
    return { role: 'artwork', detail };
  }
  if (/design|art direction|layout|typography|lettering/.test(base)) {
    return { role: 'design', detail: base === 'design' ? detail : (detail ?? base) };
  }
  // Discogs names instruments directly: `Tenor Saxophone`, `Bass`, `Drums`.
  if (/by$|supervis|coordinat|management|a&r|executive|translated|edited/.test(base)) {
    return undefined;
  }
  return { role: 'musician', detail: base };
}

/** One credit per person and role; details of duplicates are joined. */
export function mergeCredits(credits: readonly Credit[], limit = 40): Credit[] {
  const merged = new Map<string, Credit>();
  for (const credit of credits) {
    const key = `${normalizeName(credit.name)}|${credit.role}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...credit });
      continue;
    }
    const details = new Set(
      [existing.detail, credit.detail].flatMap((d) => (d ? d.split(', ') : [])),
    );
    existing.detail = details.size > 0 ? [...details].join(', ') : undefined;
  }
  return [...merged.values()].slice(0, limit);
}
