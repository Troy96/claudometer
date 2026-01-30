import chalk from 'chalk';
import {
  cliHeader,
  sectionHeader,
  divider,
  tableRow,
  formatTokens,
  formatDuration,
  sparkline,
  getDayName,
  relativeTime,
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
  console.log(cliHeader());
  console.log();

  const days = options.days || 7;

  if (options.projects) {
    await showProjectBreakdown();
    return;
  }

  if (options.sessions) {
    await showSessionHistory();
    return;
  }

  // Default: show usage trends
  await showUsageTrends(days);
}

async function showUsageTrends(days: number): Promise<void> {
  console.log(sectionHeader(`Usage Trends (Last ${days} Days)`));
  console.log();

  const trend = await getRecentTrend(days);

  // Daily breakdown with mini chart
  const tokenValues = trend.map(d => d.estimatedTokens);
  const maxTokens = Math.max(...tokenValues, 1);

  for (const day of trend) {
    const dayDate = new Date(day.date);
    const dayName = getDayName(dayDate.getDay());
    const dateStr = day.date.slice(5);  // MM-DD

    const isToday = day.date === new Date().toISOString().split('T')[0];

    const barWidth = Math.round((day.estimatedTokens / maxTokens) * 20);
    const bar = '█'.repeat(barWidth) + '░'.repeat(20 - barWidth);

    const dayLabel = isToday
      ? chalk.bold(`${dayName} ${dateStr}`)
      : `${dayName} ${dateStr}`;

    const tokens = formatTokens(day.estimatedTokens);
    const msgs = day.messages;

    console.log(`  ${dayLabel.padEnd(14)} ${chalk.cyan(bar)} ${tokens.padStart(6)} | ${msgs} msgs`);
  }

  // Summary stats
  console.log();
  console.log(divider());
  console.log();

  const totalTokens = trend.reduce((sum, d) => sum + d.estimatedTokens, 0);
  const totalMessages = trend.reduce((sum, d) => sum + d.messages, 0);
  const totalSessions = trend.reduce((sum, d) => sum + d.sessions, 0);
  const activeDays = trend.filter(d => d.messages > 0).length;

  console.log(sectionHeader('Summary'));
  console.log();
  console.log(tableRow('Total Tokens', formatTokens(totalTokens)));
  console.log(tableRow('Total Messages', String(totalMessages)));
  console.log(tableRow('Total Sessions', String(totalSessions)));
  console.log(tableRow('Active Days', `${activeDays} / ${days}`));

  if (activeDays > 0) {
    console.log(tableRow('Avg per Active Day', formatTokens(Math.round(totalTokens / activeDays))));
  }

  console.log();
  console.log(divider());
  console.log();

  // Hourly patterns
  await showHourlyPatterns();
}

async function showHourlyPatterns(): Promise<void> {
  console.log(sectionHeader('Activity by Hour'));
  console.log();

  const patterns = await getHourlyPatterns();

  // Group into time blocks for display
  const timeBlocks = [
    { name: 'Morning (6-12)', hours: [6, 7, 8, 9, 10, 11] },
    { name: 'Afternoon (12-18)', hours: [12, 13, 14, 15, 16, 17] },
    { name: 'Evening (18-24)', hours: [18, 19, 20, 21, 22, 23] },
    { name: 'Night (0-6)', hours: [0, 1, 2, 3, 4, 5] },
  ];

  for (const block of timeBlocks) {
    const blockPatterns = patterns.filter(p => block.hours.includes(p.hour));
    const totalMessages = blockPatterns.reduce((sum, p) => sum + p.averageMessages, 0);
    const totalSessions = blockPatterns.reduce((sum, p) => sum + p.sessionCount, 0);

    if (totalMessages > 0 || totalSessions > 0) {
      console.log(`  ${block.name.padEnd(20)} ${totalMessages} avg msgs, ${totalSessions} sessions`);
    }
  }

  // Suggest optimal times
  const optimalHours = suggestOptimalTimes(patterns);
  if (optimalHours.length > 0) {
    console.log();
    console.log(chalk.dim(`  Low-traffic hours: ${optimalHours.map(h => `${h}:00`).join(', ')}`));
  }

  console.log();
}

async function showProjectBreakdown(): Promise<void> {
  console.log(sectionHeader('Usage by Project'));
  console.log();

  const projects = await getProjectStats();

  if (projects.length === 0) {
    console.log(chalk.dim('  No project data available.'));
    console.log();
    return;
  }

  // Show top projects
  const topProjects = projects.slice(0, 10);
  const maxTokens = Math.max(...topProjects.map(p => p.tokens), 1);

  for (const project of topProjects) {
    // Truncate long project names
    let projectName = project.project;
    if (projectName.startsWith('-')) {
      // Convert path format back to readable
      projectName = projectName.replace(/-/g, '/').slice(1);
    }
    if (projectName.length > 30) {
      projectName = '...' + projectName.slice(-27);
    }

    const barWidth = Math.round((project.tokens / maxTokens) * 15);
    const bar = '█'.repeat(barWidth) + '░'.repeat(15 - barWidth);

    const tokens = formatTokens(project.tokens);
    const lastUsed = relativeTime(project.lastUsed);

    console.log(`  ${projectName.padEnd(32)} ${chalk.cyan(bar)} ${tokens.padStart(7)}`);
    console.log(chalk.dim(`  ${''.padEnd(32)} ${project.sessions} sessions, ${lastUsed}`));
    console.log();
  }

  if (projects.length > 10) {
    console.log(chalk.dim(`  ... and ${projects.length - 10} more projects`));
    console.log();
  }
}

async function showSessionHistory(): Promise<void> {
  console.log(sectionHeader('Recent Sessions'));
  console.log();

  const sessions = await getAllSessions();

  if (sessions.length === 0) {
    console.log(chalk.dim('  No session history available.'));
    console.log();
    return;
  }

  // Show last 10 sessions
  const recentSessions = sessions.slice(0, 10);

  for (const session of recentSessions) {
    const age = relativeTime(session.startTime);
    const duration = formatDuration(session.duration);
    const efficiency = calculateSessionEfficiency(session);

    let efficiencyLabel: string;
    if (efficiency >= 70) {
      efficiencyLabel = chalk.green(`${Math.round(efficiency)}% efficient`);
    } else if (efficiency >= 40) {
      efficiencyLabel = chalk.yellow(`${Math.round(efficiency)}% efficient`);
    } else {
      efficiencyLabel = chalk.dim(`${Math.round(efficiency)}% efficient`);
    }

    console.log(`  ${chalk.bold(age)}`);
    console.log(`    Duration: ${duration} | Messages: ${session.messageCount} | Tokens: ${formatTokens(session.estimatedTokens)}`);
    console.log(`    ${efficiencyLabel}`);

    if (session.project) {
      let projectName = session.project;
      if (projectName.length > 40) {
        projectName = '...' + projectName.slice(-37);
      }
      console.log(chalk.dim(`    Project: ${projectName}`));
    }

    console.log();
  }

  if (sessions.length > 10) {
    console.log(chalk.dim(`  ... and ${sessions.length - 10} more sessions`));
    console.log();
  }
}
