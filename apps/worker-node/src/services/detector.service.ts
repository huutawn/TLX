import fs from 'fs/promises';
import path from 'path';
import { AstParserService } from './parser.service';
import { strategies } from '../strategies';
import type {
  ComponentNode,
  GraphEdge,
  PageNode,
  ProjectManifest,
  ProjectMetadata,
  ScanGraph,
} from '../strategies/types';
import { createGraphId, readJsonFile, walkFiles } from '../strategies/utils';

const DEFAULT_PORTS: Record<string, number> = {
  next: 3000,
  'vue-vite': 5173,
  laravel: 8000,
  php: 8000,
  unknown: 0,
};

export type { ComponentNode, PageNode, ProjectManifest, ProjectMetadata, ScanGraph };

export class DetectorService {
  async detectProject(projectPath: string = process.cwd()): Promise<ProjectMetadata> {
    const rootDir = path.resolve(projectPath);
    const manifest = await this.createManifest(rootDir);
    const strategy = strategies.find((candidate) => candidate.isMatch(manifest));

    if (!strategy) {
      return {
        framework: 'unknown',
        port: DEFAULT_PORTS.unknown ?? 0,
        rootDir,
        scanGraph: this.createScanGraph([]),
      };
    }

    const astParser = new AstParserService();
    const pages = await strategy.extractPages(rootDir, astParser);

    return {
      framework: strategy.name,
      port: DEFAULT_PORTS[strategy.name] ?? DEFAULT_PORTS.unknown ?? 0,
      rootDir,
      scanGraph: this.createScanGraph(pages),
    };
  }

  private async createManifest(rootDir: string): Promise<ProjectManifest> {
    const [packageJson, composerJson, markers] = await Promise.all([
      readJsonFile(path.join(rootDir, 'package.json')),
      readJsonFile(path.join(rootDir, 'composer.json')),
      this.collectMarkers(rootDir),
    ]);

    return {
      packageJson,
      composerJson,
      rootDir,
      markers,
    };
  }

  private async collectMarkers(rootDir: string): Promise<string[]> {
    const knownMarkers = [
      'next.config.js',
      'next.config.mjs',
      'next.config.ts',
      'vite.config.js',
      'vite.config.ts',
      'routes/web.php',
      'artisan',
    ];

    const markerSet = new Set<string>();

    await Promise.all(
      knownMarkers.map(async (marker) => {
        try {
          await fs.access(path.join(rootDir, marker));
          markerSet.add(marker.replace(/\\/g, '/'));
        } catch {
          // Marker absence is expected for most projects.
        }
      }),
    );

    const sourceMarkers = await walkFiles(rootDir, {
      extensions: ['.php', '.vue', '.tsx', '.jsx'],
      maxFiles: 500,
    });

    for (const filePath of sourceMarkers) {
      markerSet.add(path.relative(rootDir, filePath).replace(/\\/g, '/'));
    }

    return [...markerSet].sort();
  }

  private createScanGraph(pages: PageNode[]): ScanGraph {
    const components = new Map<string, ComponentNode>();
    const apis = new Set<string>();
    const edges = new Map<string, GraphEdge>();

    for (const page of pages) {
      for (const component of page.components) {
        components.set(component.id, component);
        const edge: GraphEdge = {
          id: createGraphId('edge', `${page.id}:component:${component.id}`),
          type: 'page_uses_component',
          source: page.id,
          target: component.id,
        };
        edges.set(edge.id, edge);
      }

      for (const api of page.apis) {
        apis.add(api);
        const apiId = createGraphId('api', api);
        const edge: GraphEdge = {
          id: createGraphId('edge', `${page.id}:api:${api}`),
          type: 'page_calls_api',
          source: page.id,
          target: apiId,
          label: api,
        };
        edges.set(edge.id, edge);
      }
    }

    return {
      pages,
      components: [...components.values()],
      apis: [...apis].sort(),
      edges: [...edges.values()],
    };
  }
}
