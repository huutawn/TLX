import { Command } from 'commander';
import uiCommand from './commands/ui.command';

const program = new Command();

program
  .name('tlx')
  .description('Local-First UI/UX Testing & Mapping Engine')
  .version('1.0.0');

// Nhúng lệnh ui vào hệ thống CLI chính
program.addCommand(uiCommand);

program.parse(process.argv);