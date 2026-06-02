import { Command } from 'commander';
import uiCommand, { startTlx } from './commands/ui.command';

const program = new Command();

program
  .name('tlx')
  .description('Local-First UI/UX Testing & Mapping Engine')
  .version('1.0.0')
  .option('-p, --port <port>', 'Dashboard/API port', '6532')
  .option('--project <path>', 'Project root can detect')
  .option('--target-url <url>', 'URL app dang chay de Playwright scan')
  .option('--no-start-target', 'Khong tu start app target')
  .option('--no-open', 'Khong tu mo trinh duyet')
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
