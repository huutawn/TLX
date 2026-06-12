/// <reference lib="dom" />

import type { TlxScanIssue } from '@tlx/contracts';
import type { Page } from 'playwright';
import { slugRoute } from './artifacts';
import type { RouteScanTarget } from './types';

/**
 * Performs shallow, local-origin-safe crawl checks and fills common form fields with mock input.
 */
export async function crawlSafe(page: Page, target: RouteScanTarget, maxDepth: number, maxPages: number): Promise<TlxScanIssue[]> {
  const links = await page.$$eval('a[href]', (anchors, limit) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href).slice(0, limit), maxPages);
  const origin = new URL(target.url).origin;
  const issues: TlxScanIssue[] = [];

  for (const href of links.slice(0, Math.max(0, Math.min(maxPages, maxDepth * maxPages)))) {
    const url = new URL(href, target.url);
    if (url.origin !== origin) {
      issues.push(createSyntheticIssue('crawler', target, 'Link points outside the local project origin. Fix: mark external links intentionally, or use an internal route for local navigation.', { href, fixHint: 'External links are not crawled during local UI checks.' }));
    }
  }

  await page.$$eval('input[type="text"], input[type="email"], input[type="password"], input[type="search"], textarea', (inputs) => {
    for (const input of inputs.slice(0, 20)) {
      (input as HTMLInputElement).value = 'tlx-mock';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  return issues;
}

/**
 * Checks discovered local API endpoints for healthy status and valid JSON responses.
 */
export async function checkApiContracts(page: Page, target: RouteScanTarget, endpoints: string[], allowUnsafeMethods: boolean): Promise<TlxScanIssue[]> {
  const issues: TlxScanIssue[] = [];
  const origin = new URL(target.url).origin;
  const uniqueEndpoints = [...new Set(endpoints)].filter((endpoint) => endpoint.startsWith('/'));

  for (const endpoint of uniqueEndpoints.slice(0, 20)) {
    const result = await page.evaluate(async ({ origin, endpoint, allowUnsafeMethods }) => {
      const startedAt = performance.now();
      const response = await fetch(`${origin}${endpoint}`, { method: allowUnsafeMethods ? 'OPTIONS' : 'GET' });
      const contentType = response.headers.get('content-type') || '';
      let jsonValid = true;
      if (contentType.includes('application/json')) {
        try {
          await response.clone().json();
        } catch {
          jsonValid = false;
        }
      }
      return { status: response.status, contentType, jsonValid, latencyMs: Math.round(performance.now() - startedAt) };
    }, { origin, endpoint, allowUnsafeMethods }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));

    if ('error' in result || result.status >= 500 || result.jsonValid === false) {
      issues.push(createSyntheticIssue('api', target, `API check failed for ${endpoint}. Fix: verify the endpoint returns a healthy status and valid JSON when expected.`, { endpoint, fixHint: 'Open the endpoint in the browser or inspect the route handler/server logs.', ...result }));
    }
  }

  return issues;
}

/**
 * Creates a route-level issue that is not tied to a specific DOM element.
 */
export function createSyntheticIssue(kind: 'crawler' | 'api', target: RouteScanTarget, message: string, metadata: Record<string, unknown>): TlxScanIssue {
  return {
    id: `${kind}-${slugRoute(target.route)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    severity: 'warning',
    message,
    route: target.route,
    url: target.url,
    selector: 'document',
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    metadata,
  };
}

/**
 * Classifies 401/403 route responses as missing or stale manual-auth state.
 */
export function createAuthIssue(target: RouteScanTarget, status: number, viewportName: string, hasStorageState: boolean): TlxScanIssue {
  const kind = hasStorageState ? 'auth_failed' : 'auth_required';
  const message = hasStorageState
    ? `Route returned HTTP ${status} with saved auth state. Fix: refresh the TLX auth session or use an account with access to this route.`
    : `Route returned HTTP ${status} and requires authentication. Fix: run TLX auth login, then rerun the scan.`;

  return {
    id: `${kind}-${slugRoute(target.route)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    severity: 'warning',
    message,
    route: target.route,
    url: target.url,
    selector: 'document',
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    metadata: { status, viewport: viewportName, hasStorageState },
  };
}
