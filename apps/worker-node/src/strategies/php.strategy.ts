import path from 'path';
import type { AstParserService } from '../services/parser.service';
import type { ComponentNode, FrameworkStrategy, PageNode, ProjectManifest } from './types';
import {
  createGraphId,
  extractHttpApisFromSource,
  extractPhpComponents,
  normalizeRoute,
  readSource,
  safeParseFile,
  titleFromRoute,
  walkFiles,
} from './utils';

export class PhpStrategy implements FrameworkStrategy {
  readonly name = 'php';

  isMatch(manifest: ProjectManifest): boolean {
    return manifest.markers.some((marker) => marker.endsWith('.php'));
  }

  async extractPages(rootDir: string, astParser: AstParserService): Promise<PageNode[]> {
    const phpFiles = await walkFiles(rootDir, { extensions: ['.php'], maxFiles: 1000 });
    const pageFiles = this.selectPageFiles(rootDir, phpFiles);
    const pages: PageNode[] = [];

    for (const filePath of pageFiles) {
      const route = this.routeFromPhpFile(rootDir, filePath);
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
        links: [],
      });
    }

    return pages.sort((a, b) => a.route.localeCompare(b.route));
  }

  async extractComponents(filePath: string, astParser: AstParserService): Promise<ComponentNode[]> {
    await safeParseFile(filePath, astParser);
    return extractPhpComponents(await readSource(filePath), filePath);
  }

  async extractApis(filePath: string, astParser: AstParserService): Promise<string[]> {
    await safeParseFile(filePath, astParser);
    return extractHttpApisFromSource(await readSource(filePath));
  }

  private selectPageFiles(rootDir: string, phpFiles: string[]): string[] {
    const publicDir = path.join(rootDir, 'public');
    const publicPages = phpFiles.filter((filePath) => filePath.startsWith(publicDir));

    if (publicPages.length > 0) {
      return publicPages;
    }

    return phpFiles.filter((filePath) => path.dirname(filePath) === rootDir);
  }

  private routeFromPhpFile(rootDir: string, filePath: string): string {
    const publicDir = path.join(rootDir, 'public');
    const baseDir = filePath.startsWith(publicDir) ? publicDir : rootDir;
    const relativePath = path
      .relative(baseDir, filePath)
      .replace(/\\/g, '/')
      .replace(/\.php$/, '')
      .replace(/\/index$/, '');

    return normalizeRoute(relativePath === 'index' ? '' : relativePath);
  }
}
