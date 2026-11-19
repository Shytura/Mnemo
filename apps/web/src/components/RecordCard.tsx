import type { MusicRecord } from '@mnemo/core';
import { cn } from '@mnemo/ui';
import { Link } from '@tanstack/react-router';
import { BookmarkIcon, HandshakeIcon, HeartIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CollectibleCardProps } from '../app/collectibles';
import { RecordSleeve, VinylDisc } from './RecordSleeve';

interface RecordCardProps {
  record: MusicRecord;
  className?: string;
  style?: CSSProperties;
}

/**
 * A sleeve on the wall. On hover the record slides halfway out and turns a little, the way it
 * does when you pull it from a shelf.
 */
export function RecordCard({ record, className, style }: RecordCardProps) {
  const { t } = useTranslation();
  const year = record.releaseYear ?? record.pressingYear;
  return (
    <figure className={cn('group relative hover:z-10 focus-within:z-10', className)} style={style}>
      <Link to="/record/$recordId" params={{ recordId: record.id }} className="block">
        <div className="relative">
          {record.ownership !== 'wishlist' && (
            <VinylDisc
              record={record}
              className="absolute inset-[3%] transition-transform duration-700 ease-gallery group-hover:translate-x-[34%] group-hover:rotate-[50deg] group-focus-visible:translate-x-[34%]"
            />
          )}
          <RecordSleeve
            record={record}
            className={cn(
              'shadow-frame transition-[box-shadow,translate] duration-500 ease-gallery group-hover:-translate-y-1 group-hover:shadow-float',
              record.ownership === 'sold' && 'opacity-60 grayscale',
            )}
            style={{ viewTransitionName: `record-${record.id}` }}
          />
          <div className="absolute top-2 left-2 flex gap-1.5">
            {record.ownership === 'wishlist' && (
              <Badge label={t('record.ownership.wishlist')}>
                <BookmarkIcon className="size-3.5" />
              </Badge>
            )}
            {record.loan && (
              <Badge label={t('record.lentTo', { name: record.loan.name })}>
                <HandshakeIcon className="size-3.5" />
              </Badge>
            )}
            {record.favorite && (
              <Badge label={t('record.favorite')} accent>
                <HeartIcon className="size-3.5 fill-current" />
              </Badge>
            )}
          </div>
        </div>
        <figcaption className="mt-3 space-y-0.5">
          <p className="caption line-clamp-2 text-base leading-snug text-ink transition-colors group-hover:text-accent">
            {record.title}
          </p>
          <p className="line-clamp-1 text-xs text-ink-2">
            {record.artists.join(', ')}
            {year && <span className="text-ink-3 tabular-nums"> · {year}</span>}
          </p>
        </figcaption>
      </Link>
    </figure>
  );
}

export function RecordItemCard({ item, ...rest }: CollectibleCardProps<'record'>) {
  return <RecordCard record={item} {...rest} />;
}

function Badge({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      title={label}
      className={cn(
        'grid size-7 place-items-center rounded-full shadow-soft backdrop-blur',
        accent ? 'bg-accent text-accent-ink' : 'bg-surface/90 text-ink',
      )}
    >
      <span className="sr-only">{label}</span>
      {children}
    </span>
  );
}
