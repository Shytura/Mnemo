import type { RecordOwnership } from '@mnemo/core';
import { DiscIcon } from 'lucide-react';
import { type AppModule, lazyDialog } from '../../app/modules';
import { RecordItemCard } from '../../components/RecordCard';
import type { RecordPrefill } from '../../features/music/RecordForm';

declare module '../../app/dialogs' {
  interface DialogRegistry {
    /** `prefill` comes from a catalogue or the scanner; without `recordId` a record is created. */
    record: { recordId?: string; prefill?: RecordPrefill & { ownership?: RecordOwnership } };
    recordLoan: { recordId: string };
    /** Catalogue search and barcode lookup; `scan` opens the camera right away. */
    addRecord: { ownership?: RecordOwnership; scan?: boolean };
  }
}

/** Records: the wall, the shelf, the record itself with its sides, credits and history. */
export const musicModule: AppModule = {
  id: 'music',
  nav: [
    {
      to: '/records',
      navKey: 'records',
      icon: DiscIcon,
      order: 17,
      placement: 'main',
    },
  ],
  quickAdd: [
    {
      quickAddKey: 'record',
      icon: DiscIcon,
      dialog: { type: 'addRecord' },
      order: 17,
      group: 'record',
    },
  ],
  collectibles: {
    record: {
      Card: RecordItemCard,
      href: (id) => `/record/${id}`,
    },
  },
  dialogs: {
    record: lazyDialog(
      () => import('../../features/music/RecordForm'),
      (m) => m.RecordFormDialog,
    ),
    addRecord: lazyDialog(
      () => import('../../features/music/AddRecord'),
      (m) => m.AddRecordDialog,
    ),
    recordLoan: lazyDialog(
      () => import('../../features/music/RecordDialogs'),
      (m) => m.RecordLoanDialog,
    ),
  },
};
