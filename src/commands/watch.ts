import chalk from 'chalk';
import chokidar from 'chokidar';
import * as path from 'path';
import ora from 'ora';
import {
  cliHeader,
  sectionHeader,
  divider,
  tableRow,
  progressBar,
  formatTokens,
  formatDuration,
  warning,
  success,
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
  console.log(cliHeader());
  console.log();
  console.log(chalk.dim('Watching for Claude Code activity... (Ctrl+C to stop)'));
  console.log();

  const historyPath = path.join(getClaudeDir(), 'history.jsonl');

  let lastMessageCount = 0;
  let currentSessionId: string | null = null;

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
    console.error(chalk.red(`Watch error: ${error.message}`));
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log();
    console.log(chalk.dim('Stopping watch mode...'));
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

  console.log(cliHeader());
  console.log();
  console.log(chalk.dim(`Last updated: ${new Date().toLocaleTimeString()}`));
  console.log();

  const [session, todayUsage, sessionQuota, dailyQuota, weeklyQuota] = await Promise.all([
    getCurrentSession(),
    getTodayUsage(),
    estimateSessionQuota(),
    estimateDailyQuota(),
    estimateWeeklyQuota(),
  ]);

  // Current Session
  if (session) {
    const sessionAge = Date.now() - session.startTime.getTime();
    const sessionAgeStr = formatDuration(sessionAge);

    console.log(sectionHeader(`Current Session (${sessionAgeStr})`));

    console.log(tableRow('Messages', `${session.userMessages} / ${session.assistantMessages}`));
    console.log(tableRow('Est. Tokens', formatTokens(session.estimatedTokens)));

    if (sessionQuota) {
      const usedPercent = Math.round(sessionQuota.tokens.percentUsed);
      let barColor = chalk.green;
      if (sessionQuota.warningLevel === 'critical') barColor = chalk.red;
      else if (sessionQuota.warningLevel === 'warning') barColor = chalk.yellow;

      console.log(tableRow('Quota', barColor(progressBar(usedPercent, 15, { showPercent: true }))));
    }
  } else {
    console.log(chalk.dim('No active session'));
  }

  console.log();
  console.log(divider());
  console.log();

  // Today
  console.log(sectionHeader('Today'));
  console.log(tableRow('Sessions', String(todayUsage.sessions)));
  console.log(tableRow('Messages', String(todayUsage.messages)));
  console.log(tableRow('Tokens', formatTokens(todayUsage.estimatedTokens)));

  const dailyPercent = Math.round(dailyQuota.tokens.percentUsed);
  console.log(tableRow('Daily Quota', progressBar(dailyPercent, 15, { showPercent: true })));

  console.log();
  console.log(divider());
  console.log();

  // Week
  console.log(sectionHeader('This Week'));
  const weeklyPercent = Math.round(weeklyQuota.tokens.percentUsed);
  console.log(tableRow('Used', progressBar(weeklyPercent, 15, { showPercent: true })));
  console.log(tableRow('Remaining', formatTokens(weeklyQuota.tokens.remaining)));
  console.log(tableRow('Days Left', `${weeklyQuota.daysRemaining}`));

  console.log();
  console.log(chalk.dim('Watching for changes...'));
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
  console.log(chalk.dim('Starting daemon mode...'));
  console.log(chalk.dim('Alerts will be triggered via system notifications.'));
  console.log(chalk.dim('Press Ctrl+C to stop.'));
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
    text: 'Monitoring Claude Code usage...',
    color: 'cyan',
  }).start();

  let messageCount = 0;

  watcher.on('change', async () => {
    messageCount++;
    spinner.text = `Monitoring... (${messageCount} updates detected)`;
    await checkAlerts();
  });

  watcher.on('error', (error) => {
    spinner.fail(`Watch error: ${error.message}`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    spinner.stop();
    console.log(chalk.dim('Daemon stopped.'));
    watcher.close();
    process.exit(0);
  });

  // Periodic check every 5 minutes
  setInterval(async () => {
    await checkAlerts();
  }, 5 * 60 * 1000);
}
