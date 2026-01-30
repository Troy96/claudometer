import chalk from 'chalk';
import {
  cliHeader,
  sectionHeader,
  formatTokens,
  formatDuration,
  miniBar,
  getDayName,
  relativeTime,
  kvPair,
  hr,
  sparkline,
} from '../utils/format.js';
import {
  getRecentTrend,
  getHourlyPatterns,
  getProjectStats,
  getAllSessions,
  DailyUsage,
} from '../data/aggregator.js';
import { calculateSessionEfficiency, suggestOptimalTimes } from '../data/estimator.js';

interface HistoryOptions {
  days?: number;
  projects?: boolean;
  sessions?: boolean;
}

export async function historyCommand(options: HistoryOptions): Promise<void> {
  const days = options.days || 7;

  if (options.projects) {
    console.log(cliHeader('Project breakdown'));
    console.log();
    await showProjectBreakdown();
    return;
  }

  if (options.sessions) {
    console.log(cliHeader('Session history'));
    console.log();
    await showSessionHistory();
    return;
  }

  console.log(cliHeader('Usage analytics'));
  console.log();
  await showUsageTrends(days);
}

async function showUsageTrends(days: number): Promise<void> {
  const trend = await getRecentTrend(days);

  // Daily breakdown
  console.log(sectionHeader(`Last ${days} Days`));
  console.log();

  const tokenValues = trend.map(d => d.estimatedTokens);
  const maxTokens = Math.max(...tokenValues, 1);

  for (const day of trend) {
    const dayDate = new Date(day.date);
    const dayName = getDayName(dayDate.getDay());
    const dateStr = day.date.slice(5); // MM-DD
    const isToday = day.date === new Date().toISOString().split('T')[0];

    const label = isToday
      ? chalk.white(`${dayName} ${dateStr}`)
      : chalk.dim(`${dayName} ${dateStr}`);

    const bar = miniBar(day.estimatedTokens, maxTokens, 12);
    const tokens = formatTokens(day.estimatedTokens).padStart(6);
    const msgs = chalk.dim(`${day.messages} msgs`);

    console.log(`  ${label.padEnd(20)} ${bar}  ${tokens}  ${msgs}`);
  }

  // Sparkline summary
  if (tokenValues.length > 1) {
    console.log();
    console.log(`  ${chalk.dim('Trend')}  ${sparkline(tokenValues)}`);
  }

  // Summary stats
  console.log();
  console.log(sectionHeader('Summary'));
  console.log();

  const totalTokens = trend.reduce((sum, d) => sum + d.estimatedTokens, 0);
  const totalMessages = trend.reduce((sum, d) => sum + d.messages, 0);
  const totalSessions = trend.reduce((sum, d) => sum + d.sessions, 0);
  const activeDays = trend.filter(d => d.messages > 0).length;
  const avgPerDay = activeDays > 0 ? Math.round(totalTokens / activeDays) : 0;

  const stats = [
    kvPair('Total', formatTokens(totalTokens)),
    kvPair('Messages', totalMessages.toString()),
    kvPair('Sessions', totalSessions.toString()),
    kvPair('Avg/day', formatTokens(avgPerDay)),
  ];

  console.log(`  ${stats.join('  │  ')}`);

  // Activity patterns
  console.log();
  await showActivityPatterns();
}

async function showActivityPatterns(): Promise<void> {
  const patterns = await getHourlyPatterns();

  console.log(sectionHeader('Peak Hours'));
  console.log();

  // Find peak hours
  const sortedByActivity = [...patterns]
    .filter(p => p.averageMessages > 0)
    .sort((a, b) => b.averageMessages - a.averageMessages);

  if (sortedByActivity.length === 0) {
    console.log(chalk.dim('  No activity data yet'));
    console.log();
    return;
  }

  const peakHours = sortedByActivity.slice(0, 3);
  const quietHours = suggestOptimalTimes(patterns).slice(0, 3);

  const peakStr = peakHours.map(h => `${h.hour}:00`).join(', ');
  const quietStr = quietHours.map(h => `${h}:00`).join(', ');

  console.log(`  ${chalk.dim('Most active')}   ${peakStr}`);
  if (quietStr) {
    console.log(`  ${chalk.dim('Quietest')}     ${quietStr}`);
  }
  console.log();
}

async function showProjectBreakdown(): Promise<void> {
  console.log(sectionHeader('Projects'));
  console.log();

  const projects = await getProjectStats();

  if (projects.length === 0) {
    console.log(chalk.dim('  No project data available'));
    console.log();
    return;
  }

  const topProjects = projects.slice(0, 8);
  const maxTokens = Math.max(...topProjects.map(p => p.tokens), 1);

  for (const project of topProjects) {
    let name = project.project;

    // Clean up project path
    if (name.startsWith('-')) {
      name = name.replace(/-/g, '/').slice(1);
    }

    // Get just the last part of the path
    const parts = name.split('/');
    name = parts[parts.length - 1] || parts[parts.length - 2] || name;

    if (name.length > 20) {
      name = name.slice(0, 17) + '...';
    }

    const bar = miniBar(project.tokens, maxTokens, 10);
    const tokens = formatTokens(project.tokens).padStart(6);
    const sessions = chalk.dim(`${project.sessions} sess`);
    const lastUsed = chalk.dim(relativeTime(project.lastUsed));

    console.log(`  ${name.padEnd(22)} ${bar}  ${tokens}  ${sessions}`);
    console.log(`  ${' '.repeat(22)} ${' '.repeat(10)}  ${' '.repeat(6)}  ${lastUsed}`);
  }

  if (projects.length > 8) {
    console.log();
    console.log(chalk.dim(`  +${projects.length - 8} more projects`));
  }
  console.log();
}

async function showSessionHistory(): Promise<void> {
  console.log(sectionHeader('Recent Sessions'));
  console.log();

  const sessions = await getAllSessions();

  if (sessions.length === 0) {
    console.log(chalk.dim('  No session history'));
    console.log();
    return;
  }

  const recentSessions = sessions.slice(0, 8);

  for (const session of recentSessions) {
    const age = relativeTime(session.startTime);
    const duration = formatDuration(session.duration);
    const efficiency = calculateSessionEfficiency(session);

    let effIcon: string;
    if (efficiency >= 70) {
      effIcon = chalk.green('●');
    } else if (efficiency >= 40) {
      effIcon = chalk.yellow('●');
    } else {
      effIcon = chalk.dim('○');
    }

    // Session header
    console.log(`  ${effIcon} ${chalk.white(age)}`);

    // Stats line
    const stats = [
      kvPair('Duration', duration),
      kvPair('Messages', session.messageCount.toString()),
      kvPair('Tokens', formatTokens(session.estimatedTokens)),
    ];
    console.log(`    ${stats.join('  ')}`);

    // Project
    if (session.project) {
      let projectName = session.project;
      const parts = projectName.split('/');
      projectName = parts[parts.length - 1] || parts[parts.length - 2] || projectName;
      console.log(`    ${chalk.dim(projectName)}`);
    }

    console.log();
  }

  if (sessions.length > 8) {
    console.log(chalk.dim(`  +${sessions.length - 8} more sessions`));
    console.log();
  }
}
