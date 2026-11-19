import { type RecordOwnership, type RecordSort, recordOwnerships, recordSorts } from '@mnemo/core';

export const recordViews = ['wall', 'shelf', 'list'] as const;
export type RecordView = (typeof recordViews)[number];

/** URL search params of the record collection; every filter is shareable as a link. */
export interface RecordsSearch {
  q?: string;
  own?: RecordOwnership;
  lent?: boolean;
  fav?: boolean;
  artist?: string;
  genre?: string;
  label?: string;
  decade?: number;
  tag?: string;
  collection?: string;
  sort?: RecordSort;
  view?: RecordView;
}

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
const flag = (v: unknown) => (v === true || v === 'true' ? true : undefined);
const oneOf = <T extends string>(v: unknown, values: readonly T[]) =>
  values.includes(v as T) ? (v as T) : undefined;
const decade = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n % 10 === 0 && n > 1000 && n < 3000 ? n : undefined;
};

export function validateRecordsSearch(search: Record<string, unknown>): RecordsSearch {
  const result: RecordsSearch = {
    q: str(search.q),
    own: oneOf(search.own, recordOwnerships),
    lent: flag(search.lent),
    fav: flag(search.fav),
    artist: str(search.artist),
    genre: str(search.genre),
    label: str(search.label),
    decade: decade(search.decade),
    tag: str(search.tag),
    collection: str(search.collection),
    sort: oneOf(search.sort, recordSorts),
    view: oneOf(search.view, recordViews),
  };
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined));
}
