import { startTlx, type StartTlxOptions } from './commands/ui.command';

interface ParsedWorkerOptions extends StartTlxOptions {
  help: boolean;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value) ? true : ['0', 'false', 'no', 'off'].includes(value) ? false : fallback;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionValue(args: string[], index: number, optionName: string): string | undefined {
  const current = args[index];
  if (!current) {
    return undefined;
  }

  const prefix = `${optionName}=`;
  if (current.startsWith(prefix)) {
    return current.slice(prefix.length);
  }

  if (current === optionName) {
    return args[index + 1];
  }

  return undefined;
}

function parseWorkerOptions(args: string[]): ParsedWorkerOptions {
  const options: ParsedWorkerOptions = {
    dashboardPort: readNumberEnv('TLX_WORKER_PORT', 6532),
    help: false,
    open: readBooleanEnv('TLX_WORKER_OPEN', false),
    projectPath: process.env.TLX_WORKER_PROJECT,
    startTarget: readBooleanEnv('TLX_WORKER_START_TARGET', true),
    targetUrl: process.env.TLX_WORKER_TARGET_URL,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    const port = readOptionValue(args, index, '--port');
    if (port) {
      const parsed = Number.parseInt(port, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.dashboardPort = parsed;
      }
      if (arg === '--port') {
        index += 1;
      }
      continue;
    }

    const project = readOptionValue(args, index, '--project');
    if (project) {
      options.projectPath = project;
      if (arg === '--project') {
        index += 1;
      }
      continue;
    }

    const targetUrl = readOptionValue(args, index, '--target-url');
    if (targetUrl) {
      options.targetUrl = targetUrl;
      if (arg === '--target-url') {
        index += 1;
      }
      continue;
    }

    if (arg === '--open') {
      options.open = true;
      continue;
    }

    if (arg === '--no-open') {
      options.open = false;
      continue;
    }

    if (arg === '--start-target') {
      options.startTarget = true;
      continue;
    }

    if (arg === '--no-start-target') {
      options.startTarget = false;
    }
  }

  return options;
}

function printHelp() {
  console.log(`TLX internal worker

Usage:
  bun apps/worker-node/src/worker.ts [options]

Options:
  --port <port>           Dashboard/API port
  --project <path>        Project root for detection
  --target-url <url>      Running app URL for scanner
  --no-start-target       Do not start target app
  --open / --no-open      Let worker open dashboard browser
`);
}

const options = parseWorkerOptions(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

startTlx(options).catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[TLX worker] ${message}`);
  process.exit(1);
});
