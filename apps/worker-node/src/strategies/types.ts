import type { AstParserService } from '../services/parser.service';

export type JsonObject = Record<string, unknown>;

export interface ProjectManifest {
  rootDir: string;
  packageJson?: JsonObject;
  composerJson?: JsonObject;
  markers: string[];
}

export interface ComponentNode {
  id: string;
  type: 'component';
  name: string;
  filePath: string;
  importedFrom?: string;
}

export interface PageNode {
  id: string;
  type: 'page';
  name: string;
  route: string;
  filePath: string;
  framework: string;
  components: ComponentNode[];
  apis: string[];
}

export type GraphEdgeType = 'page_uses_component' | 'page_calls_api';

export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  source: string;
  target: string;
  label?: string;
}

export interface ScanGraph {
  pages: PageNode[];
  components: ComponentNode[];
  apis: string[];
  edges: GraphEdge[];
}

export interface ProjectMetadata {
  framework: string;
  port: number;
  rootDir: string;
  scanGraph: ScanGraph;
}

export interface FrameworkStrategy {
  name: string;
  isMatch(manifest: ProjectManifest): boolean;
  extractPages(rootDir: string, astParser: AstParserService): Promise<PageNode[]>;
  extractComponents(filePath: string, astParser: AstParserService): Promise<ComponentNode[]>;
  extractApis(filePath: string, astParser: AstParserService): Promise<string[]>;
}
