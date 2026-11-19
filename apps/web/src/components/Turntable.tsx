import type { MusicRecord } from '@mnemo/core';
import { cn } from '@mnemo/ui';
import type { CSSProperties } from 'react';
import { VinylDisc } from './RecordSleeve';

/**
 * Geometry in the SVG's viewBox (100 × 80, the plinth's aspect): the platter turns around
 * (37, 40) with radius 32; the tonearm pivots at (86, 16) with an arm 48 long. Parked, it hangs
 * straight down beside the platter; swung in by 34° its stylus meets the outer grooves.
 */
const PIVOT = { x: 86, y: 16 };
const ARM = 48;
const PLAYING_ANGLE = 34;

interface TurntableProps {
  /** The record on the platter; an empty platter shows its mat. */
  record?: MusicRecord;
  playing?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A turntable seen from above: a dark plinth, a metal platter with the record on it and a tonearm
 * that swings onto the record while it plays. The record turns at 33⅓ rpm; with reduced motion it
 * rests and only the arm shows what is happening.
 */
export function Turntable({ record, playing, className, style }: TurntableProps) {
  return (
    <div
      className={cn(
        'relative aspect-[5/4] w-full rounded-[18px] shadow-float',
        'bg-[linear-gradient(160deg,#2b2825,#171513_60%)] dark:bg-[linear-gradient(160deg,#302c28,#1c1a17_60%)]',
        className,
      )}
      style={style}
    >
      {/* A thin highlight along the top edge of the plinth. */}
      <span className="pointer-events-none absolute inset-0 rounded-[18px] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),inset_0_-2px_6px_rgb(0_0_0/0.4)]" />

      {/* Platter: brushed metal rim, rubber mat, then the record. */}
      <div
        className="absolute top-[10%] left-[5%] aspect-square w-[64%] rounded-full p-[1.6%] shadow-[0_8px_24px_-6px_rgb(0_0_0/0.7)]"
        style={{
          background:
            'conic-gradient(from 30deg, #9a978f, #e4e1da 12%, #8c8981 25%, #d6d3cc 40%, #85827a 55%, #e0ddd6 70%, #8f8c84 85%, #9a978f)',
        }}
      >
        <div
          className="relative size-full rounded-full"
          style={{
            background: 'repeating-radial-gradient(circle, #1b1a18 0 3px, #222120 3px 5px)',
          }}
        >
          {record ? (
            <VinylDisc
              record={record}
              spinning={playing}
              className="absolute inset-[1.5%] transition-transform duration-700 ease-gallery"
            />
          ) : (
            <span className="absolute inset-[48%] rounded-full bg-[#9a978f]" />
          )}
        </div>
      </div>

      <svg
        viewBox="0 0 100 80"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="mn-arm" x1="0" x2="1">
            <stop offset="0" stopColor="#8d8a83" />
            <stop offset="0.5" stopColor="#f1eee8" />
            <stop offset="1" stopColor="#8d8a83" />
          </linearGradient>
          <radialGradient id="mn-pivot">
            <stop offset="0" stopColor="#e9e6e0" />
            <stop offset="1" stopColor="#6f6c66" />
          </radialGradient>
        </defs>
        {/* Arm rest beside the platter. */}
        <rect x="83.6" y="61" width="4.8" height="3" rx="1" fill="#3b3834" />
        <circle cx={PIVOT.x} cy={PIVOT.y} r="7.5" fill="#24221f" />
        <g
          style={{
            transform: `rotate(${playing ? PLAYING_ANGLE : 0}deg)`,
            transformOrigin: `${PIVOT.x}px ${PIVOT.y}px`,
            transformBox: 'view-box',
            transition: 'transform 1.6s cubic-bezier(0.45, 0, 0.2, 1)',
          }}
        >
          {/* Counterweight behind the pivot, the arm, then the headshell with its cartridge. */}
          <rect
            x={PIVOT.x - 3}
            y={PIVOT.y - 10}
            width="6"
            height="6"
            rx="1.4"
            fill="url(#mn-pivot)"
          />
          <rect
            x={PIVOT.x - 0.75}
            y={PIVOT.y - 4}
            width="1.5"
            height={ARM - 2}
            rx="0.75"
            fill="url(#mn-arm)"
          />
          <g transform={`translate(${PIVOT.x} ${PIVOT.y + ARM - 4}) rotate(-18)`}>
            <rect x="-2.2" y="0" width="4.4" height="6.5" rx="0.8" fill="#d9d6cf" />
            <rect x="-1.4" y="4.2" width="2.8" height="2.6" rx="0.4" fill="#a4462f" />
          </g>
        </g>
        <circle cx={PIVOT.x} cy={PIVOT.y} r="3.6" fill="url(#mn-pivot)" />
        {/* Start button and speed light in the front corner. */}
        <circle cx="90" cy="72" r="2.6" fill="#3b3834" />
        <circle
          cx="82"
          cy="72"
          r="0.9"
          className="transition-[fill] duration-700"
          fill={playing ? '#e4572e' : '#4a4641'}
        />
      </svg>
    </div>
  );
}
