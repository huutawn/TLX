import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
import type { ComponentNode, JsonObject } from './types';

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'storage',
  'vendor',
]);

const HTTP_CALL_PATTERN =
  /\b(?:fetch|ofetch|useFetch|ky|axios)(?:\.[A-Za-z_$][\w$]*)?\s*\(\s*([\s\S]*?)(?=\))/g;
const JQUERY_AJAX_PATTERN = /\$\s*\.\s*ajax\s*\(\s*([\s\S]*?)(?=\))/g;
const HTTP_METHOD_CALL_PATTERN =
  /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\.\s*(?:get|post|put|patch|delete|head|options|request)\s*\(\s*([\s\S]*?)(?=\))/g;

export interface WalkOptions {
  extensions?: string[];
  maxFiles?: number;
}

export async function readJsonFile(filePath: string): Promise<JsonObject | undefined> {
  try {
    const source = await fs.readFile(filePath, 'utf8');
    return JSON.parse(source) as JsonObject;
  } catch {
    return undefined;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function walkFiles(rootDir: string, options: WalkOptions = {}): Promise<string[]> {
  const extensions = options.extensions
    ? new Set(options.extensions.map((extension) => extension.toLowerCase()))
    : undefined;
  const files: string[] = [];

  async function visit(currentDir: string): Promise<void> {
    if (options.maxFiles !== undefined && files.length >= options.maxFiles) {
      return;
    }

    let entries: Dirent<string>[];

    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (options.maxFiles !== undefined && files.length >= options.maxFiles) {
        return;
      }

      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          await visit(entryPath);
        }

        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!extensions || extensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(entryPath);
      }
    }
  }

  await visit(rootDir);
  return files.sort();
}

export function hasDependency(packageJson: JsonObject | undefined, dependencyName: string): boolean {
  if (!packageJson) {
    return false;
  }

  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
    (fieldName) => {
      const dependencies = packageJson[fieldName];
      return isRecord(dependencies) && dependencies[dependencyName] !== undefined;
    },
  );
}

export function hasComposerDependency(composerJson: JsonObject | undefined, packageName: string): boolean {
  if (!composerJson) {
    return false;
  }

  return ['require', 'require-dev'].some((fieldName) => {
    const dependencies = composerJson[fieldName];
    return isRecord(dependencies) && dependencies[packageName] !== undefined;
  });
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createGraphId(prefix: string, value: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .toLowerCase()
    .replace(/[^a-z0-9:_./-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${prefix}:${normalized || 'root'}`;
}

export function normalizeRoute(route: string): string {
  const normalized = route.replace(/\\/g, '/').replace(/\/+/g, '/');

  if (normalized === '' || normalized === '/') {
    return '/';
  }

  return normalized.startsWith('/') ? normalized.replace(/\/$/, '') : `/${normalized.replace(/\/$/, '')}`;
}

export function titleFromRoute(route: string): string {
  if (route === '/') {
    return 'Home';
  }

  const finalSegment = route.split('/').filter(Boolean).at(-1) ?? 'page';
  return finalSegment
    .replace(/^[:*]+/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function readSource(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

export async function safeParseFile(filePath: string, parser: { parseFile: (target: string) => Promise<unknown> }) {
  try {
    await parser.parseFile(filePath);
  } catch {
    // Strategies still provide useful regex-based results when a grammar rejects a file.
  }
}

export function extractHttpApisFromSource(source: string): string[] {
  const apis = new Set<string>();

  collectHttpMatches(source, HTTP_CALL_PATTERN, apis);
  collectHttpMatches(source, HTTP_METHOD_CALL_PATTERN, apis);
  collectHttpMatches(source, JQUERY_AJAX_PATTERN, apis);

  return [...apis].filter(isGraphApiEndpoint);
}

export function isGraphApiEndpoint(endpoint: string): boolean {
  const pathOnly = endpoint.split(/[?#]/)[0]?.toLowerCase().replace(/\/+$|^https?:\/\/[^/]+/g, '') ?? endpoint;
  const segments = pathOnly.split('/').filter(Boolean);
  const lastSegment = segments.at(-1);
  const previousSegment = segments.at(-2);

  if ((lastSegment === 'refresh' || lastSegment === 'logout') && (previousSegment === 'auth' || previousSegment === 'api')) {
    return false;
  }

  return true;
}

export function extractImportedComponents(source: string, filePath: string): ComponentNode[] {
  const imports = extractComponentImports(source, filePath);
  return [...imports.values()];
}

export function extractJsxComponentNames(source: string): string[] {
  const names = new Set<string>();
  const tagPattern = /<([A-Z][A-Za-z0-9_$.]*)(?=[\s/>])/g;
  let match = tagPattern.exec(source);

  while (match) {
    const name = match[1];

    if (name) {
      names.add(name.split('.')[0] ?? name);
    }

    match = tagPattern.exec(source);
  }

  return [...names];
}

export function extractVueComponentNames(source: string): string[] {
  const names = new Set<string>();
  const tagPattern = /<([A-Z][A-Za-z0-9_.]*|[a-z][a-z0-9]*-[a-z0-9-]*)(?=[\s/>])/g;
  let match = tagPattern.exec(source);

  while (match) {
    const name = match[1];

    if (name) {
      names.add(name);
    }

    match = tagPattern.exec(source);
  }

  return [...names];
}

export function extractPhpComponents(source: string, filePath: string): ComponentNode[] {
  const components = new Map<string, ComponentNode>();
  const includePattern = /\b(?:include|require)(?:_once)?\s*(?:\(\s*)?['"]([^'"]+\.php)['"]/g;
  const bladeIncludePattern = /@include\s*\(\s*['"]([^'"]+)['"]/g;
  const bladeComponentPattern = /<x-([a-zA-Z0-9_.:-]+)(?=[\s/>])/g;

  let match = includePattern.exec(source);

  while (match) {
    const includePath = match[1];

    if (includePath) {
      const resolvedPath = path.resolve(path.dirname(filePath), includePath);
      const name = componentNameFromFile(resolvedPath);
      components.set(`${name}:${resolvedPath}`, createComponentNode(name, resolvedPath, includePath));
    }

    match = includePattern.exec(source);
  }

  match = bladeIncludePattern.exec(source);

  while (match) {
    const viewName = match[1];

    if (viewName) {
      const resolvedPath = path.resolve(
        path.dirname(filePath),
        '..',
        viewName.replace(/\./g, path.sep).concat('.blade.php'),
      );
      const name = viewName.split('.').at(-1) ?? viewName;
      components.set(`${name}:${resolvedPath}`, createComponentNode(name, resolvedPath, viewName));
    }

    match = bladeIncludePattern.exec(source);
  }

  match = bladeComponentPattern.exec(source);

  while (match) {
    const componentName = match[1];

    if (componentName) {
      components.set(
        `x-${componentName}:${filePath}`,
        createComponentNode(`x-${componentName}`, filePath, `x-${componentName}`),
      );
    }

    match = bladeComponentPattern.exec(source);
  }

  return [...components.values()];
}

export function createComponentNode(name: string, filePath: string, importedFrom?: string): ComponentNode {
  return {
    id: createGraphId('component', `${filePath}:${name}`),
    type: 'component',
    name,
    filePath,
    importedFrom,
  };
}

export function mergeComponentSignals(
  filePath: string,
  source: string,
  discoveredNames: string[],
): ComponentNode[] {
  const importedComponents = extractComponentImports(source, filePath);
  const components = new Map<string, ComponentNode>();

  for (const component of importedComponents.values()) {
    components.set(component.id, component);
  }

  for (const name of discoveredNames) {
    const imported = importedComponents.get(name);
    const component = imported ?? createComponentNode(name, filePath);
    components.set(component.id, component);
  }

  return [...components.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveImportPath(fromFile: string, importPath: string): string {
  if (!importPath.startsWith('.')) {
    return importPath;
  }

  const basePath = path.resolve(path.dirname(fromFile), importPath);
  const candidates = [
    basePath,
    `${basePath}.tsx`,
    `${basePath}.ts`,
    `${basePath}.jsx`,
    `${basePath}.js`,
    `${basePath}.vue`,
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.jsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.vue'),
  ];

  return candidates[0] ?? basePath;
}

function collectHttpMatches(source: string, pattern: RegExp, apis: Set<string>): void {
  pattern.lastIndex = 0;
  let match = pattern.exec(source);

  while (match) {
    const argumentSource = match[1]?.trim() ?? '';
    const api = extractStaticUrl(argumentSource) ?? (hasLikelyDynamicUrl(argumentSource) ? '<dynamic>' : undefined);

    if (api) {
      apis.add(api);
    }

    match = pattern.exec(source);
  }
}

function hasLikelyDynamicUrl(argumentSource: string): boolean {
  return /^`/.test(argumentSource) || /^['"][^'"]*['"]\s*\+/.test(argumentSource) || /new\s+URL\s*\(/.test(argumentSource);
}

function extractStaticUrl(argumentSource: string): string | undefined {
  const stringValue = extractFirstString(argumentSource);

  if (stringValue) {
    return stringValue;
  }

  const objectUrlMatch = /(?:baseURL|baseUrl|endpoint|path|url|uri)\s*:\s*(['"`])([\s\S]*?)\1/.exec(argumentSource);

  if (objectUrlMatch?.[2]) {
    return normalizeExtractedUrl(objectUrlMatch[2], objectUrlMatch[1]);
  }

  const newUrlMatch = /new\s+URL\s*\(\s*(['"`])([\s\S]*?)\1/.exec(argumentSource);

  if (newUrlMatch?.[2]) {
    return normalizeExtractedUrl(newUrlMatch[2], newUrlMatch[1]);
  }

  return undefined;
}

function extractFirstString(source: string): string | undefined {
  const match = /^(['"`])([\s\S]*?)\1/.exec(source);

  if (!match) {
    return undefined;
  }

  const quote = match[1];
  const value = match[2];

  if (!value) {
    return undefined;
  }

  const normalized = normalizeExtractedUrl(value, quote);
  if (!normalized) {
    return undefined;
  }

  if (/^(['"`])[^'"`]*\1\s*\+/.test(source)) {
    return normalized.endsWith('/') ? `${normalized}:param` : `${normalized}/:param`;
  }

  return normalized;
}

function normalizeExtractedUrl(value: string, quote: string | undefined): string | undefined {
  const normalized = quote === '`' ? value.replace(/\$\{[^}]+\}/g, ':param') : value;
  const trimmed = normalized.trim();

  if (!trimmed || trimmed === ':param') {
    return undefined;
  }

  return trimmed.replace(/\/+:param/g, '/:param').replace(/:param:+/g, ':param');
}

function extractComponentImports(source: string, filePath: string): Map<string, ComponentNode> {
  const imports = new Map<string, ComponentNode>();
  const importPattern =
    /import\s+(?:(?<defaultName>[A-Z][A-Za-z0-9_$]*)\s*,?\s*)?(?:\{(?<named>[^}]+)\})?\s*from\s*['"](?<importPath>[^'"]+)['"]/g;
  let match = importPattern.exec(source);

  while (match) {
    const importPath = match.groups?.importPath;

    if (!importPath) {
      match = importPattern.exec(source);
      continue;
    }

    const resolvedPath = resolveImportPath(filePath, importPath);
    const defaultName = match.groups?.defaultName;

    if (defaultName) {
      imports.set(defaultName, createComponentNode(defaultName, resolvedPath, importPath));
    }

    const namedImports = match.groups?.named?.split(',') ?? [];

    for (const namedImport of namedImports) {
      const importedName = namedImport.trim().split(/\s+as\s+/).at(-1)?.trim();

      if (importedName && /^[A-Z]/.test(importedName)) {
        imports.set(importedName, createComponentNode(importedName, resolvedPath, importPath));
      }
    }

    match = importPattern.exec(source);
  }

  return imports;
}

function componentNameFromFile(filePath: string): string {
  return path.basename(filePath).replace(/\.(blade\.)?[A-Za-z0-9]+$/, '');
}
