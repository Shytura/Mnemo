import { describe, expect, it, vi } from 'vitest';
import {
  aicProvider,
  availableArtProviders,
  availableBookProviders,
  availableRecordProviders,
  buildDnbQuery,
  buildOverpassQuery,
  buildWikidataQuery,
  carrierFrom,
  commonsFileName,
  creditRoleFrom,
  discogsProvider,
  dnbProvider,
  fetchJson,
  googleBooksProvider,
  lookupIsbn,
  lookupRecordBarcode,
  mapAic,
  mapCleveland,
  mapDiscogsRelease,
  mapDiscogsSearch,
  mapDnb,
  mapEuropeana,
  mapGoogleBooks,
  mapMetObject,
  mapMusicBrainzDetails,
  mapMusicBrainzSearch,
  mapOpenLibraryBook,
  mapOpenLibrarySearch,
  mapOverpass,
  mapPhotonFeature,
  mapSummary,
  mapWikidata,
  mapWikidataPerson,
  mergeBookResults,
  metProvider,
  musicBrainzProvider,
  openLibraryProvider,
  overpassProvider,
  ProviderError,
  photonProvider,
  providersNeedingKeys,
  resolveCommonsImage,
  venueKindFromTags,
  wikidataPeopleProvider,
  wikidataProvider,
  wikidataYear,
  wikipediaSummary,
} from '../src';
import aicSearch from './fixtures/aic-search.json';
import cmaSearch from './fixtures/cma-search.json';
import discogsRelease from './fixtures/discogs-release.json';
import discogsSearch from './fixtures/discogs-search.json';
import dnbIsbn from './fixtures/dnb-isbn.xml?raw';
import dnbSearch from './fixtures/dnb-search.xml?raw';
import googleBooksSearch from './fixtures/googlebooks-search.json';
import metObject from './fixtures/met-object.json';
import metSearch from './fixtures/met-search.json';
import musicBrainzBarcode from './fixtures/musicbrainz-barcode.json';
import musicBrainzRelease from './fixtures/musicbrainz-release.json';
import musicBrainzSearch from './fixtures/musicbrainz-search.json';
import openLibraryIsbn from './fixtures/openlibrary-isbn.json';
import openLibrarySearch from './fixtures/openlibrary-search.json';
import overpass from './fixtures/overpass.json';
import photonCities from './fixtures/photon-cities.json';
import wikidataPeopleEntities from './fixtures/wikidata-people-entities.json';
import wikidataPeopleSearch from './fixtures/wikidata-people-search.json';
import wikidataSearch from './fixtures/wikidata-search.json';
import wikipediaDisambiguation from './fixtures/wikipedia-summary.json';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const xml = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/xml;charset=UTF-8' } });

describe('art provider mapping', () => {
  it('maps the Art Institute of Chicago with IIIF urls', () => {
    const [first] = mapAic(aicSearch as never);
    expect(first).toMatchObject({
      provider: 'aic',
      externalId: '16568',
      title: 'Water Lilies',
      artist: 'Claude Monet',
      year: '1906',
      license: 'CC0',
      iiifInfoUrl: 'https://www.artic.edu/iiif/2/3c27b499-af56-f0d5-93b5-a7f2f1ad5813/info.json',
    });
    expect(first?.thumbnailUrl).toContain('/full/400,/0/default.jpg');
  });

  it('maps Met objects and skips objects without image', () => {
    expect(mapMetObject(metObject)).toMatchObject({
      title: 'Sunflowers',
      artist: 'Vincent van Gogh',
      museumName: 'The Metropolitan Museum of Art',
    });
    expect(mapMetObject({ objectID: 1, title: 'x' })).toBeUndefined();
  });

  it('maps Cleveland and strips artist biography', () => {
    const [first] = mapCleveland(cmaSearch as never);
    expect(first).toMatchObject({
      title: 'The Red Kerchief',
      artist: 'Claude Monet',
      license: 'CC0',
    });
  });

  it('maps Wikidata bindings, deduplicates items and forces https', () => {
    const results = mapWikidata(wikidataSearch as never);
    const starryNight = results.find((r) => r.externalId === 'Q45585');
    expect(starryNight).toMatchObject({
      title: 'Sternennacht',
      artist: 'Vincent van Gogh',
      year: '1889',
      museumName: 'Museum of Modern Art',
    });
    expect(starryNight?.imageUrl?.startsWith('https://')).toBe(true);
    expect(new Set(results.map((r) => r.externalId)).size).toBe(results.length);
  });

  it('escapes user input in SPARQL', () => {
    const q = buildWikidataQuery('Mona "Lisa"} DROP', 'de');
    expect(q).toContain('mwapi:search "Mona \\"Lisa\\"} DROP"');
  });

  it('maps Europeana items', () => {
    const [item] = mapEuropeana({
      items: [
        {
          id: '/1/a',
          title: ['Das Milchmädchen'],
          dcCreator: ['http://x', 'Johannes Vermeer'],
          edmPreview: ['http://img/p.jpg'],
        },
      ],
    });
    expect(item).toMatchObject({ artist: 'Johannes Vermeer', thumbnailUrl: 'https://img/p.jpg' });
  });

  it('only offers keyed providers when a key is set', () => {
    expect(availableArtProviders().map((p) => p.id)).not.toContain('europeana');
    expect(availableArtProviders({ europeana: 'k' }).map((p) => p.id)).toContain('europeana');
    expect(providersNeedingKeys().map((p) => p.requiresKey.id)).toEqual([
      'europeana',
      'harvard',
      'googlebooks',
      'discogs',
    ]);
  });
});

describe('art provider requests', () => {
  it('queries the AIC search endpoint', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request) => json(aicSearch));
    const results = await aicProvider.search('monet', { locale: 'de', fetch: fetch as never });
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      'api.artic.edu/api/v1/artworks/search?q=monet',
    );
    expect(results).toHaveLength(2);
  });

  it('uses the Met v1.1 search and tolerates failing objects', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/v1.1/search')) return json(metSearch);
      if (u.endsWith('/436524')) return json(metObject);
      return json({ message: 'not found' }, 404);
    });
    const results = await metProvider.search('sunflowers', { locale: 'en', fetch: fetch as never });
    expect(results.map((r) => r.externalId)).toEqual(['436524']);
  });

  it('cancels a throttled request when aborted', async () => {
    const fetch = vi.fn(async () => json({ ok: true }));
    const url = 'https://throttle.test/x';
    await fetchJson('t', url, { locale: 'de', fetch: fetch as never }, { minIntervalMs: 60_000 });
    const controller = new AbortController();
    const pending = fetchJson(
      't',
      url,
      { locale: 'de', fetch: fetch as never, signal: controller.signal },
      { minIntervalMs: 60_000 },
    );
    controller.abort(new Error('stop'));
    await expect(pending).rejects.toThrow('stop');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('wraps HTTP errors', async () => {
    const fetch = vi.fn(async () => json({}, 503));
    await expect(
      aicProvider.search('x', { locale: 'de', fetch: fetch as never }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('places', () => {
  it('maps photon cities', () => {
    const vienna = mapPhotonFeature(
      (photonCities as never as { features: never[] }).features[0]!,
      false,
    );
    expect(vienna).toMatchObject({
      name: 'Wien',
      countryCode: 'AT',
      osmId: 'relation/109166',
      coords: { lat: 48.2083537, lng: 16.3725042 },
    });
  });

  it('maps photon venues with address and kind', () => {
    const venue = mapPhotonFeature(
      {
        geometry: { coordinates: [16.3682605, 48.2046365] },
        properties: {
          osm_type: 'N',
          osm_id: 1,
          osm_key: 'tourism',
          osm_value: 'museum',
          name: 'Albertina',
          street: 'Albertinaplatz',
          housenumber: '1',
          postcode: '1010',
          city: 'Wien',
          countrycode: 'AT',
        },
      },
      true,
    );
    expect(venue).toMatchObject({
      venueKind: 'museum',
      city: 'Wien',
      address: 'Albertinaplatz 1, 1010 Wien',
    });
  });

  it('sends venue tag filters to photon', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request) => json({ features: [] }));
    await photonProvider.searchVenues('Louvre', { locale: 'de', fetch: fetch as never });
    const url = String(fetch.mock.calls[0]?.[0]);
    expect(url).toContain('osm_tag=tourism%3Amuseum');
    expect(url).not.toContain('osm_tag=tourism&');
  });

  it('ranks overpass results by notability', () => {
    const pois = mapOverpass(overpass.elements as never);
    expect(pois[0]?.name).toBeTruthy();
    expect(pois.find((p) => p.name === 'Albertina')?.kind).toBe('museum');
    for (let i = 1; i < pois.length; i++)
      expect(pois[i - 1]!.score).toBeGreaterThanOrEqual(pois[i]!.score);
  });

  it('derives the most specific venue kind', () => {
    expect(venueKindFromTags({ historic: 'castle', tourism: 'museum' })).toBe('museum');
    expect(venueKindFromTags({ historic: 'palace' })).toBe('castle');
    expect(venueKindFromTags({ tourism: 'attraction', amenity: 'place_of_worship' })).toBe(
      'church',
    );
    expect(venueKindFromTags({ amenity: 'cafe' })).toBe('other');
  });

  it('ignores disambiguation pages and missing articles', async () => {
    expect(mapSummary(wikipediaDisambiguation as never)).toBeUndefined();
    const fetch = vi.fn(async () => json({}, 404));
    expect(
      await wikipediaSummary('de', 'Gibtsnicht', { locale: 'de', fetch: fetch as never }),
    ).toBeUndefined();
  });
});

describe('wikimedia commons', () => {
  const filePath =
    'https://commons.wikimedia.org/wiki/Special:FilePath/Monet%20-%20Impression%2C%20Sunrise.jpg?width=1600';

  it('extracts file names only from Special:FilePath urls', () => {
    expect(commonsFileName(filePath)).toBe('Monet - Impression, Sunrise.jpg');
    expect(commonsFileName('https://example.org/a.jpg')).toBeUndefined();
  });

  it('resolves to the CORS-enabled thumbnail url', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request) =>
      json({
        query: {
          pages: {
            '1': { imageinfo: [{ thumburl: 'https://thumb.wikimedia.org/x/1600px-a.jpg' }] },
          },
        },
      }),
    );
    const url = await resolveCommonsImage(filePath, 1600, { locale: 'de', fetch: fetch as never });
    expect(url).toBe('https://thumb.wikimedia.org/x/1600px-a.jpg');
    expect(String(fetch.mock.calls[0]?.[0])).toContain('iiurlwidth=1600');
    expect(await resolveCommonsImage('https://example.org/a.jpg', 800, { locale: 'de' })).toBe(
      'https://example.org/a.jpg',
    );
  });
});

describe('wikidata search modes', () => {
  it('builds a creator query that matches people', () => {
    const q = buildWikidataQuery('Klimt', 'de', 'creator');
    expect(q).toContain('?creator wdt:P31 wd:Q5');
    expect(q).toContain('?item wdt:P170 ?creator');
  });

  it('merges title and creator results and survives one failing', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      decodeURIComponent(String(url)).includes('wd:Q5') ? json({}, 429) : json(wikidataSearch),
    );
    const results = await wikidataProvider.search('Sternennacht', {
      locale: 'de',
      fetch: fetch as never,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('overpass', () => {
  it('queries a bounding box around the centre', () => {
    const q = buildOverpassQuery(48.2083, 16.3725, 5000);
    expect(q).toContain('[bbox:48.1634,16.3051,48.2532,16.4399]');
  });

  it('takes the first endpoint that answers', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('private.coffee') ? json(overpass) : json({}, 504),
    );
    const pois = await overpassProvider.nearby({ lat: 48.2, lng: 16.37 }, 1000, {
      locale: 'de',
      fetch: fetch as never,
    });
    expect(pois.length).toBeGreaterThan(0);
  });
});

describe('people', () => {
  it('reads years from Wikidata time values', () => {
    expect(wikidataYear({ time: '+1632-10-00T00:00:00Z', precision: 10 })).toBe(1632);
    expect(wikidataYear({ time: '-0469-01-01T00:00:00Z', precision: 9 })).toBe(-469);
    expect(wikidataYear({ time: '+1500-00-00T00:00:00Z', precision: 7 })).toBeUndefined();
    expect(wikidataYear(undefined)).toBeUndefined();
  });

  it('maps humans and skips everything else', () => {
    type Entity = Parameters<typeof mapWikidataPerson>[0];
    const entity = (id: string) =>
      (wikidataPeopleEntities.entities as unknown as Record<string, Entity>)[id]!;
    expect(mapWikidataPerson(entity('Q19912259'), 'de')).toBeUndefined(); // family name
    expect(mapWikidataPerson(entity('Q115955446'), 'de')).toBeUndefined(); // exhibition
    expect(mapWikidataPerson(entity('Q41264'), 'de')).toMatchObject({
      wikidataId: 'Q41264',
      name: 'Jan Vermeer',
      description: 'holländischer Maler (1632–1675)',
      birthYear: 1632,
      deathYear: 1675,
      wikipedia: 'de:Jan Vermeer',
      url: 'https://www.wikidata.org/wiki/Q41264',
    });
    expect(mapWikidataPerson(entity('Q41264'), 'de')?.imageUrl).toMatch(
      /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/.+\?width=600$/,
    );
    // Falls back to the English article when there is none in the UI language.
    expect(mapWikidataPerson(entity('Q944834'), 'de')?.wikipedia).toMatch(/^en:/);
  });

  it('searches, then loads details in search order', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      json(
        String(url).includes('wbsearchentities') ? wikidataPeopleSearch : wikidataPeopleEntities,
      ),
    );
    const results = await wikidataPeopleProvider.search('Vermeer', {
      locale: 'de',
      fetch: fetch as never,
    });
    expect(String(fetch.mock.calls[0]?.[0])).toContain('origin=*');
    expect(results.map((r) => r.wikidataId)).toEqual(['Q41264', 'Q944834', 'Q3159680']);
  });
});

describe('book catalogues', () => {
  it('maps Open Library works with their best matching edition', () => {
    const [zauberberg, second] = mapOpenLibrarySearch(openLibrarySearch);
    expect(zauberberg).toEqual({
      provider: 'openlibrary',
      externalId: 'OL24949364M',
      title: 'Der Zauberberg',
      authors: ['Thomas Mann'],
      isbn: '9783436007911',
      publisher: 'Fischer',
      year: '1967',
      pageCount: 729,
      language: 'de',
      coverUrl: 'https://covers.openlibrary.org/b/id/6953661-L.jpg',
      url: 'https://openlibrary.org/books/OL24949364M',
    });
    // An edition without ISBN or cover still yields a usable result.
    expect(second).toMatchObject({ subtitle: 'Roman', year: '1964' });
    expect(second?.isbn).toBeUndefined();
  });

  it('maps an Open Library edition looked up by ISBN', () => {
    const book = openLibraryIsbn['ISBN:9783596294312'];
    expect(mapOpenLibraryBook('9783596294312', book)).toMatchObject({
      externalId: 'OL18348219M',
      title: 'Buddenbrooks',
      subtitle: 'Verfall einer Familie. Roman',
      authors: ['Thomas Mann'],
      publisher: 'Fischer Taschenbuch',
      year: '1989',
      pageCount: 758,
      coverUrl: 'https://covers.openlibrary.org/b/id/8766431-L.jpg',
    });
  });

  it('reads Dublin Core records of the Deutsche Nationalbibliothek', () => {
    const [current, older] = mapDnb(dnbIsbn);
    expect(current).toEqual({
      provider: 'dnb',
      externalId: '1362379786',
      title: 'Buddenbrooks',
      subtitle: 'Verfall einer Familie. Roman',
      authors: ['Thomas Mann'],
      isbn: '9783596294312',
      publisher: 'Fischer Taschenbuch',
      year: '2025',
      pageCount: 843,
      language: 'de',
      coverUrl: 'https://portal.dnb.de/opac/mvb/cover?isbn=9783596294312',
      url: 'https://d-nb.info/1362379786',
    });
    expect(older).toMatchObject({ year: '1994', pageCount: 758, isbn: '9783596294312' });

    // Translators and authors of afterwords are not authors; foreign records keep their language.
    const results = mapDnb(dnbSearch);
    expect(results.map((r) => r.authors)).toEqual([
      ['Thomas Mann'],
      ['Claudio Steiger'],
      ['Thomas Mann'],
      ['Thomas Mann'],
    ]);
    expect(results[2]).toMatchObject({
      title: 'A montanha mágica',
      language: 'pt',
      pageCount: 926,
    });
    expect(results[1]?.title).toBe('„Fieberhafte Hermetik“');
  });

  it('builds DNB queries that only match printed books', () => {
    expect(buildDnbQuery(' der  "zauberberg" ')).toBe('WOE=der and WOE=zauberberg and mat=books');
  });

  it('maps Google Books volumes with https covers', () => {
    // Built from the documented volume format: anonymous requests no longer get any quota.
    const [book, ...rest] = mapGoogleBooks(googleBooksSearch);
    expect(rest).toEqual([]);
    expect(book).toMatchObject({
      externalId: 'zR9bDwAAQBAJ',
      isbn: '9783596294312',
      year: '2012',
      language: 'de',
      description: expect.stringContaining('Lübecker'),
    });
    expect(book?.coverUrl).toBe(
      'https://books.google.com/books/content?id=zR9bDwAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
    );
  });

  it('offers Google Books only with a key', async () => {
    expect(availableBookProviders().map((p) => p.id)).toEqual(['openlibrary', 'dnb']);
    expect(availableBookProviders({ googlebooks: 'k' }).map((p) => p.id)).toContain('googlebooks');
    expect(providersNeedingKeys().map((p) => p.requiresKey.id)).toContain('googlebooks');
    await expect(googleBooksProvider.search('x', { locale: 'de' })).rejects.toThrow(ProviderError);
  });

  it('merges catalogues field by field and prefers storable covers', () => {
    const dnb = mapDnb(dnbIsbn)[0]!;
    const ol = mapOpenLibraryBook('9783596294312', openLibraryIsbn['ISBN:9783596294312']);
    const merged = mergeBookResults([
      { result: dnb, storableCover: false },
      { result: { ...ol, description: 'Roman' }, storableCover: true },
    ]);
    expect(merged).toMatchObject({
      provider: 'dnb',
      year: '2025',
      language: 'de',
      description: 'Roman',
      coverUrl: 'https://covers.openlibrary.org/b/id/8766431-L.jpg',
    });
    expect(mergeBookResults([])).toBeUndefined();
  });

  it('looks an ISBN up in all catalogues, led by the DNB for German', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('dnb.de') ? xml(dnbIsbn) : json(openLibraryIsbn),
    );
    const book = await lookupIsbn('9783596294312', { locale: 'de', fetch: fetch as never });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(book).toMatchObject({ provider: 'dnb', pageCount: 843, language: 'de' });
    expect(book?.coverUrl).toContain('covers.openlibrary.org');

    const english = await lookupIsbn('9783596294312', { locale: 'en', fetch: fetch as never });
    expect(english).toMatchObject({ provider: 'openlibrary', pageCount: 758, language: 'de' });
  });

  it('returns nothing for unknown ISBNs and fails only when every catalogue fails', async () => {
    const empty = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('dnb.de')
        ? xml('<searchRetrieveResponse><records></records></searchRetrieveResponse>')
        : json({}),
    );
    expect(await lookupIsbn('9780000000002', { locale: 'de', fetch: empty as never })).toBe(
      undefined,
    );
    const down = vi.fn(async () => json({}, 503));
    await expect(
      lookupIsbn('9780000000002', { locale: 'de', fetch: down as never }),
    ).rejects.toThrow(ProviderError);
  });

  it('sends the search to each catalogue', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('dnb.de') ? xml(dnbSearch) : json(openLibrarySearch),
    );
    const ctx = { locale: 'de' as const, fetch: fetch as never };
    expect(await openLibraryProvider.search('zauberberg', ctx)).toHaveLength(3);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('lang=de');
    expect(await dnbProvider.search('zauberberg mann', ctx)).toHaveLength(4);
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get('query')).toBe(
      'WOE=zauberberg and WOE=mann and mat=books',
    );
  });
});

describe('record catalogues', () => {
  it('maps MusicBrainz search results with vinyl pressings first', () => {
    const results = mapMusicBrainzSearch(musicBrainzSearch);
    expect(results[0]).toEqual({
      provider: 'musicbrainz',
      externalId: 'bee5e0cd-1767-4a8e-9578-6455e87ba60b',
      title: 'Kind of Blue',
      artists: ['Miles Davis'],
      label: 'Columbia',
      catalogNumber: 'CS 8163',
      year: 1959,
      country: 'US',
      formatText: '12" Vinyl',
      vinyl: true,
      format: 'lp',
      size: '12',
      discCount: 1,
      coverUrl:
        'https://coverartarchive.org/release/bee5e0cd-1767-4a8e-9578-6455e87ba60b/front-500',
      thumbUrl:
        'https://coverartarchive.org/release/bee5e0cd-1767-4a8e-9578-6455e87ba60b/front-250',
      url: 'https://musicbrainz.org/release/bee5e0cd-1767-4a8e-9578-6455e87ba60b',
    });
    // The SACD that ranked first in the response follows the vinyl.
    expect(results.at(-1)?.vinyl).toBe(false);
    expect(results.find((r) => r.externalId.startsWith('fa731de1'))).toMatchObject({
      format: 'cd',
      barcode: '4547366033267',
    });
  });

  it('maps a release found by barcode with all its discs', () => {
    expect(mapMusicBrainzSearch(musicBrainzBarcode)).toEqual([
      expect.objectContaining({
        label: 'Music on Vinyl',
        catalogNumber: 'MOVLP019',
        barcode: '0886976389413',
        formatText: '2×Vinyl',
        discCount: 2,
        year: 2010,
      }),
    ]);
  });

  it('reads sides, the original year and who played what from a MusicBrainz release', () => {
    const record = mapMusicBrainzDetails(musicBrainzRelease);
    expect(record).toMatchObject({ releaseYear: 1959, genres: ['Jazz', 'Modal jazz'] });
    expect(record.tracks[0]).toEqual({ position: 'A1', title: 'So What', duration: 545 });
    expect(record.tracks.map((t) => t.position)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2']);
    expect(record.credits).toContainEqual({
      name: 'John Coltrane',
      role: 'musician',
      detail: 'tenor saxophone',
    });
    expect(record.credits).toContainEqual({ name: 'Irving Townsend', role: 'producer' });
    expect(record.credits).toContainEqual({
      name: 'Fred Plaut',
      role: 'engineer',
      detail: 'recording',
    });
    // A musician on every track is credited once.
    expect(record.credits.filter((c) => c.name === 'Paul Chambers')).toHaveLength(1);
  });

  it('maps Discogs search results and splits their titles', () => {
    expect(mapDiscogsSearch(discogsSearch)[0]).toMatchObject({
      provider: 'discogs',
      externalId: '2772432',
      title: 'Kind Of Blue',
      artists: ['Miles Davis'],
      catalogNumber: 'CS 8163',
      country: 'France',
      year: 2010,
      vinyl: true,
      format: 'lp',
      channels: 'stereo',
      genres: ['Jazz', 'Modal'],
    });
  });

  it('reads tracks, credits, variant and matrix from a Discogs release', () => {
    const record = mapDiscogsRelease(discogsRelease, 1959);
    expect(record).toMatchObject({
      releaseYear: 1959,
      year: 2010,
      variant: '180 gram',
      matrix: 'XSM 47326',
    });
    expect(record.coverUrl).toMatch(/^https:\/\/i\.discogs\.com\//);
    expect(record.tracks[1]).toEqual({
      position: 'A2',
      title: 'Freddie Freeloader',
      duration: 572,
    });
    // Disambiguation numbers go, songwriting credits are left out.
    expect(record.credits).toContainEqual({
      name: 'Paul Chambers',
      role: 'musician',
      detail: 'bass',
    });
    expect(record.credits.some((c) => c.name === 'Miles Davis' && c.role === 'other')).toBe(false);
    expect(record.credits.filter((c) => c.name === 'Miles Davis').map((c) => c.detail)).toEqual([
      'trumpet',
    ]);
  });

  it('reads the carrier and credit roles in the words catalogues use', () => {
    expect(carrierFrom(['Vinyl', '7"', 'Single', '45 RPM', 'Mono'])).toEqual({
      vinyl: true,
      format: 'single',
      size: '7',
      speed: '45',
      channels: 'mono',
    });
    expect(carrierFrom(['Shellac', '10"', '78 RPM'])).toMatchObject({
      format: 'shellac',
      speed: '78',
    });
    expect(carrierFrom(['CD'])).toMatchObject({ vinyl: false, format: 'cd' });
    expect(creditRoleFrom('Design [Cover]')).toEqual({ role: 'design', detail: 'Cover' });
    expect(creditRoleFrom('Photography By')).toEqual({ role: 'photography' });
    expect(creditRoleFrom('design/illustration')).toMatchObject({ role: 'design' });
    expect(creditRoleFrom('Artwork By')).toMatchObject({ role: 'artwork' });
    expect(creditRoleFrom('Lacquer Cut By')).toMatchObject({ role: 'engineer' });
    expect(creditRoleFrom('Written-By')).toBeUndefined();
    expect(creditRoleFrom('instrument', ['additional', 'piano'])).toEqual({
      role: 'musician',
      detail: 'piano',
    });
  });

  it('sends the Discogs token as a parameter and only offers Discogs with one', async () => {
    expect(availableRecordProviders().map((p) => p.id)).toEqual(['musicbrainz']);
    expect(availableRecordProviders({ discogs: 'abc' }).map((p) => p.id)).toEqual([
      'musicbrainz',
      'discogs',
    ]);
    const fetch = vi.fn(async () => json(discogsSearch));
    await discogsProvider.byBarcode('036000291452', {
      locale: 'de',
      keys: { discogs: 'abc' },
      fetch,
    });
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('barcode')).toBe('036000291452');
    expect(url.searchParams.get('token')).toBe('abc');
  });

  it('looks a barcode up in both spellings and keeps going when one catalogue fails', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('musicbrainz')
        ? json(musicBrainzBarcode)
        : json({ message: 'down' }, 500),
    );
    const results = await lookupRecordBarcode('886976389413', {
      locale: 'de',
      keys: { discogs: 'abc' },
      fetch,
    });
    expect(results.map((r) => r.catalogNumber)).toEqual(['MOVLP019']);
    const mbUrl = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(mbUrl.searchParams.get('query')).toBe('barcode:886976389413 OR barcode:0886976389413');
    expect(musicBrainzProvider.storableCovers).toBeUndefined();
    expect(discogsProvider.storableCovers).toBe(false);
  });
});
