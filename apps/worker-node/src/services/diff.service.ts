import type { TlxCacheDiffResponse, TlxCacheEntry, TlxScanScope } from '@tlx/contracts';
import type { ScanGraph } from '../strategies/types';
import type { TlxHashCache } from './storage.service';
import { createRouteIndex, normalizePath } from './storage.service';

export interface ScopedRoutesResult {
  routes: string[];
  effectiveScope: TlxScanScope;
  skipped: boolean;
}

export class DiffService {
  createDiff(previous: TlxHashCache, current: TlxHashCache, rootDir: string, graph: ScanGraph): TlxCacheDiffResponse {
    const changed: TlxCacheEntry[] = [];
    const unchanged: TlxCacheEntry[] = [];
    const unknown: TlxCacheEntry[] = [];
    const deleted: TlxCacheEntry[] = [];
    const previousFiles = previous.files ?? {};
    const currentFiles = current.files ?? {};
    const routeIndex = createRouteIndex(rootDir, graph);
    const affectedRoutes = new Set<string>();

    for (const [filePath, currentEntry] of Object.entries(currentFiles)) {
      const route = currentEntry.route ?? routeIndex.get(filePath);
      const entry = toCacheEntry(currentEntry.path, currentEntry.hash, route);
      const previousEntry = previousFiles[filePath];

      if (!previousEntry) {
        unknown.push(entry);
        addAffectedRoutes(affectedRoutes, filePath, route, graph);
        continue;
      }

      if (previousEntry.hash !== currentEntry.hash) {
        changed.push(entry);
        addAffectedRoutes(affectedRoutes, filePath, route, graph);
      } else {
        unchanged.push(entry);
      }
    }

    for (const [filePath, previousEntry] of Object.entries(previousFiles)) {
      if (!(filePath in currentFiles)) {
        const route = previousEntry.route ?? routeIndex.get(filePath);
        deleted.push(toCacheEntry(previousEntry.path, previousEntry.hash, route));
        addAffectedRoutes(affectedRoutes, filePath, route, graph);
      }
    }

    if (unknown.length > 0 && unchanged.length === 0 && changed.length === 0) {
      for (const page of graph.pages) {
        affectedRoutes.add(page.route);
      }
    }

    return {
      changed: changed.sort(sortEntry),
      unchanged: unchanged.sort(sortEntry),
      unknown: unknown.sort(sortEntry),
      deleted: deleted.sort(sortEntry),
      affectedRoutes: [...affectedRoutes].sort(),
    };
  }

  resolveRoutes(scope: TlxScanScope, route: string | undefined, diff: TlxCacheDiffResponse, graph: ScanGraph): ScopedRoutesResult {
    if (scope === 'route') {
      return { routes: route ? [route] : [], effectiveScope: 'route', skipped: !route };
    }

    if (scope === 'all') {
      return { routes: graph.pages.map((page) => page.route), effectiveScope: 'all', skipped: false };
    }

    if (diff.affectedRoutes.length === 0) {
      return { routes: [], effectiveScope: 'changed', skipped: true };
    }

    return { routes: diff.affectedRoutes, effectiveScope: 'changed', skipped: false };
  }
}

function toCacheEntry(filePath: string, hash?: string, route?: string): TlxCacheEntry {
  return route ? { path: normalizePath(filePath), hash, route } : { path: normalizePath(filePath), hash };
}

function addAffectedRoutes(routes: Set<string>, filePath: string, directRoute: string | undefined, graph: ScanGraph) {
  if (directRoute) {
    routes.add(directRoute);
  }

  for (const page of graph.pages) {
    if (normalizePath(page.filePath).endsWith(filePath) || page.components.some((component) => normalizePath(component.filePath).endsWith(filePath))) {
      routes.add(page.route);
    }
  }
}

function sortEntry(left: TlxCacheEntry, right: TlxCacheEntry) {
  return left.path.localeCompare(right.path);
}
