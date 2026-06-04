import path from 'path';
import type { AstParserService } from '../services/parser.service';
import type { ComponentNode, FrameworkStrategy, PageNode, ProjectManifest } from './types';
import {
  createGraphId,
  extractHttpApisFromSource,
  extractJsxComponentNames,
  hasDependency,
  mergeComponentSignals,
  normalizeRoute,
  readSource,
  safeParseFile,
  titleFromRoute,
  walkFiles,
} from './utils';

const PAGE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

export class NextStrategy implements FrameworkStrategy {
  readonly name = 'next';

  isMatch(manifest: ProjectManifest): boolean {
    return hasDependency(manifest.packageJson, 'next');
  }

  async extractPages(rootDir: string, astParser: AstParserService): Promise<PageNode[]> {
    const candidateFiles = await walkFiles(rootDir, { extensions: PAGE_EXTENSIONS });
    const pageFiles = candidateFiles.filter((filePath) => this.isNextPageFile(rootDir, filePath));
    const pages: PageNode[] = [];

    for (const filePath of pageFiles) {
      const route = this.routeFromFile(rootDir, filePath);
      const [components, apis] = await Promise.all([
        this.extractComponents(filePath, astParser),
        this.extractApis(filePath, astParser),
      ]);

      pages.push({
        id: createGraphId('page', filePath),
        type: 'page',
        name: titleFromRoute(route),
        route,
        filePath,
        framework: this.name,
        components,
        apis,
      });
    }

    return pages.sort((a, b) => a.route.localeCompare(b.route));
  }

  async extractComponents(filePath: string, astParser: AstParserService): Promise<ComponentNode[]> {
    await safeParseFile(filePath, astParser);
    const source = await readSource(filePath);
    return mergeComponentSignals(filePath, source, extractJsxComponentNames(source));
  }

  async extractApis(filePath: string, astParser: AstParserService): Promise<string[]> {
    await safeParseFile(filePath, astParser);
    return extractHttpApisFromSource(await readSource(filePath));
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
