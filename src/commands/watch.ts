import chalk from 'chalk';
import chokidar from 'chokidar';
import * as path from 'path';
import ora from 'ora';
import {
  cliHeader,
  sectionHeader,
  progressBar,
  formatTokens,
  formatDuration,
  kvPair,
} from '../utils/format.js';
import { getClaudeDir, parseHistory, HistoryMessage } from '../data/parser.js';
import { getCurrentSession, getTodayUsage } from '../data/aggregator.js';
import {
  estimateSessionQuota,
  estimateDailyQuota,
  estimateWeeklyQuota,
} from '../data/estimator.js';
import {
  alertSessionQuota,
  alertDailyQuota,
  alertWeeklyQuota,
} from '../utils/notify.js';
import { loadConfig } from '../config/store.js';

interface WatchOptions {
  daemon?: boolean;
}

export async function watchCommand(options: WatchOptions): Promise<void> {
  const isDaemon = options.daemon || false;

  if (isDaemon) {
    await runDaemon();
  } else {
    await runForeground();
  }
}

// Foreground mode: live terminal updates
async function runForeground(): Promise<void> {
  console.log(cliHeader('Live monitoring'));
  console.log();
  console.log(chalk.dim('  Watching for activity... (Ctrl+C to stop)'));
  console.log();

  const historyPath = path.join(getClaudeDir(), 'history.jsonl');

  // Initial display
  await refreshDisplay();

  // Watch for changes
  const watcher = chokidar.watch(historyPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('change', async () => {
    await refreshDisplay();
    await checkAlerts();
  });

  watcher.on('error', (error) => {
    console.error(chalk.red(`  Watch error: ${error.message}`));
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log();
    console.log(chalk.dim('  Stopped'));
    watcher.close();
    process.exit(0);
  });

  // Periodic refresh every 30 seconds
  setInterval(async () => {
    await refreshDisplay();
  }, 30000);
}

// Refresh the terminal display
async function refreshDisplay(): Promise<void> {
  // Clear screen and move cursor to top
  process.stdout.write('\x1B[2J\x1B[0f');

  console.log(cliHeader('Live monitoring'));
  console.log();

  const [session, sessionQuota, weeklyQuota] = await Promise.all([
    getCurrentSession(),
    estimateSessionQuota(),
    estimateWeeklyQuota(),
  ]);

  // Session
  console.log(sectionHeader('Session'));
  console.log();

  if (session && sessionQuota) {
    const sessionAge = Date.now() - session.startTime.getTime();
    const sessionPercent = Math.round(sessionQuota.tokens.percentUsed);

    console.log(`  ${progressBar(sessionPercent, 20, { showPercent: true })}`);
    console.log();

    const stats = [
      kvPair('Duration', formatDuration(sessionAge)),
      kvPair('Messages', session.messageCount.toString()),
    ];
    console.log(`  ${stats.join('   ')}`);
  } else {
    console.log(chalk.dim('  No active session'));
  }

  // Weekly
  console.log();
  console.log(sectionHeader('Weekly'));
  console.log();

  const weeklyPercent = Math.round(weeklyQuota.tokens.percentUsed);
  console.log(`  ${progressBar(weeklyPercent, 20, { showPercent: true })}`);
  console.log();

  const weekStats = [
    kvPair('Used', formatTokens(weeklyQuota.tokens.used)),
    kvPair('Remaining', formatTokens(weeklyQuota.tokens.remaining)),
    kvPair('Resets in', `${weeklyQuota.daysRemaining}d`),
  ];
  console.log(`  ${weekStats.join('   ')}`);

  // Footer
  console.log();
  console.log(chalk.dim(`  Updated ${new Date().toLocaleTimeString()}`));
}

// Check and trigger alerts
async function checkAlerts(): Promise<void> {
  const [sessionQuota, dailyQuota, weeklyQuota] = await Promise.all([
    estimateSessionQuota(),
    estimateDailyQuota(),
    estimateWeeklyQuota(),
  ]);

  if (sessionQuota) {
    alertSessionQuota(sessionQuota.tokens.percentUsed);
  }

  alertDailyQuota(dailyQuota.tokens.percentUsed);
  alertWeeklyQuota(weeklyQuota.tokens.percentUsed, weeklyQuota.daysRemaining);
}

// Daemon mode: run silently in background, only trigger alerts
async function runDaemon(): Promise<void> {
  console.log(cliHeader('Daemon mode'));
  console.log();

  const historyPath = path.join(getClaudeDir(), 'history.jsonl');

  const watcher = chokidar.watch(historyPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  const spinner = ora({
    text: chalk.dim('Monitoring...'),
    color: 'cyan',
  }).start();

  let messageCount = 0;

  watcher.on('change', async () => {
    messageCount++;
    spinner.text = chalk.dim(`Monitoring... (${messageCount} updates)`);
    await checkAlerts();
  });

  watcher.on('error', (error) => {
    spinner.fail(`Watch error: ${error.message}`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    spinner.stop();
    console.log(chalk.dim('  Stopped'));
    watcher.close();
    process.exit(0);
  });

  // Periodic check every 5 minutes
  setInterval(async () => {
    await checkAlerts();
  }, 5 * 60 * 1000);
}
