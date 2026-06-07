import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { TlxScanReport } from '@tlx/contracts';
import type { ScanGraph } from '../strategies/types';

export interface TlxScanViewport {
  name: string;
  width: number;
  height: number;
}

export interface TlxProjectConfig {
  auth: {
    mode: 'none' | 'manual';
    profile: string;
    loginUrl?: string;
    storageStatePath?: string;
  };
  scan: {
    defaultScope: 'changed' | 'all' | 'route';
    ignoredPaths: string[];
    viewports: TlxScanViewport[];
    contrastRatio: number;
    crawler: {
      enabled: boolean;
      maxDepth: number;
      maxPages: number;
    };
    api: {
      enabled: boolean;
      unsafeMethods: boolean;
    };
  };
}

export interface TlxHashEntry {
  path: string;
  hash: string;
  route?: string;
}

export interface TlxHashCache {
  version: 1;
  updatedAt: string;
  files: Record<string, TlxHashEntry>;
}

const DEFAULT_IGNORES = ['node_modules', 'dist', '.next', 'out', '.git', '.tlx'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.php', '.blade.php', '.css', '.scss', '.html']);

export const DEFAULT_TLX_CONFIG: TlxProjectConfig = {
  auth: {
    mode: 'none',
    profile: 'default',
  },
  scan: {
    defaultScope: 'changed',
    ignoredPaths: DEFAULT_IGNORES,
    viewports: [{ name: 'desktop', width: 1280, height: 800 }],
    contrastRatio: 4.5,
    crawler: { enabled: true, maxDepth: 2, maxPages: 25 },
    api: { enabled: true, unsafeMethods: false },
  },
};

export class ProjectStorageService {
  constructor(private readonly rootDir: string) {}

  get tlxDir() {
    return path.join(this.rootDir, '.tlx');
  }

  get screenshotsDir() {
    return path.join(this.tlxDir, 'screenshots');
  }

  get authDir() {
    return path.join(this.tlxDir, 'auth');
  }

  async ensureProjectStorage() {
    await fs.mkdir(this.screenshotsDir, { recursive: true });
  }

  async readConfig(): Promise<TlxProjectConfig> {
    const config = structuredClone(DEFAULT_TLX_CONFIG);
    const rootConfig = await this.readOptionalText(path.join(this.rootDir, 'tlx.yaml'));
    const legacyConfig = await this.readOptionalText(path.join(this.tlxDir, 'tlx.yaml'));

    for (const contents of [rootConfig, legacyConfig]) {
      if (contents) {
        mergeConfig(config, parseConfig(contents));
      }
    }

    config.scan.ignoredPaths = [...new Set([...DEFAULT_IGNORES, ...config.scan.ignoredPaths])];
    return config;
  }

  async readHashCache(): Promise<TlxHashCache> {
    const filePath = path.join(this.tlxDir, 'hash.json');
    const text = await this.readOptionalText(filePath);
    if (!text) {
      return { version: 1, updatedAt: new Date(0).toISOString(), files: {} };
    }

    try {
      const parsed = JSON.parse(text) as TlxHashCache;
      return parsed.version === 1 && parsed.files ? parsed : { version: 1, updatedAt: new Date(0).toISOString(), files: {} };
    } catch {
      return { version: 1, updatedAt: new Date(0).toISOString(), files: {} };
    }
  }

  async writeHashCache(cache: TlxHashCache): Promise<string[]> {
    return this.writeJsonFile(path.join(this.tlxDir, 'hash.json'), cache);
  }

  async readLatestReport(): Promise<TlxScanReport | undefined> {
    const text = await this.readOptionalText(path.join(this.tlxDir, 'latest-report.json'));
    if (!text) {
      return undefined;
    }

    try {
      return JSON.parse(text) as TlxScanReport;
    } catch {
      return undefined;
    }
  }

  async writeLatestReport(report: TlxScanReport): Promise<string[]> {
    return this.writeJsonFile(path.join(this.tlxDir, 'latest-report.json'), report);
  }

  resolveAuthStorageStatePath(config: TlxProjectConfig, profile = config.auth.profile) {
    if (config.auth.storageStatePath) {
      return path.isAbsolute(config.auth.storageStatePath) ? config.auth.storageStatePath : path.join(this.rootDir, config.auth.storageStatePath);
    }

    return path.join(this.authDir, `${safeProfileName(profile)}.json`);
  }

  relativeAuthStorageStatePath(config: TlxProjectConfig, profile = config.auth.profile) {
    return normalizePath(path.relative(this.rootDir, this.resolveAuthStorageStatePath(config, profile)));
  }

  async authStorageStateExists(config: TlxProjectConfig, profile = config.auth.profile) {
    try {
      const stat = await fs.stat(this.resolveAuthStorageStatePath(config, profile));
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async readAuthStorageStateMetadata(config: TlxProjectConfig, profile = config.auth.profile): Promise<{ savedAt?: string; origins: string[] } | undefined> {
    const filePath = this.resolveAuthStorageStatePath(config, profile);
    const text = await this.readOptionalText(filePath);
    if (!text) return undefined;

    try {
      const parsed = JSON.parse(text) as { origins?: Array<{ origin?: string }> };
      const stat = await fs.stat(filePath);
      return {
        savedAt: stat.mtime.toISOString(),
        origins: (parsed.origins ?? []).map((item) => item.origin).filter((origin): origin is string => Boolean(origin)),
      };
    } catch {
      return { origins: [] };
    }
  }

  async clearAuthStorageState(config: TlxProjectConfig, profile = config.auth.profile): Promise<boolean> {
    try {
      await fs.rm(this.resolveAuthStorageStatePath(config, profile), { force: true });
      return true;
    } catch {
      return false;
    }
  }

  async createSnapshot(graph: ScanGraph, ignoredPaths: string[]): Promise<TlxHashCache> {
    const files = await collectSourceFiles(this.rootDir, ignoredPaths);
    const routeByPath = createRouteIndex(this.rootDir, graph);
    const entries = await Promise.all(
      files.map(async (filePath) => {
        const relativePath = normalizePath(path.relative(this.rootDir, filePath));
        const buffer = await fs.readFile(filePath);
        const entry: TlxHashEntry = {
          path: relativePath,
          hash: crypto.createHash('sha256').update(buffer).digest('hex'),
          route: routeByPath.get(relativePath),
        };
        return entry;
      }),
    );

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      files: Object.fromEntries(entries.map((entry) => [entry.path, entry])),
    };
  }

  screenshotReportDir(reportId: string) {
    return path.join(this.screenshotsDir, reportId);
  }

  relativeScreenshotPath(reportId: string, fileName: string) {
    return normalizePath(path.join('.tlx', 'screenshots', reportId, fileName));
  }

  private async readOptionalText(filePath: string): Promise<string | undefined> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return undefined;
    }
  }

  private async writeJsonFile(filePath: string, value: unknown): Promise<string[]> {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      return [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [`Failed to write ${normalizePath(path.relative(this.rootDir, filePath))}: ${message}`];
    }
  }
}

export function createRouteIndex(rootDir: string, graph: ScanGraph): Map<string, string> {
  const index = new Map<string, string>();
  for (const page of graph.pages) {
    index.set(normalizePath(path.relative(rootDir, page.filePath)), page.route);
    for (const component of page.components) {
      index.set(normalizePath(path.relative(rootDir, component.filePath)), page.route);
    }
  }

  return index;
}

export function normalizePath(value: string) {
  return value.replace(/\\/g, '/');
}

async function collectSourceFiles(rootDir: string, ignoredPaths: string[]): Promise<string[]> {
  const files: string[] = [];
  const ignored = new Set(ignoredPaths.map((item) => item.replace(/^\.\//, '')));

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = normalizePath(path.relative(rootDir, absolutePath));
      const firstSegment = relativePath.split('/')[0] ?? relativePath;

      if (ignored.has(entry.name) || ignored.has(firstSegment) || [...ignored].some((ignoredPath) => relativePath.startsWith(`${ignoredPath}/`))) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(absolutePath);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}

function isSourceFile(fileName: string) {
  if (fileName.endsWith('.blade.php')) {
    return true;
  }

  return SOURCE_EXTENSIONS.has(path.extname(fileName));
}

function parseConfig(contents: string): Partial<TlxProjectConfig> {
  const patch: Partial<TlxProjectConfig> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes(':')) {
      continue;
    }

    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (!key || !value) {
      continue;
    }

    assignConfigValue(patch, key.trim(), value.replace(/^['"]|['"]$/g, ''));
  }

  return patch;
}

function assignConfigValue(config: Partial<TlxProjectConfig>, key: string, value: string) {
  const scan = (config.scan ??= {} as TlxProjectConfig['scan']);
  const auth = (config.auth ??= {} as TlxProjectConfig['auth']);
  switch (key) {
    case 'auth.mode':
      if (value === 'none' || value === 'manual') auth.mode = value;
      break;
    case 'auth.profile':
      auth.profile = safeProfileName(value);
      break;
    case 'auth.loginUrl':
      auth.loginUrl = value;
      break;
    case 'auth.storageStatePath':
      auth.storageStatePath = value;
      break;
    case 'scan.defaultScope':
    case 'defaultScope':
      if (value === 'changed' || value === 'all' || value === 'route') scan.defaultScope = value;
      break;
    case 'scan.ignoredPaths':
    case 'ignoredPaths':
      scan.ignoredPaths = value.split(',').map((item) => item.trim()).filter(Boolean);
      break;
    case 'scan.contrastRatio':
    case 'contrastRatio':
      scan.contrastRatio = Number.parseFloat(value) || DEFAULT_TLX_CONFIG.scan.contrastRatio;
      break;
    case 'scan.crawler.enabled':
      scan.crawler = { ...(scan.crawler ?? DEFAULT_TLX_CONFIG.scan.crawler), enabled: parseBoolean(value) };
      break;
    case 'scan.crawler.maxDepth':
      scan.crawler = { ...(scan.crawler ?? DEFAULT_TLX_CONFIG.scan.crawler), maxDepth: Number.parseInt(value, 10) || 2 };
      break;
    case 'scan.crawler.maxPages':
      scan.crawler = { ...(scan.crawler ?? DEFAULT_TLX_CONFIG.scan.crawler), maxPages: Number.parseInt(value, 10) || 25 };
      break;
    case 'scan.api.enabled':
      scan.api = { ...(scan.api ?? DEFAULT_TLX_CONFIG.scan.api), enabled: parseBoolean(value) };
      break;
    case 'scan.api.unsafeMethods':
      scan.api = { ...(scan.api ?? DEFAULT_TLX_CONFIG.scan.api), unsafeMethods: parseBoolean(value) };
      break;
  }
}

function mergeConfig(target: TlxProjectConfig, patch: Partial<TlxProjectConfig>) {
  if (patch.auth) {
    target.auth = { ...target.auth, ...patch.auth };
  }

  if (!patch.scan) return;
  target.scan = {
    ...target.scan,
    ...patch.scan,
    crawler: { ...target.scan.crawler, ...patch.scan.crawler },
    api: { ...target.scan.api, ...patch.scan.api },
  };
}

function parseBoolean(value: string) {
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function safeProfileName(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'default';
}
