#!/usr/bin/env node

import { Command } from 'commander';
import { weekCommand } from './commands/week.js';
import { watchCommand } from './commands/watch.js';
import { historyCommand } from './commands/history.js';
import { configCommand } from './commands/config.js';
import { calibrateCommand } from './commands/calibrate.js';

const program = new Command();

program
  .name('claudometer')
  .description('Usage analytics and alerts for Claude Code Pro')
  .version('1.0.0');

program
  .command('history')
  .description('Show usage trends and patterns (default)')
  .option('-d, --days <number>', 'Number of days to show (default: 7)', '7')
  .option('-p, --projects', 'Show per-project breakdown')
  .option('-s, --sessions', 'Show session history')
  .action(async (options) => {
    await historyCommand({
      days: parseInt(options.days, 10),
      projects: options.projects,
      sessions: options.sessions,
    });
  });

program
  .command('week')
  .description('Show weekly breakdown and forecast')
  .action(async () => {
    await weekCommand();
  });

program
  .command('watch')
  .description('Live monitoring with alerts')
  .option('-d, --daemon', 'Run in background daemon mode (alerts only)')
  .action(async (options) => {
    await watchCommand(options);
  });

program
  .command('config')
  .description('Manage configuration and plan limits')
  .option('--show', 'Show current configuration (default)')
  .option('--reset', 'Reset configuration to defaults')
  .option('--plan <type>', 'Set plan type (pro, free, custom)')
  .option('--set <key=value>', 'Set a specific configuration value')
  .action(async (options) => {
    await configCommand(options);
  });

program
  .command('calibrate')
  .description('Calibrate limits using values from /usage command')
  .option('-s, --session <percent>', 'Session usage % from /usage')
  .option('-w, --weekly <percent>', 'Weekly usage % from /usage')
  .option('-r, --reset <day>', 'Weekly reset day (e.g., wed, thursday)')
  .action(async (options) => {
    await calibrateCommand(options);
  });

// Default command (no arguments) - show history
program
  .action(async () => {
    await historyCommand({ days: 7 });
  });

program.parse();
