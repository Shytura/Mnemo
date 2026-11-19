import {
  type Credit,
  type CreditRole,
  collectionHas,
  creditRoles,
  formatTracklist,
  type MusicRecord,
  normalizeBarcode,
  parseTracklist,
  type RecordDraft,
  type RecordFormat,
  type RecordGrade,
  type RecordOwnership,
  type RecordSize,
  type RecordSpeed,
  recordFormats,
  recordGrades,
  recordSizes,
  recordSpeeds,
  saveRecord,
  setCollectionsOf,
} from '@mnemo/core';
import {
  Button,
  Chip,
  cn,
  Dialog,
  DialogContent,
  Field,
  ImageDropzone,
  Input,
  Label,
  Segmented,
  Select,
  Spinner,
  Switch,
  Textarea,
} from '@mnemo/ui';
import { useNavigate } from '@tanstack/react-router';
import { PlusIcon, XIcon } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  useCollections,
  useCreators,
  useLookups,
  useRecord,
  useTrips,
  useVenues,
} from '../../app/data';
import type { DialogProps } from '../../app/dialogs';
import { useStore } from '../../app/store';
import { RecordSleeve, VinylDisc } from '../../components/RecordSleeve';
import {
  type ProcessedImage,
  processImage,
  saveProcessedImage,
  saveRemoteImage,
} from '../../lib/media';
import { gradeKey } from './grades';

/** What a catalogue or the scanner hands to the form. */
export type RecordPrefill = Partial<RecordDraft> & { coverUrl?: string };

export function RecordFormDialog({ spec, onClose }: DialogProps<'record'>) {
  const existing = useRecord(spec.recordId ?? '');
  if (spec.recordId && existing.data === undefined) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <RecordForm spec={spec} record={existing.data ?? undefined} onClose={onClose} />
    </Dialog>
  );
}

/** Pressings come in more colours than these; the picker covers the rest. */
const VINYL_COLOURS = [
  '#a8261d',
  '#d9682b',
  '#e2b53b',
  '#2f6b4a',
  '#1f4f8f',
  '#5b3a7a',
  '#d77a9a',
  '#d8d2c4',
  '#5a5550',
];

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'SEK', 'DKK', 'NOK', 'PLN', 'CZK'];

const yearOrUndefined = (text: string) => {
  const n = Number(text.trim());
  return text.trim() && Number.isInteger(n) && n > 1800 && n < 2200 ? n : undefined;
};

function RecordForm({
  spec,
  record,
  onClose,
}: DialogProps<'record'> & { record: MusicRecord | undefined }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const collections = useCollections();
  const creators = useCreators();
  const venues = useVenues();
  const trips = useTrips();
  const lookups = useLookups();
  const prefill: RecordPrefill = spec.prefill ?? {};
  const base = record ?? prefill;

  const [title, setTitle] = useState(base.title ?? '');
  const [artists, setArtists] = useState<string[]>(base.artists ?? []);
  const [artistDraft, setArtistDraft] = useState('');
  const [label, setLabel] = useState(base.label ?? '');
  const [catalogNumber, setCatalogNumber] = useState(base.catalogNumber ?? '');
  const [barcode, setBarcode] = useState(base.barcode ?? '');
  const [releaseYear, setReleaseYear] = useState(String(base.releaseYear ?? ''));
  const [pressingYear, setPressingYear] = useState(String(base.pressingYear ?? ''));
  const [country, setCountry] = useState(base.country ?? '');
  const [format, setFormat] = useState<RecordFormat>(base.format ?? 'lp');
  const [size, setSize] = useState<RecordSize | ''>(base.size ?? '');
  const [speed, setSpeed] = useState<RecordSpeed | ''>(base.speed ?? '');
  const [discCount, setDiscCount] = useState(String(base.discCount ?? 1));
  const [channels, setChannels] = useState<'mono' | 'stereo' | ''>(base.channels ?? '');
  const [variant, setVariant] = useState(base.variant ?? '');
  const [vinylColor, setVinylColor] = useState<string | undefined>(base.vinylColor);
  const [firstPressing, setFirstPressing] = useState(base.firstPressing ?? false);
  const [signed, setSigned] = useState(base.signed ?? false);
  const [matrix, setMatrix] = useState(base.matrix ?? '');
  const [conditionMedia, setConditionMedia] = useState<RecordGrade | ''>(
    record?.conditionMedia ?? '',
  );
  const [conditionSleeve, setConditionSleeve] = useState<RecordGrade | ''>(
    record?.conditionSleeve ?? '',
  );
  const [genres, setGenres] = useState<string[]>(base.genres ?? []);
  const [genreDraft, setGenreDraft] = useState('');
  const [tracklist, setTracklist] = useState(formatTracklist(base.tracks ?? []));
  const [credits, setCredits] = useState<Credit[]>(base.credits ?? []);
  const [description, setDescription] = useState(base.description ?? '');
  const [ownership, setOwnership] = useState<RecordOwnership>(
    record?.ownership ?? prefill.ownership ?? 'owned',
  );
  const a = record?.acquisition;
  const [boughtOn, setBoughtOn] = useState(a?.date ?? '');
  const [price, setPrice] = useState(a?.price !== undefined ? String(a.price) : '');
  const [currency, setCurrency] = useState(a?.currency ?? 'EUR');
  const [from, setFrom] = useState(a?.from ?? '');
  const [gift, setGift] = useState(a?.gift ?? false);
  const [venueId, setVenueId] = useState(a?.venueId ?? '');
  const [tripId, setTripId] = useState(a?.tripId ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [tags, setTags] = useState<string[]>(record?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [favorite, setFavorite] = useState(record?.favorite ?? false);
  const [collectionIds, setCollectionIds] = useState<Set<string>>(
    () =>
      new Set(
        (collections ?? [])
          .filter((c) => record && collectionHas(c, { kind: 'record', id: record.id }))
          .map((c) => c.id),
      ),
  );
  const [coverId, setCoverId] = useState(record?.mediaIds[0]);
  const [remoteCover, setRemoteCover] = useState(prefill.coverUrl);
  const [upload, setUpload] = useState<{
    previewUrl: string;
    job: Promise<ProcessedImage | null>;
  }>();
  const [saving, setSaving] = useState(false);
  const previewUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const barcodeValid = !barcode.trim() || normalizeBarcode(barcode) !== undefined;
  const tracks = useMemo(() => parseTracklist(tracklist), [tracklist]);
  const shops = (venues ?? []).filter((v) => v.kind === 'recordShop' || v.id === venueId);

  const addCover = ([file]: File[]) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    previewUrls.current.push(previewUrl);
    setUpload({ previewUrl, job: processImage(file).catch(() => null) });
    setRemoteCover(undefined);
  };

  const addFrom = (
    draft: string,
    list: string[],
    set: (next: string[]) => void,
    clear: () => void,
  ) => {
    const value = draft.trim().replace(/^#/, '');
    if (value && !list.includes(value)) set([...list, value]);
    clear();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !barcodeValid) return;
    setSaving(true);
    try {
      const pendingArtist = artistDraft.trim();
      const allArtists =
        pendingArtist && !artists.includes(pendingArtist) ? [...artists, pendingArtist] : artists;

      let mediaIds = coverId ? [coverId] : [];
      const processed = upload ? await upload.job : null;
      if (processed) {
        mediaIds = [(await saveProcessedImage(store, processed, { alt: title.trim() })).id];
      } else if (!coverId && remoteCover) {
        mediaIds = [(await saveRemoteImage(store, remoteCover, title.trim())).id];
      }
      const cover = mediaIds[0] ? await store.media.get(mediaIds[0]) : undefined;
      const priceValue = Number(price.replace(',', '.'));
      const acquisition = {
        date: boughtOn || undefined,
        price: price.trim() && Number.isFinite(priceValue) ? priceValue : undefined,
        currency: price.trim() ? currency : undefined,
        from: from.trim() || undefined,
        gift,
        venueId: venueId || undefined,
        tripId: tripId || undefined,
      };
      const hasAcquisition = Object.entries(acquisition).some(
        ([key, value]) => key !== 'currency' && value !== undefined && value !== false,
      );

      const draft: RecordDraft = {
        title: title.trim(),
        artists: allArtists,
        credits: credits.filter((c) => c.name.trim()),
        label: label.trim() || undefined,
        catalogNumber: catalogNumber.trim() || undefined,
        barcode: barcode.trim() || undefined,
        releaseYear: yearOrUndefined(releaseYear),
        pressingYear: yearOrUndefined(pressingYear),
        country: country.trim() || undefined,
        format,
        size: size || undefined,
        speed: speed || undefined,
        discCount: Math.max(1, Number(discCount) || 1),
        channels: channels || undefined,
        variant: variant.trim() || undefined,
        vinylColor,
        firstPressing,
        signed,
        matrix: matrix.trim() || undefined,
        conditionMedia: conditionMedia || undefined,
        conditionSleeve: conditionSleeve || undefined,
        genres,
        tracks,
        description: description.trim() || undefined,
        ownership,
        acquisition: hasAcquisition ? acquisition : undefined,
        notes,
        tags,
        favorite,
        mediaIds,
        palette: cover?.palette ?? [],
        ...(record
          ? {}
          : {
              source: prefill.source,
              musicbrainzId: prefill.musicbrainzId,
              discogsId: prefill.discogsId,
            }),
      };
      const saved = await saveRecord(store, draft, record?.id);

      const replaced = record?.mediaIds.filter((id) => !mediaIds.includes(id)) ?? [];
      for (const id of replaced) await store.media.delete(id);
      await setCollectionsOf(store, { kind: 'record', id: saved.id }, collectionIds);

      onClose();
      toast.success(record ? t('record.updated') : t('record.created', { title: saved.title }), {
        description: cover && !cover.hasBlob ? t('discover.remoteOnly') : undefined,
        action: record
          ? undefined
          : {
              label: t('common.view'),
              onClick: () =>
                void navigate({ to: '/record/$recordId', params: { recordId: saved.id } }),
            },
      });
    } catch (error) {
      toast.error(t('common.saveFailed'), { description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const preview = {
    id: record?.id ?? 'new',
    title: title || '…',
    artists,
    label: label || undefined,
    mediaIds: coverId ? [coverId] : [],
    palette: record?.palette ?? [],
    vinylColor,
  };

  return (
    <DialogContent
      size="xl"
      eyebrow={
        record
          ? t('record.form.editEyebrow')
          : prefill.source
            ? t('record.form.fromCatalogue')
            : t('record.form.newEyebrow')
      }
      title={record ? record.title : t('record.form.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="record-form"
            disabled={saving || !title.trim() || !barcodeValid}
          >
            {saving ? <Spinner className="size-4 border-paper/40 border-t-paper" /> : null}
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id="record-form"
        onSubmit={submit}
        className="grid gap-8 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
      >
        <section className="space-y-5">
          <div className="group relative mx-auto w-48 md:w-full">
            <div className="relative w-[82%]">
              <VinylDisc
                record={preview}
                className="absolute inset-[3%] translate-x-[24%] transition-colors"
              />
              {upload ? (
                <img
                  src={upload.previewUrl}
                  alt=""
                  className="relative aspect-square w-full rounded-[2px] object-cover shadow-frame"
                />
              ) : (
                <RecordSleeve record={preview} src={remoteCover} className="shadow-frame" />
              )}
              {(upload || coverId || remoteCover) && (
                <button
                  type="button"
                  onClick={() => {
                    setUpload(undefined);
                    setCoverId(undefined);
                    setRemoteCover(undefined);
                  }}
                  aria-label={t('common.remove')}
                  className="absolute top-2 right-2 grid size-7 cursor-pointer place-items-center rounded-full bg-surface/90 text-ink opacity-0 shadow-soft transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          </div>
          <ImageDropzone
            onFiles={addCover}
            label={t('record.form.coverDrop')}
            hint={t('record.form.coverHint')}
            className="py-6"
          />
          <div className="space-y-2">
            <Label>{t('record.fields.vinylColor')}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <ColourDot
                colour="#121110"
                active={!vinylColor}
                label={t('record.form.black')}
                onClick={() => setVinylColor(undefined)}
              />
              {VINYL_COLOURS.map((c) => (
                <ColourDot
                  key={c}
                  colour={c}
                  active={vinylColor === c}
                  label={c}
                  onClick={() => setVinylColor(c)}
                />
              ))}
              <label
                className="relative grid size-7 cursor-pointer place-items-center rounded-full border border-dashed border-line-strong text-ink-3 hover:text-ink"
                title={t('record.form.otherColour')}
              >
                <PlusIcon className="size-3.5" />
                <input
                  type="color"
                  value={vinylColor ?? '#121110'}
                  onChange={(e) => setVinylColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label={t('record.form.otherColour')}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="min-w-0 space-y-5">
          <Segmented
            aria-label={t('record.fields.ownership')}
            value={ownership}
            onChange={setOwnership}
            options={(['owned', 'wishlist', 'sold'] as const).map((o) => ({
              value: o,
              label: t(`record.ownership.${o}`),
            }))}
          />

          <Field label={t('record.fields.title')}>
            {(id) => (
              <Input
                id={id}
                required
                autoFocus={!prefill.title}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-12 font-display text-lg italic"
              />
            )}
          </Field>

          <div className="space-y-2">
            <Label htmlFor="record-artist">{t('record.fields.artists')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {artists.map((name) => (
                <Chip
                  key={name}
                  active
                  onClick={() => setArtists(artists.filter((x) => x !== name))}
                >
                  {name} <XIcon className="size-3" />
                </Chip>
              ))}
              <Input
                id="record-artist"
                list="record-creator-names"
                value={artistDraft}
                placeholder={t('record.form.artistPlaceholder')}
                onChange={(e) => setArtistDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addFrom(artistDraft, artists, setArtists, () => setArtistDraft(''));
                  }
                }}
                onBlur={() => addFrom(artistDraft, artists, setArtists, () => setArtistDraft(''))}
                className="h-9 w-56 max-w-full"
              />
              <datalist id="record-creator-names">
                {creators?.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('record.fields.label')}>
              {(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} />}
            </Field>
            <Field label={t('record.fields.catalogNumber')}>
              {(id) => (
                <Input
                  id={id}
                  value={catalogNumber}
                  onChange={(e) => setCatalogNumber(e.target.value)}
                  className="font-mono tracking-wide"
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label={t('record.fields.releaseYear')}>
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
            <Field label={t('record.fields.pressingYear')}>
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={pressingYear}
                  onChange={(e) => setPressingYear(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
            <Field label={t('record.fields.country')}>
              {(id) => (
                <Input id={id} value={country} onChange={(e) => setCountry(e.target.value)} />
              )}
            </Field>
            <Field
              label={t('record.fields.barcode')}
              error={barcodeValid ? undefined : t('record.form.barcodeInvalid')}
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="font-mono tracking-wide"
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label={t('record.fields.format')}>
              {(id) => (
                <Select
                  id={id}
                  value={format}
                  onChange={(e) => setFormat(e.target.value as RecordFormat)}
                >
                  {recordFormats.map((f) => (
                    <option key={f} value={f}>
                      {t(`record.formats.${f}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('record.fields.size')}>
              {(id) => (
                <Select
                  id={id}
                  value={size}
                  onChange={(e) => setSize(e.target.value as RecordSize | '')}
                >
                  <option value="">—</option>
                  {recordSizes.map((s) => (
                    <option key={s} value={s}>
                      {s}″
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('record.fields.speed')}>
              {(id) => (
                <Select
                  id={id}
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value as RecordSpeed | '')}
                >
                  <option value="">—</option>
                  {recordSpeeds.map((s) => (
                    <option key={s} value={s}>
                      {t(`record.speeds.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('record.fields.discCount')}>
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={discCount}
                  onChange={(e) => setDiscCount(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
            <Field label={t('record.fields.channels')}>
              {(id) => (
                <Select
                  id={id}
                  value={channels}
                  onChange={(e) => setChannels(e.target.value as 'mono' | 'stereo' | '')}
                >
                  <option value="">—</option>
                  <option value="stereo">{t('record.channels.stereo')}</option>
                  <option value="mono">{t('record.channels.mono')}</option>
                </Select>
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('record.fields.variant')} hint={t('record.form.variantHint')}>
              {(id) => (
                <Input id={id} value={variant} onChange={(e) => setVariant(e.target.value)} />
              )}
            </Field>
            <Field label={t('record.fields.matrix')}>
              {(id) => (
                <Input
                  id={id}
                  value={matrix}
                  onChange={(e) => setMatrix(e.target.value)}
                  className="font-mono text-xs tracking-wide"
                />
              )}
            </Field>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <SwitchRow
              id="record-first-pressing"
              label={t('record.firstPressing')}
              checked={firstPressing}
              onChange={setFirstPressing}
            />
            <SwitchRow
              id="record-signed"
              label={t('record.signed')}
              checked={signed}
              onChange={setSigned}
            />
          </div>

          {ownership !== 'wishlist' && (
            <div className="grid grid-cols-2 gap-4">
              <GradeSelect
                label={t('record.conditionMedia')}
                value={conditionMedia}
                onChange={setConditionMedia}
              />
              <GradeSelect
                label={t('record.conditionSleeve')}
                value={conditionSleeve}
                onChange={setConditionSleeve}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="record-genre">{t('record.fields.genres')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {genres.map((g) => (
                <Chip key={g} active onClick={() => setGenres(genres.filter((x) => x !== g))}>
                  {g} <XIcon className="size-3" />
                </Chip>
              ))}
              <Input
                id="record-genre"
                value={genreDraft}
                placeholder={t('record.form.genrePlaceholder')}
                onChange={(e) => setGenreDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addFrom(genreDraft, genres, setGenres, () => setGenreDraft(''));
                  }
                }}
                onBlur={() => addFrom(genreDraft, genres, setGenres, () => setGenreDraft(''))}
                className="h-8 w-40 rounded-full text-xs"
              />
            </div>
          </div>

          <Field
            label={t('record.tracklist')}
            hint={
              tracks.length > 0
                ? t('record.form.tracksRead', { count: tracks.length })
                : t('record.form.tracklistHint')
            }
          >
            {(id) => (
              <Textarea
                id={id}
                value={tracklist}
                placeholder={'A1  So What  9:22\nA2  Freddie Freeloader  9:46\nB1  …'}
                onChange={(e) => setTracklist(e.target.value)}
                className="min-h-32 font-mono text-xs leading-relaxed"
              />
            )}
          </Field>

          <CreditsEditor credits={credits} onChange={setCredits} />

          {ownership !== 'wishlist' && (
            <fieldset className="space-y-4 border-t border-line pt-5">
              <legend className="eyebrow pt-5 text-ink-3">{t('record.provenance.title')}</legend>
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                <Field label={gift ? t('record.form.receivedOn') : t('record.form.boughtOn')}>
                  {(id) => (
                    <Input
                      id={id}
                      type="date"
                      value={boughtOn}
                      onChange={(e) => setBoughtOn(e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('record.form.price')}>
                  {(id) => (
                    <div className="flex gap-2">
                      <Input
                        id={id}
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))}
                        className="tabular-nums"
                      />
                      <Select
                        aria-label={t('record.form.currency')}
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-24"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </Field>
                <div className="flex items-end pb-2">
                  <SwitchRow
                    id="record-gift"
                    label={t('record.form.gift')}
                    checked={gift}
                    onChange={setGift}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={gift ? t('record.form.giftFrom') : t('record.form.from')}>
                  {(id) => (
                    <Input
                      id={id}
                      value={from}
                      placeholder={gift ? '' : t('record.form.fromPlaceholder')}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  )}
                </Field>
                {shops.length > 0 && (
                  <Field label={t('record.form.shop')} hint={t('record.form.shopHint')}>
                    {(id) => (
                      <Select id={id} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                        <option value="">—</option>
                        {shops.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {lookups.placeOfVenue(v.id) && `, ${lookups.placeOfVenue(v.id)?.name}`}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
                {(trips?.length ?? 0) > 0 && (
                  <Field label={t('record.form.trip')}>
                    {(id) => (
                      <Select id={id} value={tripId} onChange={(e) => setTripId(e.target.value)}>
                        <option value="">—</option>
                        {trips?.map((trip) => (
                          <option key={trip.id} value={trip.id}>
                            {trip.title}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
              </div>
            </fieldset>
          )}

          {(description || prefill.description) && (
            <Field label={t('record.fields.description')}>
              {(id) => (
                <Textarea
                  id={id}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-sm"
                />
              )}
            </Field>
          )}
          <Field label={t('record.fields.notes')}>
            {(id) => (
              <Textarea
                id={id}
                value={notes}
                placeholder={t('record.form.notesPlaceholder')}
                onChange={(e) => setNotes(e.target.value)}
                className="font-display text-base"
              />
            )}
          </Field>

          <div className="space-y-2">
            <Label htmlFor="record-tag">{t('record.fields.tags')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => (
                <Chip key={tag} active onClick={() => setTags(tags.filter((x) => x !== tag))}>
                  #{tag} <XIcon className="size-3" />
                </Chip>
              ))}
              <Input
                id="record-tag"
                value={tagDraft}
                placeholder={t('book.form.tagPlaceholder')}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addFrom(tagDraft, tags, setTags, () => setTagDraft(''));
                  }
                }}
                onBlur={() => addFrom(tagDraft, tags, setTags, () => setTagDraft(''))}
                className="h-8 w-40 rounded-full text-xs"
              />
            </div>
          </div>

          {(collections?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>{t('record.fields.collections')}</Label>
              <div className="flex flex-wrap gap-2">
                {collections?.map((c) => (
                  <Chip
                    key={c.id}
                    active={collectionIds.has(c.id)}
                    onClick={() =>
                      setCollectionIds((set) => {
                        const next = new Set(set);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  >
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <label
            htmlFor="record-favorite"
            className="flex cursor-pointer items-center justify-between gap-4 border-t border-line pt-5"
          >
            <span>
              <span className="block text-sm font-medium">{t('record.favorite')}</span>
              <span className="block text-xs text-ink-3">{t('record.form.favoriteHint')}</span>
            </span>
            <Switch id="record-favorite" checked={favorite} onCheckedChange={setFavorite} />
          </label>
        </section>
      </form>
    </DialogContent>
  );
}

function ColourDot({
  colour,
  active,
  label,
  onClick,
}: {
  colour: string;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        'size-7 cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] transition-transform hover:scale-110',
        active && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
      )}
      style={{
        background: `radial-gradient(circle, ${colour} 0 22%, color-mix(in oklab, ${colour} 80%, black) 23% 25%, ${colour} 26%)`,
      }}
    >
      <span className="sr-only">{label}</span>
    </button>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 text-sm">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

function GradeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RecordGrade | '';
  onChange: (grade: RecordGrade | '') => void;
}) {
  const { t } = useTranslation();
  return (
    <Field label={label}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value as RecordGrade)}>
          <option value="">—</option>
          {recordGrades.map((g) => (
            <option key={g} value={g}>
              {g} – {t(`record.grades.${gradeKey(g)}`)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** One row per credited person: name, what they did and an optional detail. */
function CreditsEditor({
  credits,
  onChange,
}: {
  credits: Credit[];
  onChange: (credits: Credit[]) => void;
}) {
  const { t } = useTranslation();
  const update = (index: number, patch: Partial<Credit>) =>
    onChange(credits.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      <Label>{t('record.credits')}</Label>
      <p className="text-xs text-ink-3">{t('record.form.creditsHint')}</p>
      {credits.map((credit, i) => (
        <div
          // Credits have no id; rows are edited in place and only removed explicitly.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          className="grid grid-cols-[minmax(0,1fr)_9rem_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,8rem)_auto]"
        >
          <Input
            aria-label={t('record.form.creditName')}
            list="record-creator-names"
            value={credit.name}
            placeholder={t('record.form.creditName')}
            onChange={(e) => update(i, { name: e.target.value })}
            className="h-9"
          />
          <Select
            aria-label={t('record.form.creditRole')}
            value={credit.role}
            onChange={(e) => update(i, { role: e.target.value as CreditRole })}
            className="h-9"
          >
            {creditRoles.map((role) => (
              <option key={role} value={role}>
                {t(`record.roles.${role}`)}
              </option>
            ))}
          </Select>
          <Input
            aria-label={t('record.form.creditDetail')}
            value={credit.detail ?? ''}
            placeholder={t('record.form.creditDetail')}
            onChange={(e) => update(i, { detail: e.target.value || undefined })}
            className="hidden h-9 sm:block"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.remove')}
            onClick={() => onChange(credits.filter((_, j) => j !== i))}
            className="self-center"
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...credits, { name: '', role: 'design' }])}
      >
        <PlusIcon /> {t('record.form.addCredit')}
      </Button>
    </div>
  );
}
