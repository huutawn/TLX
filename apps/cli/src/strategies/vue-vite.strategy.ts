import path from 'path';
import type { AstParserService } from '../services/parser.service';
import type { ComponentNode, FrameworkStrategy, PageNode, ProjectManifest } from './types';
import {
  createGraphId,
  extractHttpApisFromSource,
  extractVueComponentNames,
  hasDependency,
  mergeComponentSignals,
  normalizeRoute,
  readSource,
  resolveImportPath,
  safeParseFile,
  titleFromRoute,
  walkFiles,
} from './utils';

const VIEW_EXTENSIONS = ['.vue', '.ts', '.tsx', '.js', '.jsx'];

export class VueViteStrategy implements FrameworkStrategy {
  readonly name = 'vue-vite';

  isMatch(manifest: ProjectManifest): boolean {
    return (
      hasDependency(manifest.packageJson, 'vue') &&
      (hasDependency(manifest.packageJson, 'vite') || hasDependency(manifest.packageJson, '@vitejs/plugin-vue'))
    );
  }

  async extractPages(rootDir: string, astParser: AstParserService): Promise<PageNode[]> {
    const routeMap = await this.extractRouterMap(rootDir);
    const files = await walkFiles(rootDir, { extensions: VIEW_EXTENSIONS });
    const pageFiles = files.filter((filePath) => {
      const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
      return relativePath.startsWith('src/pages/') || relativePath.startsWith('src/views/');
    });

    const pages: PageNode[] = [];

    for (const filePath of pageFiles) {
      const route = routeMap.get(filePath) ?? this.routeFromViewFile(rootDir, filePath);
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
    return mergeComponentSignals(filePath, source, extractVueComponentNames(source));
  }

  async extractApis(filePath: string, astParser: AstParserService): Promise<string[]> {
    await safeParseFile(filePath, astParser);
    return extractHttpApisFromSource(await readSource(filePath));
  }

  private routeFromViewFile(rootDir: string, filePath: string): string {
    const relativePath = path
      .relative(path.join(rootDir, 'src'), filePath)
      .replace(/\\/g, '/')
      .replace(/^(pages|views)\//, '')
      .replace(/\.(?:vue|ts|tsx|js|jsx)$/, '')
      .replace(/\/index$/, '');

    return normalizeRoute(relativePath === 'index' ? '' : relativePath.toLowerCase());
  }

  private async extractRouterMap(rootDir: string): Promise<Map<string, string>> {
    const routerFiles = (
      await walkFiles(path.join(rootDir, 'src'), {
        extensions: ['.ts', '.js'],
        maxFiles: 200,
      })
    ).filter((filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/').includes('router'));
    const routeMap = new Map<string, string>();

    for (const routerFile of routerFiles) {
      const source = await readSource(routerFile);
      const importMap = this.extractImportMap(source, routerFile);
      const routePattern = /path\s*:\s*['"]([^'"]+)['"][\s\S]{0,600}?component\s*:\s*([^,\n}]+)/g;
      let match = routePattern.exec(source);

      while (match) {
        const route = match[1];
        const componentExpression = match[2]?.trim();
        const componentFile = this.resolveRouterComponent(componentExpression, importMap, routerFile);

        if (route && componentFile) {
          routeMap.set(componentFile, normalizeRoute(route));
        }

        match = routePattern.exec(source);
      }
    }

    return routeMap;
  }

  private extractImportMap(source: string, routerFile: string): Map<string, string> {
    const importMap = new Map<string, string>();
    const importPattern = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;
    let match = importPattern.exec(source);

    while (match) {
      const name = match[1];
      const importPath = match[2];

      if (name && importPath) {
        importMap.set(name, resolveImportPath(routerFile, importPath));
      }

      match = importPattern.exec(source);
    }

    return importMap;
  }

  private resolveRouterComponent(
    componentExpression: string | undefined,
    importMap: Map<string, string>,
    routerFile: string,
  ): string | undefined {
    if (!componentExpression) {
      return undefined;
    }

    const importCallMatch = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(componentExpression);

    if (importCallMatch?.[1]) {
      return resolveImportPath(routerFile, importCallMatch[1]);
    }

    const identifier = /^[A-Za-z_$][\w$]*/.exec(componentExpression)?.[0];
    return identifier ? importMap.get(identifier) : undefined;
  }
}
