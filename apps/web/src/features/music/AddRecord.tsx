import { normalizeBarcode, productCodeFromBarcode, sameBarcode } from '@mnemo/core';
import {
  availableRecordProviders,
  lookupRecordBarcode,
  type RecordDetails,
  type RecordSearchResult,
  recordProviders,
} from '@mnemo/providers';
import { Button, Chip, Dialog, DialogContent, Input, Spinner } from '@mnemo/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BarcodeIcon, DiscIcon, ScanBarcodeIcon, SearchIcon } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProviderContext, useRecords } from '../../app/data';
import type { DialogProps } from '../../app/dialogs';
import { useDialogs } from '../../app/dialogs';
import { BarcodeScanner } from '../../components/BarcodeScanner';
import { ErrorNote } from '../../components/bits';
import { RecordSleeve } from '../../components/RecordSleeve';
import { useDebounced } from '../../lib/hooks';
import type { RecordPrefill } from './RecordForm';

/** What the form needs from a catalogue entry; the pressing year only when it is a reissue. */
export function prefillFrom(result: RecordSearchResult | RecordDetails): RecordPrefill {
  const details = 'tracks' in result ? result : undefined;
  const releaseYear = details?.releaseYear ?? result.year;
  return {
    title: result.title,
    artists: result.artists,
    label: result.label,
    catalogNumber: result.catalogNumber,
    barcode: result.barcode,
    releaseYear,
    pressingYear: result.year !== releaseYear ? result.year : undefined,
    country: result.country,
    format: result.format,
    size: result.size,
    speed: result.speed,
    discCount: result.discCount,
    channels: result.channels,
    genres: result.genres,
    tracks: details?.tracks,
    credits: details?.credits,
    variant: details?.variant,
    matrix: details?.matrix,
    coverUrl: result.coverUrl,
    source: { provider: result.provider, externalId: result.externalId, url: result.url },
    musicbrainzId: result.provider === 'musicbrainz' ? result.externalId : undefined,
    discogsId: result.provider === 'discogs' ? result.externalId : undefined,
  };
}

/**
 * One field for everything: a barcode is looked up in every catalogue, anything else searches
 * them. Vinyl comes first; the same album on CD or as a download is one click away. Picking a
 * pressing loads its sides and credits and opens the form, so everything can be checked first.
 */
export function AddRecordDialog({ spec, onClose }: DialogProps<'addRecord'>) {
  const { t } = useTranslation();
  const dialogs = useDialogs();
  const ctx = useProviderContext();
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(spec.scan ?? false);
  const [vinylOnly, setVinylOnly] = useState(true);
  const [loading, setLoading] = useState<string>();
  const input = useDebounced(text.trim(), 400);
  const barcode = normalizeBarcode(input);
  const providers = useMemo(() => availableRecordProviders(ctx.keys), [ctx.keys]);

  const lookup = useQuery({
    queryKey: ['record-barcode', barcode, Object.keys(ctx.keys ?? {})],
    queryFn: ({ signal }) => lookupRecordBarcode(barcode!, { ...ctx, signal }),
    enabled: Boolean(barcode),
    staleTime: 24 * 60 * 60_000,
    retry: 0,
  });

  const searches = useQueries({
    queries: providers.map((p) => ({
      queryKey: ['record-search', p.id, input],
      queryFn: ({ signal }: { signal: AbortSignal }) => p.search(input, { ...ctx, signal }),
      enabled: !barcode && input.length >= 3,
      staleTime: 60 * 60_000,
      retry: 0,
    })),
  });

  // Round-robin across catalogues, so each contributes its best matches near the top.
  const found = useMemo(() => {
    if (barcode) return lookup.data ?? [];
    const lists = searches.map((s) => s.data ?? []);
    const out: RecordSearchResult[] = [];
    for (let row = 0; lists.some((l) => row < l.length); row++) {
      for (const list of lists) if (list[row]) out.push(list[row]!);
    }
    return out;
  }, [barcode, lookup.data, searches]);
  const vinyl = found.filter((r) => r.vinyl);
  const shown = vinylOnly && vinyl.length > 0 ? vinyl : found;
  const hidden = found.length - shown.length;

  const pick = async (result: RecordSearchResult) => {
    const provider = recordProviders.find((p) => p.id === result.provider);
    setLoading(`${result.provider}:${result.externalId}`);
    let prefill = prefillFrom(result);
    try {
      if (provider) prefill = prefillFrom(await provider.details(result.externalId, ctx));
    } catch {
      toast.warning(t('record.add.detailsFailed'));
    } finally {
      setLoading(undefined);
    }
    dialogs.open({ type: 'record', prefill: { ...prefill, ownership: spec.ownership } });
  };

  const searching = !barcode && input.length >= 3;
  const fetching = lookup.isFetching || searches.some((s) => s.isFetching);
  const failed = barcode
    ? lookup.isError
    : searching && searches.length > 0 && searches.every((s) => s.isError);

  let body: ReactNode = <p className="caption text-ink-3">{t('record.add.hint')}</p>;
  if (failed) {
    body = (
      <ErrorNote
        onRetry={() =>
          barcode ? void lookup.refetch() : searches.forEach((s) => void s.refetch())
        }
      >
        {t('record.add.failed')}
      </ErrorNote>
    );
  } else if (barcode || searching) {
    body =
      shown.length > 0 ? (
        <div>
          {barcode && <p className="eyebrow mb-2 text-accent">{t('record.add.barcodeFound')}</p>}
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <ResultRow
                key={`${r.provider}:${r.externalId}`}
                result={r}
                loading={loading === `${r.provider}:${r.externalId}`}
                disabled={loading !== undefined}
                onPick={pick}
              />
            ))}
          </ul>
          {(hidden > 0 || (!vinylOnly && vinyl.length > 0 && vinyl.length < found.length)) && (
            <div className="mt-4 flex justify-center">
              <Chip active={!vinylOnly} onClick={() => setVinylOnly(!vinylOnly)}>
                {vinylOnly
                  ? t('record.add.showOther', { count: hidden })
                  : t('record.add.vinylOnly')}
              </Chip>
            </div>
          )}
        </div>
      ) : fetching ? null : (
        <p className="caption text-ink-3">
          {barcode ? t('record.add.barcodeUnknown') : t('record.add.noResults')}
        </p>
      );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        eyebrow={t('record.add.eyebrow')}
        title={t('record.add.title')}
        footer={
          <>
            <span className="mr-auto text-xs text-ink-3">
              {t('record.add.searched', { names: providers.map((p) => p.name).join(', ') })}
            </span>
            <Button
              variant="outline"
              onClick={() =>
                dialogs.open({
                  type: 'record',
                  prefill: {
                    ...(barcode ? { barcode } : input ? { title: input } : {}),
                    ownership: spec.ownership,
                  },
                })
              }
            >
              {t('record.add.manual')}
            </Button>
          </>
        }
      >
        {scanning && (
          <div className="mb-5">
            <BarcodeScanner
              read={productCodeFromBarcode}
              hint={t('record.scan.hint')}
              fallback={t('record.scan.typeInstead')}
              onDetect={(code) => {
                setText(code);
                setScanning(false);
              }}
              onCancel={() => setScanning(false)}
            />
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              autoFocus={!scanning}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('record.add.placeholder')}
              aria-label={t('record.add.placeholder')}
              className="h-12 rounded-full pr-12 pl-10 text-base [&::-webkit-search-cancel-button]:hidden"
            />
            {barcode ? (
              <BarcodeIcon className="absolute top-1/2 right-4 size-4 -translate-y-1/2 text-accent" />
            ) : fetching ? (
              <Spinner className="absolute top-1/2 right-4 size-4 -translate-y-1/2" />
            ) : null}
          </div>
          <Button
            variant={scanning ? 'accent' : 'outline'}
            size="icon"
            aria-pressed={scanning}
            aria-label={t('record.scan.button')}
            title={t('record.scan.button')}
            onClick={() => setScanning(!scanning)}
            className="size-12 shrink-0 rounded-full"
          >
            <ScanBarcodeIcon />
          </Button>
        </div>
        <div className="mt-6 min-h-24">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({
  result,
  loading,
  disabled,
  onPick,
}: {
  result: RecordSearchResult;
  loading: boolean;
  disabled: boolean;
  onPick: (result: RecordSearchResult) => void;
}) {
  const { t } = useTranslation();
  const dialogs = useDialogs();
  const records = useRecords();
  const owned = records?.find(
    (r) =>
      (result.provider === 'musicbrainz' && r.musicbrainzId === result.externalId) ||
      (result.provider === 'discogs' && r.discogsId === result.externalId) ||
      (!!result.barcode && !!r.barcode && sameBarcode(r.barcode, result.barcode)),
  );
  const sleeve = {
    id: result.externalId,
    title: result.title,
    artists: result.artists,
    label: result.label,
    mediaIds: [],
    palette: [],
  };
  const pressing = [result.year, result.country, result.formatText].filter(Boolean).join(' · ');
  return (
    <li className="flex items-center gap-4 py-3">
      <RecordSleeve
        record={sleeve}
        src={result.thumbUrl ?? result.coverUrl}
        className="w-14 shrink-0 shadow-soft"
      />
      <div className="min-w-0 flex-1">
        <p className="caption truncate text-lg leading-snug">{result.title}</p>
        <p className="truncate text-sm text-ink-2">{result.artists.join(', ')}</p>
        <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-3">
          {result.vinyl && <DiscIcon className="size-3 shrink-0 text-accent" />}
          <span className="truncate">{pressing}</span>
        </p>
        {(result.label || result.catalogNumber) && (
          <p className="truncate text-xs text-ink-3">
            {result.label}
            {result.catalogNumber && (
              <span className="ml-2 font-mono text-[0.65rem] tracking-wide">
                {result.catalogNumber}
              </span>
            )}
          </p>
        )}
      </div>
      {owned ? (
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[0.6875rem] text-ink-3">{t('record.add.owned')}</span>
          <Button asChild variant="ghost" size="sm">
            <Link to="/record/$recordId" params={{ recordId: owned.id }} onClick={dialogs.close}>
              {t('record.add.open')}
            </Link>
          </Button>
        </span>
      ) : (
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => void onPick(result)}>
          {loading && <Spinner className="size-3.5" />}
          {t('record.add.pick')}
        </Button>
      )}
    </li>
  );
}
