import { Command } from 'commander';
import uiCommand, { startTlx } from './commands/ui.command';

const program = new Command();

program
  .name('tlx')
  .description('Local-First UI/UX Testing & Mapping Engine')
  .version('1.0.0')
  .option('-p, --port <port>', 'Dashboard/API port', '6532')
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

program.addCommand(uiCommand);

program.parse(process.argv);
