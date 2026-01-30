import chalk from 'chalk';
import {
  cliHeader,
  sectionHeader,
  divider,
  tableRow,
  progressBar,
  formatTokens,
  formatDuration,
  tip,
  getDayName,
  sparkline,
} from '../utils/format.js';
import { getWeeklyUsage, DailyUsage } from '../data/aggregator.js';
import {
  estimateWeeklyQuota,
  forecastWeeklyUsage,
} from '../data/estimator.js';
import { loadConfig } from '../config/store.js';

export async function weekCommand(): Promise<void> {
  console.log(cliHeader());
  console.log();

  const [weeklyUsage, weeklyQuota, forecast] = await Promise.all([
    getWeeklyUsage(),
    estimateWeeklyQuota(),
    forecastWeeklyUsage(),
  ]);

  const config = loadConfig();

  // Weekly overview
  console.log(sectionHeader('Weekly Overview'));
  console.log();

  const weeklyPercent = Math.round(weeklyQuota.tokens.percentUsed);
  console.log(tableRow(
    'Usage',
    `${progressBar(weeklyPercent, 20)} ${weeklyPercent}%`
  ));
  console.log(tableRow('Total Sessions', String(weeklyUsage.totalSessions)));
  console.log(tableRow('Total Messages', String(weeklyUsage.totalMessages)));
  console.log(tableRow('Total Tokens', formatTokens(weeklyUsage.totalTokens)));

  console.log();
  console.log(tableRow('Remaining', formatTokens(weeklyQuota.tokens.remaining)));
  console.log(tableRow('Days Left', `${weeklyQuota.daysRemaining} days`));
  console.log(tableRow('Reset Time', formatResetTime(weeklyQuota.resetTime)));

  console.log();
  console.log(divider());
  console.log();

  // Daily breakdown
  console.log(sectionHeader('Daily Breakdown'));
  console.log();

  // Create a visual chart
  const tokenValues = weeklyUsage.days.map(d => d.estimatedTokens);
  const maxTokens = Math.max(...tokenValues, 1);

  for (const day of weeklyUsage.days) {
    const dayDate = new Date(day.date);
    const dayName = getDayName(dayDate.getDay());
    const isToday = day.date === new Date().toISOString().split('T')[0];

    const barWidth = Math.round((day.estimatedTokens / maxTokens) * 15);
    const bar = '█'.repeat(barWidth) + '░'.repeat(15 - barWidth);

    const dayLabel = isToday
      ? chalk.bold(`${dayName} (today)`)
      : chalk.dim(dayName);

    const stats = `${day.sessions} sess, ${formatTokens(day.estimatedTokens)}`;

    console.log(`  ${dayLabel.padEnd(18)} ${chalk.cyan(bar)} ${stats}`);
  }

  // Show remaining days
  if (weeklyQuota.daysRemaining > 0) {
    const remainingDays: string[] = [];
    const currentDate = new Date();

    for (let i = 1; i <= weeklyQuota.daysRemaining; i++) {
      const futureDate = new Date(currentDate);
      futureDate.setDate(futureDate.getDate() + i);
      remainingDays.push(getDayName(futureDate.getDay()));
    }

    console.log();
    console.log(chalk.dim(`  Remaining: ${remainingDays.join(', ')}`));
  }

  console.log();
  console.log(divider());
  console.log();

  // Forecast
  console.log(sectionHeader('Forecast'));
  console.log();

  if (weeklyUsage.averageDailyTokens > 0) {
    console.log(tableRow('Avg Daily Tokens', formatTokens(weeklyUsage.averageDailyTokens)));
    console.log(tableRow('Avg Daily Messages', String(weeklyUsage.averageDailyMessages)));
  }

  console.log(tableRow('Projected Weekly', formatTokens(forecast.projectedWeeklyTokens)));

  if (forecast.willExceedQuota) {
    console.log();
    console.log(chalk.yellow(`⚠ ${forecast.recommendedAction}`));
  } else {
    console.log();
    console.log(chalk.green(`✓ ${forecast.recommendedAction}`));
  }

  // Budget suggestion
  if (weeklyQuota.daysRemaining > 0 && weeklyQuota.suggestedDailyBudget > 0) {
    console.log();
    console.log(tip(`Suggested daily budget: ${formatTokens(weeklyQuota.suggestedDailyBudget)} tokens`));
  }

  console.log();
}

function formatResetTime(resetTime: Date): string {
  const now = new Date();
  const diffMs = resetTime.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'now';
  }

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);

  return parts.join(' ') || 'soon';
}
