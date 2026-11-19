import type { MusicRecord } from '@mnemo/core';
import { Button, cn } from '@mnemo/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RecordSleeve } from '../../components/RecordSleeve';

/** How many sleeves stay visible behind and in front of the one being looked at. */
const BEHIND = 9;
const FLIPPED = 2;

/**
 * Where a sleeve sits, by its distance from the one being looked at: those behind lean back in
 * a row with their tops showing; those already flipped through fall forward against the front of
 * the crate.
 */
function placement(offset: number): CSSProperties {
  if (offset === 0) {
    return { transform: 'translate3d(0, -12%, 0) rotateX(4deg)', zIndex: 50 };
  }
  if (offset > 0) {
    // Seen from above, each sleeve further back shows a little more of its top edge.
    return {
      transform: `translate3d(0, ${-12 - offset * 6.5}%, ${-offset * 38}px) rotateX(10deg)`,
      filter: `brightness(${1 - offset * 0.07})`,
      opacity: offset > BEHIND - 2 ? (BEHIND - offset) / 2 : 1,
      zIndex: 50 - offset,
    };
  }
  // Flipped forward: it tips over towards the front of the crate and out of sight.
  return {
    transform: 'translate3d(0, 18%, 60px) rotateX(-82deg)',
    opacity: 0,
    pointerEvents: 'none',
    zIndex: 50 + offset,
  };
}

/**
 * Crate digging: the records stand one behind another in a box and are flipped through with the
 * wheel, the arrow keys or a swipe. The one in front opens on a click, one further back comes
 * forward.
 */
export function RecordCrate({ records }: { records: MusicRecord[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const wheel = useRef({ sum: 0, last: 0 });
  const drag = useRef<{ x: number; y: number; index: number } | null>(null);
  const current = records[Math.min(index, records.length - 1)];

  useEffect(() => {
    if (index > records.length - 1) setIndex(Math.max(0, records.length - 1));
  }, [index, records.length]);

  const go = (next: number) => setIndex(Math.max(0, Math.min(records.length - 1, next)));

  // The wheel flips one record per notch, however fast the trackpad reports.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = wheel.current;
      const now = performance.now();
      if (now - state.last > 250) state.sum = 0;
      state.last = now;
      state.sum += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(state.sum) >= 60) {
        const step = Math.sign(state.sum);
        state.sum = 0;
        setIndex((i) => Math.max(0, Math.min(records.length - 1, i + step)));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [records.length]);

  /** The record in front opens; one further back comes forward. */
  const choose = (i: number) => {
    const record = records[i];
    if (i !== index) go(i);
    else if (record) void navigate({ to: '/record/$recordId', params: { recordId: record.id } });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      PageDown: 5,
      PageUp: -5,
    };
    if (e.key in keys) {
      e.preventDefault();
      go(index + keys[e.key]!);
    } else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(records.length - 1);
    else if (e.key === 'Enter' && current) {
      void navigate({ to: '/record/$recordId', params: { recordId: current.id } });
    }
  };

  if (!current) return null;
  const year = current.releaseYear ?? current.pressingYear;

  return (
    <section
      aria-roledescription={t('records.crate.role')}
      aria-label={t('records.views.crate')}
      className="mx-auto max-w-3xl"
    >
      <div
        ref={stage}
        role="listbox"
        tabIndex={0}
        aria-label={t('records.crate.hint')}
        aria-activedescendant={`crate-${current.id}`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, index };
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || e.pointerType === 'mouse') return;
          const delta = start.y - e.clientY + (start.x - e.clientX);
          go(start.index + Math.round(delta / 45));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        className="relative mx-auto mt-16 h-[clamp(22rem,62vh,36rem)] touch-none select-none rounded-[6px] outline-none [perspective:1500px] [perspective-origin:50%_0%] focus-visible:ring-1 focus-visible:ring-accent/40"
      >
        <div className="absolute inset-x-[16%] top-[38%] bottom-[14%] [transform-style:preserve-3d] sm:inset-x-[23%]">
          {records.map((record, i) => {
            const offset = i - index;
            if (offset > BEHIND || offset < -FLIPPED) return null;
            const front = offset === 0;
            return (
              <div
                key={record.id}
                id={`crate-${record.id}`}
                role="option"
                aria-selected={front}
                aria-label={`${record.artists.join(', ')} – ${record.title}`}
                tabIndex={-1}
                onClick={() => choose(i)}
                onKeyDown={(e) => e.key === 'Enter' && choose(i)}
                className="absolute inset-x-0 bottom-0 cursor-pointer transition-[transform,filter,opacity] duration-500 ease-gallery [transform-origin:50%_100%] [backface-visibility:hidden]"
                style={placement(offset)}
              >
                <RecordSleeve
                  record={record}
                  variant={front ? 'full' : 'thumb'}
                  className={cn(
                    'shadow-[0_-1px_0_rgb(255_255_255/0.25),0_18px_40px_-16px_rgb(0_0_0/0.6)]',
                    front && 'ring-1 ring-black/10',
                  )}
                />
              </div>
            );
          })}
        </div>

        {/* The front of the crate: plywood with a hand hole, in front of every sleeve. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[10%] bottom-0 z-10 h-[32%] rounded-[3px] shadow-[0_24px_40px_-20px_rgb(0_0_0/0.55),inset_0_1px_0_rgb(255_255_255/0.35)] sm:inset-x-[16%]"
          style={{
            background: [
              'repeating-linear-gradient(90deg, rgb(0 0 0 / 0.025) 0 2px, transparent 2px 9px)',
              'linear-gradient(180deg, rgb(255 255 255 / 0.12), transparent 40%, rgb(0 0 0 / 0.12))',
              // Plywood, a shade darker on dark paper so it does not glare.
              'color-mix(in oklab, #b98d5c 82%, var(--mn-paper))',
            ].join(', '),
          }}
        >
          <span className="absolute top-[22%] left-1/2 h-[18%] w-[22%] -translate-x-1/2 rounded-full bg-[#2a1e14] shadow-[inset_0_3px_6px_rgb(0_0_0/0.6)]" />
          <span className="absolute inset-x-0 bottom-[14%] text-center font-display text-sm text-[#4a3423]/70 italic">
            {current.artists[0]?.charAt(0).toUpperCase() ?? '·'}
          </span>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4" aria-live="polite">
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label={t('records.crate.previous')}
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="caption truncate text-2xl leading-tight text-ink">{current.title}</p>
          <p className="mt-1 truncate text-sm text-ink-2">
            {current.artists.join(', ')}
            {year && <span className="text-ink-3"> · {year}</span>}
            {current.label && <span className="text-ink-3"> · {current.label}</span>}
          </p>
          <p className="eyebrow mt-2 text-ink-3 tabular-nums">
            {t('records.crate.position', { index: index + 1, total: records.length })}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 rounded-full"
          aria-label={t('records.crate.next')}
          disabled={index === records.length - 1}
          onClick={() => go(index + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="mt-4 flex justify-center">
        <Button asChild variant="link" size="sm">
          <Link to="/record/$recordId" params={{ recordId: current.id }}>
            {t('records.crate.open')} <ArrowRightIcon />
          </Link>
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-ink-3">{t('records.crate.hint')}</p>
    </section>
  );
}
