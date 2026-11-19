import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute, route } from '../../app/root-route';
import { validateRecordsSearch } from '../../features/music/search';

export const musicRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/records',
    validateSearch: validateRecordsSearch,
    component: lazyRouteComponent(() => import('../../features/music/RecordsPage'), 'RecordsPage'),
  }),
  route(
    '/record/$recordId',
    lazyRouteComponent(() => import('../../features/music/RecordDetailPage'), 'RecordDetailPage'),
  ),
] as const;
