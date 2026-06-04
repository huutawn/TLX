import path from 'path';
import type { AstParserService } from '../services/parser.service';
import type { ComponentNode, FrameworkStrategy, PageNode, ProjectManifest } from './types';
import {
  createGraphId,
  extractHttpApisFromSource,
  extractPhpComponents,
  hasComposerDependency,
  normalizeRoute,
  readSource,
  safeParseFile,
  titleFromRoute,
  walkFiles,
} from './utils';

export class LaravelStrategy implements FrameworkStrategy {
  readonly name = 'laravel';

  isMatch(manifest: ProjectManifest): boolean {
    return hasComposerDependency(manifest.composerJson, 'laravel/framework');
  }

  async extractPages(rootDir: string, astParser: AstParserService): Promise<PageNode[]> {
    const routePages = await this.extractRoutePages(rootDir, astParser);
    const pagesByFile = new Map(routePages.map((page) => [page.filePath, page]));
    const bladeFiles = await walkFiles(path.join(rootDir, 'resources', 'views'), {
      extensions: ['.php'],
      maxFiles: 1000,
    });

    for (const filePath of bladeFiles.filter((file) => file.endsWith('.blade.php'))) {
      if (pagesByFile.has(filePath)) {
        continue;
      }

      const route = this.routeFromBlade(rootDir, filePath);
      const [components, apis] = await Promise.all([
        this.extractComponents(filePath, astParser),
        this.extractApis(filePath, astParser),
      ]);

      pagesByFile.set(filePath, {
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

    return [...pagesByFile.values()].sort((a, b) => a.route.localeCompare(b.route));
  }

  async extractComponents(filePath: string, astParser: AstParserService): Promise<ComponentNode[]> {
    await safeParseFile(filePath, astParser);
    return extractPhpComponents(await readSource(filePath), filePath);
  }

  async extractApis(filePath: string, astParser: AstParserService): Promise<string[]> {
    await safeParseFile(filePath, astParser);
    return extractHttpApisFromSource(await readSource(filePath));
  }

  private async extractRoutePages(rootDir: string, astParser: AstParserService): Promise<PageNode[]> {
    const routesFile = path.join(rootDir, 'routes', 'web.php');
    const source = await readSource(routesFile);

    if (!source) {
      return [];
    }

    await safeParseFile(routesFile, astParser);

    const pages: PageNode[] = [];
    const routeViewPattern =
      /Route::(?:get|post|put|patch|delete|match|any)\s*\(\s*['"]([^'"]+)['"][\s\S]{0,500}?view\s*\(\s*['"]([^'"]+)['"]/g;
    let match = routeViewPattern.exec(source);

    while (match) {
      const route = normalizeRoute(match[1] ?? '/');
      const viewName = match[2];

      if (viewName) {
        const filePath = path.join(rootDir, 'resources', 'views', ...viewName.split('.')) + '.blade.php';
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

      match = routeViewPattern.exec(source);
    }

    return pages;
  }

  private routeFromBlade(rootDir: string, filePath: string): string {
    const relativePath = path
      .relative(path.join(rootDir, 'resources', 'views'), filePath)
      .replace(/\\/g, '/')
      .replace(/\.blade\.php$/, '')
      .replace(/\/index$/, '');

    return normalizeRoute(relativePath === 'index' ? '' : relativePath);
  }
}
