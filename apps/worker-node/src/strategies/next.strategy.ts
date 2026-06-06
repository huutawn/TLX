import fs from 'fs/promises';
import path from 'path';
import type { AstParserService } from '../services/parser.service';
import type { ComponentNode, FrameworkStrategy, PageNode, ProjectManifest } from './types';
import {
  createGraphId,
  createComponentNode,
  extractHttpApisFromSource,
  extractJsxComponentNames,
  hasDependency,
  normalizeRoute,
  readSource,
  safeParseFile,
  titleFromRoute,
  walkFiles,
} from './utils';

const PAGE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const LOCAL_IMPORT_PREFIXES = ['.', '@/', '~/'];
const MAX_DEPENDENCY_DEPTH = 6;

interface ImportBinding {
  name: string;
  importPath: string;
  resolvedPath?: string;
}

interface PageAnalysis {
  components: ComponentNode[];
  apis: string[];
  links: string[];
}

export class NextStrategy implements FrameworkStrategy {
  readonly name = 'next';

  isMatch(manifest: ProjectManifest): boolean {
    return hasDependency(manifest.packageJson, 'next');
  }

  async extractPages(rootDir: string, astParser: AstParserService): Promise<PageNode[]> {
    const candidateFiles = await walkFiles(rootDir, { extensions: PAGE_EXTENSIONS });
    const pageFiles = candidateFiles.filter((filePath) => this.isNextPageFile(rootDir, filePath));
    const pageFileSet = new Set(pageFiles);
    const pages: PageNode[] = [];

    for (const filePath of pageFiles) {
      const route = this.routeFromFile(rootDir, filePath);
      const analysis = await this.analyzePage(rootDir, filePath, astParser, pageFileSet);

      pages.push({
        id: createGraphId('page', filePath),
        type: 'page',
        name: titleFromRoute(route),
        route,
        filePath,
        framework: this.name,
        components: analysis.components,
        apis: analysis.apis,
        links: analysis.links,
      });
    }

    return pages.sort((a, b) => a.route.localeCompare(b.route));
  }

  async extractComponents(filePath: string, astParser: AstParserService): Promise<ComponentNode[]> {
    await safeParseFile(filePath, astParser);
    const source = await readSource(filePath);
    const jsxNames = new Set(extractJsxComponentNames(source));
    const imports = await this.extractLocalImports(path.dirname(filePath), filePath, source);
    return imports
      .filter((binding) => jsxNames.has(binding.name) && binding.resolvedPath)
      .map((binding) => createComponentNode(binding.name, binding.resolvedPath ?? binding.importPath, binding.importPath));
  }

  async extractApis(filePath: string, astParser: AstParserService): Promise<string[]> {
    await safeParseFile(filePath, astParser);
    return extractHttpApisFromSource(await readSource(filePath));
  }

  async extractApiEndpoints(rootDir: string, _astParser: AstParserService): Promise<string[]> {
    const candidateFiles = await walkFiles(rootDir, { extensions: PAGE_EXTENSIONS });
    const endpoints = new Set<string>();

    for (const filePath of candidateFiles) {
      const endpoint = this.apiRouteFromFile(rootDir, filePath);
      if (endpoint) {
        endpoints.add(endpoint);
      }
    }

    return [...endpoints].sort();
  }

  private isNextPageFile(rootDir: string, filePath: string): boolean {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const routeRootPath = this.stripSrcPrefix(relativePath);

    if (routeRootPath.startsWith('app/')) {
      return /\/page\.(?:ts|tsx|js|jsx)$/.test(routeRootPath);
    }

    if (!routeRootPath.startsWith('pages/') || routeRootPath.startsWith('pages/api/')) {
      return false;
    }

    const basename = path.basename(routeRootPath);
    return !basename.startsWith('_') && !basename.startsWith('.') && PAGE_EXTENSIONS.includes(path.extname(filePath));
  }

  private async analyzePage(rootDir: string, filePath: string, astParser: AstParserService, pageFileSet: Set<string>): Promise<PageAnalysis> {
    const pageId = createGraphId('page', filePath);
    const components = new Map<string, ComponentNode>();
    const apis = new Set<string>();
    const links = new Set<string>();
    const visitedDependencies = new Set<string>();

    const visitFile = async (currentFile: string, parentId: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPENDENCY_DEPTH || visitedDependencies.has(`${parentId}->${currentFile}`)) {
        return;
      }

      visitedDependencies.add(`${parentId}->${currentFile}`);
      await safeParseFile(currentFile, astParser);
      const source = await readSource(currentFile);

      for (const api of extractHttpApisFromSource(source)) {
        apis.add(api);
      }

      for (const link of extractStaticRouteLinks(source)) {
        links.add(link);
      }

      const jsxNames = new Set(extractJsxComponentNames(source));
      const imports = await this.extractLocalImports(rootDir, currentFile, source);

      for (const binding of imports) {
        if (!binding.resolvedPath || pageFileSet.has(binding.resolvedPath)) {
          continue;
        }

        if (jsxNames.has(binding.name)) {
          const component = createComponentNode(binding.name, binding.resolvedPath, binding.importPath);
          addComponentParent(components, component, parentId);
          await visitFile(binding.resolvedPath, component.id, depth + 1);
        } else {
          await visitFile(binding.resolvedPath, parentId, depth + 1);
        }
      }
    };

    await visitFile(filePath, pageId, 0);

    return {
      components: [...components.values()].sort((a, b) => a.name.localeCompare(b.name)),
      apis: [...apis].sort(),
      links: [...links].sort(),
    };
  }

  private async extractLocalImports(rootDir: string, fromFile: string, source: string): Promise<ImportBinding[]> {
    const bindings = parseImportBindings(source).filter((binding) => isLocalImport(binding.importPath));
    const resolved = await Promise.all(
      bindings.map(async (binding) => ({
        ...binding,
        resolvedPath: await this.resolveImportedBinding(rootDir, fromFile, binding.importPath, binding.name),
      })),
    );
    return resolved;
  }

  private async resolveImportedBinding(rootDir: string, fromFile: string, importPath: string, bindingName: string): Promise<string | undefined> {
    const resolved = await resolveImportFile(rootDir, fromFile, importPath);
    if (!resolved) {
      return undefined;
    }

    if (!path.basename(resolved).startsWith('index.')) {
      return resolved;
    }

    const source = await readSource(resolved);
    const reexportPath = extractReexportPath(source, bindingName);
    if (!reexportPath) {
      return resolved;
    }

    return (await resolveImportFile(rootDir, resolved, reexportPath)) ?? resolved;
  }

  private routeFromFile(rootDir: string, filePath: string): string {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const routeRootPath = this.stripSrcPrefix(relativePath);

    if (routeRootPath.startsWith('app/')) {
      const segments = routeRootPath
        .replace(/^app\//, '')
        .replace(/\.(?:ts|tsx|js|jsx)$/, '')
        .split('/')
        .filter((segment) => segment !== 'page');
      return normalizeRoute(this.normalizeNextSegments(segments.join('/')));
    }

    const withoutPrefix = routeRootPath
      .replace(/^pages\//, '')
      .replace(/\.(?:ts|tsx|js|jsx)$/, '')
      .replace(/\/index$/, '');

    return normalizeRoute(this.normalizeNextSegments(withoutPrefix === 'index' ? '' : withoutPrefix));
  }

  private apiRouteFromFile(rootDir: string, filePath: string): string | undefined {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const routeRootPath = this.stripSrcPrefix(relativePath);

    if (routeRootPath.startsWith('app/api/') && /\/route\.(?:ts|tsx|js|jsx)$/.test(routeRootPath)) {
      const routePath = routeRootPath
        .replace(/^app\//, '')
        .replace(/\/route\.(?:ts|tsx|js|jsx)$/, '');
      return normalizeRoute(this.normalizeNextSegments(routePath));
    }

    if (routeRootPath.startsWith('pages/api/')) {
      const routePath = routeRootPath
        .replace(/^pages\//, '')
        .replace(/\.(?:ts|tsx|js|jsx)$/, '')
        .replace(/\/index$/, '');
      return normalizeRoute(this.normalizeNextSegments(routePath === 'api/index' ? 'api' : routePath));
    }

    return undefined;
  }

  private stripSrcPrefix(relativePath: string): string {
    return relativePath.replace(/^src\//, '');
  }

  private normalizeNextSegments(routePath: string): string {
    return routePath
      .split('/')
      .filter((segment) => segment && !segment.startsWith('(') && !segment.startsWith('@'))
      .map((segment) => {
        if (/^\[\[\.\.\..+\]\]$/.test(segment)) {
          return `*${segment.slice(5, -2)}?`;
        }

        if (/^\[\.\.\..+\]$/.test(segment)) {
          return `*${segment.slice(4, -1)}`;
        }

        if (/^\[.+\]$/.test(segment)) {
          return `:${segment.slice(1, -1)}`;
        }

        return segment;
      })
      .join('/');
  }
}

function addComponentParent(components: Map<string, ComponentNode>, component: ComponentNode, parentId: string) {
  const existing = components.get(component.id);
  if (!existing) {
    component.parentId = parentId;
    component.parentIds = [parentId];
    components.set(component.id, component);
    return;
  }

  const parentIds = new Set(existing.parentIds ?? (existing.parentId ? [existing.parentId] : []));
  parentIds.add(parentId);
  existing.parentId = existing.parentId ?? parentId;
  existing.parentIds = [...parentIds];
}

function parseImportBindings(source: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const importPattern = /import\s+(?:type\s+)?(?:(?<defaultName>[A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{(?<named>[^}]+)\})?\s*from\s*['"](?<importPath>[^'"]+)['"]/g;
  let match = importPattern.exec(source);

  while (match) {
    const importPath = match.groups?.importPath;
    if (!importPath) {
      match = importPattern.exec(source);
      continue;
    }

    const defaultName = match.groups?.defaultName;
    if (defaultName) {
      bindings.push({ name: defaultName, importPath });
    }

    for (const namedImport of match.groups?.named?.split(',') ?? []) {
      const name = namedImport.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (name) {
        bindings.push({ name, importPath });
      }
    }

    match = importPattern.exec(source);
  }

  return bindings;
}

function isLocalImport(importPath: string) {
  return LOCAL_IMPORT_PREFIXES.some((prefix) => importPath.startsWith(prefix));
}

async function resolveImportFile(rootDir: string, fromFile: string, importPath: string): Promise<string | undefined> {
  const basePath = importPath.startsWith('@/')
    ? path.join(rootDir, 'src', importPath.slice(2))
    : importPath.startsWith('~/')
      ? path.join(rootDir, importPath.slice(2))
      : path.resolve(path.dirname(fromFile), importPath);

  for (const candidate of importCandidates(basePath)) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Candidate misses are expected.
    }
  }

  return undefined;
}

function importCandidates(basePath: string) {
  return [
    basePath,
    `${basePath}.tsx`,
    `${basePath}.ts`,
    `${basePath}.jsx`,
    `${basePath}.js`,
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.jsx'),
    path.join(basePath, 'index.js'),
  ];
}

function extractReexportPath(source: string, bindingName: string): string | undefined {
  const escaped = bindingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const defaultReexport = new RegExp(`export\\s*\\{[^}]*default\\s+as\\s+${escaped}[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`).exec(source);
  if (defaultReexport?.[1]) {
    return defaultReexport[1];
  }

  const namedReexport = new RegExp(`export\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`).exec(source);
  return namedReexport?.[1];
}

function extractStaticRouteLinks(source: string): string[] {
  const links = new Set<string>();
  const patterns = [
    /\bhref\s*=\s*["']([^"']+)["']/g,
    /\bhref\s*=\s*\{\s*["'`]([^"'`$]+)["'`]\s*\}/g,
    /\b(?:push|replace|redirect)\s*\(\s*["'`]([^"'`$]+)["'`]/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      const route = normalizeStaticRoute(match[1]);
      if (route) {
        links.add(route);
      }
      match = pattern.exec(source);
    }
  }

  return [...links];
}

function normalizeStaticRoute(value: string | undefined): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return undefined;
  }

  const route = value.split(/[?#]/)[0] ?? value;
  return normalizeRoute(route);
}
