import { Command } from 'commander';
import { exec, spawn, type ChildProcess } from 'child_process';
import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { createServer } from '../server/index';
import { DetectorService } from '../services/detector.service';
import type { ProjectMetadata } from '../services/detector.service';
import type { TlxRuntimeContext } from '../services/runtime-context.service';

const DEFAULT_DASHBOARD_PORT = 6532;
const TARGET_START_TIMEOUT_MS = 30_000;

export interface StartTlxOptions {
  dashboardPort?: number;
  open?: boolean;
  projectPath?: string;
  startTarget?: boolean;
  targetUrl?: string;
}

interface TargetProcess {
  command: string;
  process: ChildProcess;
  url: string;
}

function signalTargetProcess(targetProcess: TargetProcess | undefined, signal: NodeJS.Signals = 'SIGINT'): boolean {
  const pid = targetProcess?.process.pid;
  if (!targetProcess || !pid) {
    return false;
  }

  if (process.platform === 'win32') {
    return targetProcess.process.kill(signal);
  }

  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return targetProcess.process.kill(signal);
  }
}

function forceKillTargetProcess(targetProcess: TargetProcess | undefined) {
  const pid = targetProcess?.process.pid;
  if (!targetProcess || !pid) {
    return;
  }

  if (process.platform === 'win32') {
    exec(`taskkill /PID ${pid} /T /F`, (err) => {
      if (err) {
        targetProcess.process.kill('SIGKILL');
      }
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    targetProcess.process.kill('SIGKILL');
  }
}

async function stopTargetProcess(targetProcess: TargetProcess | undefined): Promise<void> {
  if (!targetProcess) {
    console.log('[TLX] Target app was not started by TLX. Leaving it running.');
    return;
  }

  if (!targetProcess.process.pid || targetProcess.process.exitCode !== null || targetProcess.process.killed) {
    return;
  }

  console.log(`[TLX] Stopping target app started by TLX: ${targetProcess.url}`);
  const exited = waitForProcessExit(targetProcess.process);
  signalTargetProcess(targetProcess, 'SIGINT');

  if (await waitWithTimeout(exited, 5_000)) {
    console.log('[TLX] Target app stopped.');
    return;
  }

  console.log('[TLX] Target app did not stop after SIGINT. Forcing shutdown...');
  forceKillTargetProcess(targetProcess);
  await waitWithTimeout(exited, 2_000);
}

function waitForProcessExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    child.once('exit', () => resolve());
  });
}

function waitWithTimeout(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    }).catch(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function openBrowser(url: string) {
  const startCmd =
    os.platform() === 'win32' ? `start ${url}` : os.platform() === 'darwin' ? `open ${url}` : `xdg-open ${url}`;

  exec(startCmd, (err) => {
    if (err) {
      console.error('[TLX] Failed to open browser:', err.message);
    }
  });
}

function resolveProjectUrl(port: number, targetUrl?: string): string {
  if (targetUrl) {
    return targetUrl;
  }

  return port > 0 ? `http://localhost:${port}` : 'http://localhost:3000';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(rootDir: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(host: string, port: number, timeoutMs = TARGET_START_TIMEOUT_MS): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Target app did not open port ${port} after ${timeoutMs / 1000}s`);
}

async function waitForTargetReady(child: ChildProcess, host: string, port: number): Promise<void> {
  let earlyExit: { code: number | null; signal: NodeJS.Signals | null } | undefined;

  child.once('exit', (code, signal) => {
    earlyExit = { code, signal };
  });

  const startedAt = Date.now();

  while (Date.now() - startedAt < TARGET_START_TIMEOUT_MS) {
    if (earlyExit) {
      throw new Error(
        `Target app start bi dung som (code ${earlyExit.code ?? 'null'}, signal ${earlyExit.signal ?? 'null'}). ` +
        'Check target project dependencies, for example run install first.',
      );
    }

    if (await isPortOpen(host, port)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Target app did not open port ${port} after ${TARGET_START_TIMEOUT_MS / 1000}s`);
}

async function detectPackageManager(rootDir: string): Promise<string> {
  const packageJson = await readPackageJson(rootDir);
  const packageManager = typeof packageJson?.packageManager === 'string' ? packageJson.packageManager : '';

  if (packageManager.startsWith('bun@')) {
    return 'bun';
  }

  if (packageManager.startsWith('pnpm@')) {
    return 'pnpm';
  }

  if (packageManager.startsWith('yarn@')) {
    return 'yarn';
  }

  if (await fileExists(path.join(rootDir, 'bun.lock')) || await fileExists(path.join(rootDir, 'bun.lockb'))) {
    return 'bun';
  }

  if (await fileExists(path.join(rootDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  if (await fileExists(path.join(rootDir, 'yarn.lock'))) {
    return 'yarn';
  }

  return 'npm';
}

async function resolveTargetStartCommand(project: ProjectMetadata): Promise<string | undefined> {
  if (project.framework === 'next' || project.framework === 'vue-vite') {
    const packageJson = await readPackageJson(project.rootDir);
    const scripts = packageJson?.scripts;

    if (!scripts || typeof scripts !== 'object' || !('dev' in scripts)) {
      return undefined;
    }

    const packageManager = await detectPackageManager(project.rootDir);
    return `${packageManager} run dev`;
  }

  if (project.framework === 'laravel') {
    return `php artisan serve --host=127.0.0.1 --port=${project.port}`;
  }

  if (project.framework === 'php') {
    const publicDir = path.join(project.rootDir, 'public');
    const docRoot = (await fileExists(publicDir)) ? 'public' : '.';
    return `php -S 127.0.0.1:${project.port} -t ${docRoot}`;
  }

  return undefined;
}

async function maybeStartTarget(project: ProjectMetadata, projectUrl: string, shouldStart: boolean): Promise<TargetProcess | undefined> {
  if (!shouldStart || project.port <= 0) {
    return undefined;
  }

  const url = new URL(projectUrl);
  const host = url.hostname || 'localhost';
  const port = Number.parseInt(url.port, 10);

  if (!Number.isFinite(port) || port <= 0) {
    return undefined;
  }

  if (await isPortOpen(host, port)) {
    console.log(`[TLX] Target app is already running at ${projectUrl}`);
    return undefined;
  }

  const command = await resolveTargetStartCommand(project);

  if (!command) {
    console.log('[TLX] No start command was found for the target app. Run it separately or pass --target-url.');
    return undefined;
  }

  console.log(`[TLX] Target app is not running. Starting: ${command}`);
  const child = spawn(command, {
    cwd: project.rootDir,
    detached: process.platform !== 'win32',
    env: { ...process.env, PORT: String(project.port), HOST: '127.0.0.1' },
    shell: true,
    stdio: 'inherit',
  });

  await waitForTargetReady(child, host, port);
  console.log(`[TLX] Target app is ready at ${projectUrl}`);

  return {
    command,
    process: child,
    url: projectUrl,
  };
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
  const projectUrl = resolveProjectUrl(project.port, options.targetUrl);
  const targetProcess = await maybeStartTarget(project, projectUrl, options.startTarget !== false && !options.targetUrl);
  const context: TlxRuntimeContext = {
    dashboardPort,
    project,
    projectUrl,
    startedAt: new Date().toISOString(),
  };

  printStartupSummary(context);

  const app = createServer(context);
  const server = app.listen(dashboardPort, 'localhost', () => {
    console.log(`[TLX] Local server is listening at: http://localhost:${dashboardPort}`);

    if (options.open !== false) {
      openBrowser(`http://localhost:${dashboardPort}`);
    }
  });

  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log('\n[TLX] Shutting down local server...');
    await stopTargetProcess(targetProcess);
    server.close(() => {
      console.log('[TLX] Local server stopped.');
    });
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  return new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('close', resolve);
  });
}

const uiCommand = new Command('ui')
  .alias('ui:start')
  .description('TLX dashboard is running')
  .option('-p, --port <port>', 'Dashboard/API port', `${DEFAULT_DASHBOARD_PORT}`)
  .option('--project <path>', 'Project root to detect')
  .option('--target-url <url>', 'Running app URL for Playwright scan')
  .option('--no-start-target', 'Do not auto-start the target app')
  .option('--no-open', 'Do not open the browser automatically')
  .action(async (options: { port: string; project?: string; targetUrl?: string; startTarget: boolean; open: boolean }) => {
    await startTlx({
      dashboardPort: Number.parseInt(options.port, 10),
      open: options.open,
      projectPath: options.project,
      startTarget: options.startTarget,
      targetUrl: options.targetUrl,
    });
  });

export default uiCommand;
