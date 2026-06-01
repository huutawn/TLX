import { Command } from 'commander';
import { exec } from 'child_process';
import os from 'os';
import { createServer } from '../server/index';
import { DetectorService } from '../services/detector.service';
import type { TlxRuntimeContext } from '../services/runtime-context.service';

const DEFAULT_DASHBOARD_PORT = 6532;

export interface StartTlxOptions {
  dashboardPort?: number;
  open?: boolean;
  projectPath?: string;
  targetUrl?: string;
}

function openBrowser(url: string) {
  const startCmd =
    os.platform() === 'win32' ? `start ${url}` : os.platform() === 'darwin' ? `open ${url}` : `xdg-open ${url}`;

  exec(startCmd, (err) => {
    if (err) {
      console.error('[TLX] Khong the mo trinh duyet:', err.message);
    }
  });
}

function resolveProjectUrl(port: number, targetUrl?: string): string {
  if (targetUrl) {
    return targetUrl;
  }

  return port > 0 ? `http://localhost:${port}` : 'http://localhost:3000';
}

function printStartupSummary(context: TlxRuntimeContext) {
  const graph = context.project.scanGraph;

  console.log('=== TLX ENGINE STARTING ===');
  console.log(`[TLX] Framework: ${context.project.framework}`);
  console.log(`[TLX] Project root: ${context.project.rootDir}`);
  console.log(`[TLX] Project URL: ${context.projectUrl}`);
  console.log(`[TLX] Dashboard: http://localhost:${context.dashboardPort}`);
  console.log(`[TLX] Pages: ${graph.pages.length}`);
  console.log(`[TLX] Components: ${graph.components.length}`);
  console.log(`[TLX] APIs: ${graph.apis.length}`);
}

export async function startTlx(options: StartTlxOptions = {}) {
  const dashboardPort = options.dashboardPort ?? DEFAULT_DASHBOARD_PORT;
  const detector = new DetectorService();
  const project = await detector.detectProject(options.projectPath ?? process.cwd());
  const context: TlxRuntimeContext = {
    dashboardPort,
    project,
    projectUrl: resolveProjectUrl(project.port, options.targetUrl),
    startedAt: new Date().toISOString(),
  };

  printStartupSummary(context);

  const app = createServer(context);
  const server = app.listen(dashboardPort, 'localhost', () => {
    console.log(`[TLX] Local server dang mo tai: http://localhost:${dashboardPort}`);

    if (options.open !== false) {
      openBrowser(`http://localhost:${dashboardPort}`);
    }
  });

  process.on('SIGINT', () => {
    console.log('\n[TLX] Dang tat local server...');
    server.close(() => {
      console.log('[TLX] Local server da tat.');
      process.exit(0);
    });
  });
}

const uiCommand = new Command('ui')
  .alias('ui:start')
  .description('TLX dashboard is running')
  .option('-p, --port <port>', 'Dashboard/API port', `${DEFAULT_DASHBOARD_PORT}`)
  .option('--project <path>', 'Project root can detect')
  .option('--target-url <url>', 'URL app dang chay de Playwright scan')
  .option('--no-open', 'Khong tu mo trinh duyet')
  .action(async (options: { port: string; project?: string; targetUrl?: string; open: boolean }) => {
    await startTlx({
      dashboardPort: Number.parseInt(options.port, 10),
      open: options.open,
      projectPath: options.project,
      targetUrl: options.targetUrl,
    });
  });

export default uiCommand;
