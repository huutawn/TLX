import type { Page } from 'playwright';
import { normalizeRoute } from '../../strategies/utils';
import type { RouteScanTarget } from './types';

export function uniqueTargets(targets: RouteScanTarget[]): RouteScanTarget[] {
  const seen = new Set<string>();
  const unique: RouteScanTarget[] = [];
  for (const target of targets) {
    const normalized = normalizeTarget(target);
    if (!seen.has(normalized.route)) {
      unique.push(normalized);
      seen.add(normalized.route);
    }
  }
  return unique;
}

export async function discoverInternalTargets(page: Page, target: RouteScanTarget, maxPages: number): Promise<RouteScanTarget[]> {
  const origin = new URL(target.url).origin;
  const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
  const routes: RouteScanTarget[] = [];
  for (const href of hrefs.slice(0, maxPages)) {
    const url = new URL(href, target.url);
    if (url.origin !== origin || url.hash || url.pathname.startsWith('/api/')) continue;
    routes.push(createTargetFromUrl(url));
  }
  return uniqueTargets(routes);
}

function normalizeTarget(target: RouteScanTarget): RouteScanTarget {
  return createTargetFromUrl(new URL(target.url));
}

function createTargetFromUrl(url: URL): RouteScanTarget {
  const routePath = normalizeRoute(url.pathname);
  const route = `${routePath}${url.search}`;
  return { route, url: `${url.origin}${route}` };
}
