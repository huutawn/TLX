import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { Language, Parser, type Node, type Tree } from 'web-tree-sitter';

type SupportedLanguage = 'typescript' | 'tsx' | 'javascript' | 'vue' | 'php';

export interface AstJsonNode {
  type: string;
  text?: string;
  startPosition: {
    row: number;
    column: number;
  };
  endPosition: {
    row: number;
    column: number;
  };
  startIndex: number;
  endIndex: number;
  children: AstJsonNode[];
}

export interface ParsedFile {
  filePath: string;
  language: SupportedLanguage;
  source: string;
  tree: Tree;
  rootNode: Node;
}

const require = createRequire(import.meta.url);

const LANGUAGE_WASM_FILES: Record<SupportedLanguage, string> = {
  typescript: 'tree-sitter-wasms/out/tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-wasms/out/tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-wasms/out/tree-sitter-javascript.wasm',
  vue: 'tree-sitter-wasms/out/tree-sitter-vue.wasm',
  php: 'tree-sitter-wasms/out/tree-sitter-php.wasm',
};

const EXTENSION_LANGUAGE: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.vue': 'vue',
  '.php': 'php',
};

export class AstParserService {
  private initPromise?: Promise<void>;
  private readonly languages = new Map<SupportedLanguage, Language>();
  private readonly parsedFiles = new Map<string, ParsedFile>();

  /**
   * Parses a supported source file with tree-sitter and caches the parsed tree by path.
   */
  async parseFile(filePath: string): Promise<ParsedFile> {
    const absolutePath = path.resolve(filePath);
    const cached = this.parsedFiles.get(absolutePath);

    if (cached) {
      return cached;
    }

    const languageName = this.getLanguageForFile(absolutePath);
    const source = await fs.readFile(absolutePath, 'utf8');
    const language = await this.loadLanguage(languageName);
    const parser = new Parser();
    parser.setLanguage(language);

    const tree = parser.parse(source);

    if (!tree) {
      throw new Error(`Unable to parse ${absolutePath}`);
    }

    const parsedFile: ParsedFile = {
      filePath: absolutePath,
      language: languageName,
      source,
      tree,
      rootNode: tree.rootNode,
    };

    this.parsedFiles.set(absolutePath, parsedFile);
    return parsedFile;
  }

  /**
   * Converts a parsed file into a compact JSON AST for tests and diagnostics.
   */
  async parseToJson(filePath: string): Promise<AstJsonNode> {
    const parsed = await this.parseFile(filePath);
    return this.nodeToJson(parsed.rootNode);
  }

  /**
   * Finds all AST nodes of one or more tree-sitter node types in a source file.
   */
  async findNodes(filePath: string, types: string | string[]): Promise<Node[]> {
    const parsed = await this.parseFile(filePath);
    return parsed.rootNode.descendantsOfType(types);
  }

  /**
   * Checks whether this service has a configured tree-sitter language for the file.
   */
  supportsFile(filePath: string): boolean {
    return EXTENSION_LANGUAGE[path.extname(filePath).toLowerCase()] !== undefined;
  }

  /**
   * Maps file extensions to the parser language name expected by WASM loading.
   */
  private getLanguageForFile(filePath: string): SupportedLanguage {
    const extension = path.extname(filePath).toLowerCase();
    const language = EXTENSION_LANGUAGE[extension];

    if (!language) {
      throw new Error(`Unsupported parser extension: ${extension}`);
    }

    return language;
  }

  /**
   * Lazily loads and caches the tree-sitter WASM language for a file family.
   */
  private async loadLanguage(languageName: SupportedLanguage): Promise<Language> {
    await this.init();

    const cached = this.languages.get(languageName);

    if (cached) {
      return cached;
    }

    const wasmPath = require.resolve(LANGUAGE_WASM_FILES[languageName]);
    const wasmBytes = await fs.readFile(wasmPath);
    const language = await Language.load(wasmBytes);

    this.languages.set(languageName, language);
    return language;
  }

  /**
   * Initializes web-tree-sitter once and resolves its runtime WASM asset.
   */
  private async init(): Promise<void> {
    this.initPromise ??= Parser.init({
      locateFile(scriptName: string) {
        if (scriptName.endsWith('.wasm')) {
          return require.resolve('web-tree-sitter/web-tree-sitter.wasm');
        }

        return scriptName;
      },
    });

    await this.initPromise;
  }

  /**
   * Serializes an AST subtree while trimming leaf text to keep diagnostics small.
   */
  private nodeToJson(node: Node): AstJsonNode {
    const children = node.children.map((child) => this.nodeToJson(child));
    const text = children.length === 0 ? node.text.trim() : undefined;

    return {
      type: node.type,
      text: text && text.length <= 120 ? text : undefined,
      startPosition: node.startPosition,
      endPosition: node.endPosition,
      startIndex: node.startIndex,
      endIndex: node.endIndex,
      children,
    };
  }
}
