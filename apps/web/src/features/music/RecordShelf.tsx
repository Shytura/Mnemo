import { hashString, type MusicRecord, onColor } from '@mnemo/core';
import { cn } from '@mnemo/ui';
import { Link } from '@tanstack/react-router';

/**
 * Shelf boards behind the rows: an edge, the board, its shadow. Every cell is exactly one row
 * high, so the boards repeat in step with the wrap and run the full width.
 */
const BOARDS = `repeating-linear-gradient(to bottom,
  transparent 0 var(--cell),
  color-mix(in oklab, var(--mn-ink) 24%, var(--mn-paper)) var(--cell) calc(var(--cell) + 2px),
  color-mix(in oklab, var(--mn-ink) 9%, var(--mn-paper)) calc(var(--cell) + 2px) calc(var(--cell) + 9px),
  color-mix(in oklab, var(--mn-ink) 28%, transparent) calc(var(--cell) + 9px) calc(var(--cell) + 12px))`;

/** Sleeve colours for records without a cover palette. */
const SPINES = ['#1f3b57', '#b4442c', '#e7dcc4', '#2d2a26', '#40624a', '#d7a23c', '#5a3550'];

const HEIGHT: Record<string, string> = { '12': '100%', '10': '86%', '7': '62%' };

function spineWidth(record: MusicRecord): number {
  if (record.format === 'box') return 54;
  return 32 + Math.min(record.discCount - 1, 3) * 8;
}

/**
 * Records filed spine-out, as they stand on a shelf: singles are shorter than LPs, double albums
 * and box sets wider.
 */
export function RecordShelf({ records }: { records: MusicRecord[] }) {
  return (
    <div
      className="flex flex-wrap items-end px-1 [--cell:15rem] sm:[--cell:17rem]"
      style={{ backgroundImage: BOARDS }}
    >
      {records.map((record, i) => (
        <Spine key={record.id} record={record} index={i} />
      ))}
    </div>
  );
}

function Spine({ record, index }: { record: MusicRecord; index: number }) {
  const color = record.palette[0] ?? SPINES[hashString(record.title) % SPINES.length]!;
  const ink = onColor(color);
  const height = HEIGHT[record.size ?? '12'] ?? '100%';
  return (
    <div className="flex h-[calc(var(--cell)+12px)] items-end pb-3">
      <Link
        to="/record/$recordId"
        params={{ recordId: record.id }}
        title={`${record.artists.join(', ')} – ${record.title}`}
        aria-label={`${record.artists.join(', ')} – ${record.title}`}
        className={cn(
          'group relative flex animate-rise flex-col items-center justify-between overflow-hidden rounded-t-[1px] py-3 shadow-[inset_-2px_0_3px_rgb(0_0_0/0.18),inset_1px_0_0_rgb(255_255_255/0.12)] transition-transform duration-500 ease-gallery hover:-translate-y-3 focus-visible:-translate-y-3',
          record.ownership !== 'owned' && 'opacity-55',
        )}
        style={{
          width: spineWidth(record),
          height,
          background: `linear-gradient(90deg, rgb(0 0 0 / 0.12), transparent 30%, rgb(255 255 255 / 0.06) 55%, rgb(0 0 0 / 0.1)), ${color}`,
          color: ink,
          animationDelay: `${Math.min(index, 40) * 12}ms`,
        }}
      >
        {/* In vertical writing a column stacks lines side by side, each the full height. */}
        <span className="flex min-h-0 w-full flex-1 flex-col justify-center gap-0.5 overflow-hidden [writing-mode:vertical-rl]">
          <span className="truncate font-display text-[0.8rem] leading-tight italic">
            {record.title}
          </span>
          <span className="eyebrow truncate text-[0.5rem] leading-tight opacity-75">
            {record.artists.join(' · ')}
          </span>
        </span>
        {record.catalogNumber && (
          <span className="mt-2 max-h-[30%] truncate font-mono text-[0.5rem] tracking-wide opacity-70 [writing-mode:vertical-rl]">
            {record.catalogNumber}
          </span>
        )}
        {record.favorite && (
          <span className="absolute top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-current opacity-70" />
        )}
      </Link>
    </div>
  );
}
