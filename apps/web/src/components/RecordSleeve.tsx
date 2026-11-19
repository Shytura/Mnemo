import { hashString, type MusicRecord, onColor } from '@mnemo/core';
import { cn } from '@mnemo/ui';
import type { CSSProperties } from 'react';
import { MediaImage, RemoteImage } from './MediaImage';

type SleeveRecord = Pick<
  MusicRecord,
  'id' | 'title' | 'artists' | 'mediaIds' | 'palette' | 'vinylColor' | 'label'
>;

/**
 * Printed sleeves for records without a cover: flat ink on uncoated board, in the manner of
 * mid-century jazz and classical labels.
 */
const SLEEVES = [
  { board: '#1f3b57', ink: '#efe6d2', mark: '#d9a441' },
  { board: '#b4442c', ink: '#f6eddc', mark: '#1d1a17' },
  { board: '#e7dcc4', ink: '#1d1a17', mark: '#b4442c' },
  { board: '#2d2a26', ink: '#efe6d2', mark: '#6fa3a0' },
  { board: '#40624a', ink: '#f1e8d4', mark: '#e3b94d' },
  { board: '#d7a23c', ink: '#1d1a17', mark: '#f6eddc' },
  { board: '#5a3550', ink: '#f2e6d6', mark: '#e58f6b' },
] as const;

/** Light on a laminated sleeve and the shadow of its open edge. */
const LAMINATE =
  'linear-gradient(118deg, rgb(255 255 255 / 0.16) 0%, rgb(255 255 255 / 0) 38%), linear-gradient(90deg, transparent 97.5%, rgb(0 0 0 / 0.16) 100%)';

interface RecordSleeveProps {
  record: SleeveRecord;
  /** A catalogue cover for records that are not stored yet. */
  src?: string;
  variant?: 'thumb' | 'full';
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The square sleeve: the cover, or a printed one when there is none. */
export function RecordSleeve({ record, src, variant, eager, className, style }: RecordSleeveProps) {
  const mediaId = record.mediaIds[0];
  const fallback = <PrintedSleeve record={record} />;
  return (
    <div
      className={cn('relative aspect-square overflow-hidden rounded-[2px] bg-paper-2', className)}
      style={style}
    >
      {mediaId ? (
        <MediaImage
          mediaId={mediaId}
          variant={variant}
          alt={record.title}
          eager={eager}
          className="size-full"
        />
      ) : src ? (
        <RemoteImage src={src} alt={record.title} className="size-full" fallback={fallback} />
      ) : (
        fallback
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 ring-1 ring-black/8 ring-inset"
        style={{ background: LAMINATE }}
      />
    </div>
  );
}

/** A typographic sleeve with a faint ring where the record inside has worn the board. */
function PrintedSleeve({ record }: { record: SleeveRecord }) {
  const sleeve = SLEEVES[hashString(record.title) % SLEEVES.length]!;
  return (
    <div
      className="@container relative flex size-full flex-col justify-between p-[9%]"
      style={{ background: sleeve.board, color: sleeve.ink }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-[5%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, transparent 0 31%, rgb(0 0 0 / 0.07) 31.5% 34%, transparent 34.5% 96%, rgb(255 255 255 / 0.06) 97% 99%, transparent 99.5%)',
        }}
      />
      <span className="relative flex items-center gap-[4cqi]">
        <span className="size-[7cqi] rounded-full" style={{ background: sleeve.mark }} />
        <span className="eyebrow line-clamp-1 text-[clamp(0.25rem,4.2cqi,0.75rem)] opacity-85">
          {record.label ?? ''}
        </span>
      </span>
      <span className="relative">
        <span className="display line-clamp-4 text-[clamp(0.5rem,13cqi,3.25rem)] leading-[0.92] font-[520] break-words hyphens-auto">
          {record.title}
        </span>
        <span className="eyebrow mt-[4cqi] line-clamp-2 block text-[clamp(0.25rem,4.6cqi,0.85rem)] opacity-85">
          {record.artists.join(' · ')}
        </span>
      </span>
    </div>
  );
}

interface VinylDiscProps {
  record: SleeveRecord;
  /** Turns at 33⅓ rpm. */
  spinning?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The record itself: grooves, a smooth run-out, the centre label in the sleeve's first colour,
 * the spindle hole. Coloured pressings shine through slightly. The light stays put while the
 * record turns underneath it.
 */
export function VinylDisc({ record, spinning, className, style }: VinylDiscProps) {
  const vinyl = record.vinylColor ?? '#121110';
  const coloured = record.vinylColor !== undefined;
  const labelColor = record.palette[0] ?? SLEEVES[hashString(record.title) % SLEEVES.length]!.mark;
  const labelInk = onColor(labelColor);
  return (
    <div
      aria-hidden="true"
      className={cn('relative aspect-square rounded-full', className)}
      style={{
        // A hairline of light along the edge keeps a black record visible on dark paper.
        boxShadow: '0 0 0 1px rgb(255 255 255 / 0.07), 0 10px 30px -8px rgb(0 0 0 / 0.45)',
        ...style,
      }}
    >
      <div
        className={cn(
          'absolute inset-0 rounded-full',
          spinning && 'animate-spin [animation-duration:1.8s]',
        )}
        style={{
          background: [
            // Run-out groove and the smooth band around the label.
            'radial-gradient(circle, transparent 0 34.5%, rgb(0 0 0 / 0.25) 35% 36.5%, transparent 37%)',
            // The edge, slightly raised.
            'radial-gradient(circle, transparent 0 96.5%, rgb(255 255 255 / 0.16) 97.5%, rgb(0 0 0 / 0.35) 99.5%)',
            // Grooves, with the gaps between tracks.
            'repeating-radial-gradient(circle, rgb(255 255 255 / 0.045) 0 0.6px, transparent 0.6px 2.2px)',
            'radial-gradient(circle, transparent 0 52%, rgb(0 0 0 / 0.22) 52.4% 52.9%, transparent 53.3% 70%, rgb(0 0 0 / 0.22) 70.4% 70.9%, transparent 71.3%)',
            coloured
              ? `radial-gradient(circle, color-mix(in oklab, ${vinyl} 82%, white) 0%, ${vinyl} 70%)`
              : vinyl,
          ].join(', '),
          opacity: coloured ? 0.94 : 1,
        }}
      >
        <div
          className="@container absolute inset-[33%] flex flex-col items-center justify-center rounded-full text-center"
          style={{ background: labelColor, color: labelInk }}
        >
          <span className="eyebrow line-clamp-1 max-w-[70%] text-[clamp(0.15rem,7cqi,0.6rem)] opacity-80">
            {record.label ?? record.artists[0] ?? ''}
          </span>
          <span className="mt-[30%] line-clamp-2 max-w-[78%] font-display text-[clamp(0.18rem,9cqi,0.8rem)] leading-tight italic">
            {record.title}
          </span>
        </div>
        <span className="absolute inset-[48.6%] rounded-full bg-[#0b0a09] shadow-[inset_0_1px_1px_rgb(255_255_255/0.25)]" />
      </div>
      {/* Two soft reflections from a lamp above; they do not turn with the record. */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 20deg, transparent 0 8%, rgb(255 255 255 / 0.13) 13%, transparent 19% 52%, rgb(255 255 255 / 0.09) 59%, transparent 66%)',
          mask: 'radial-gradient(circle, transparent 0 34%, black 37%)',
        }}
      />
    </div>
  );
}
