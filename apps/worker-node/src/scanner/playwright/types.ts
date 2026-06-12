import type { TlxColorAnalysis, TlxScanIssue } from '@tlx/contracts';
import type { TlxProjectConfig } from '../../services/storage.service';

export interface RouteScanTarget {
  route: string;
  url: string;
}

export interface PlaywrightScanOptions {
  reportId: string;
  screenshotsDir: string;
  relativeScreenshotPath(reportId: string, fileName: string): string;
  config: TlxProjectConfig;
  apiEndpoints: string[];
  discoverRoutes?: boolean;
  storageStatePath?: string;
}

export interface PlaywrightScanResult {
  issues: TlxScanIssue[];
  screenshots: string[];
  routes: string[];
  elementsScanned: number;
  routesScanned: number;
  warnings: string[];
  artifactErrors: string[];
  colorAnalysis?: TlxColorAnalysis;
}

export interface PageScanResult {
  elements: import('../ui-analyzer').ScannedElement[];
  pageMetrics: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };
  pageState: { title: string; url: string; textSample: string };
}
