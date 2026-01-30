import chalk from 'chalk';
import {
  cliHeader,
  sectionHeader,
  progressBar,
  formatTokens,
  getDayName,
  miniBar,
  kvPair,
  sparkline,
} from '../utils/format.js';
import { getWeeklyUsage, DailyUsage } from '../data/aggregator.js';
import {
  estimateWeeklyQuota,
  forecastWeeklyUsage,
} from '../data/estimator.js';
import { loadConfig } from '../config/store.js';

export async function weekCommand(): Promise<void> {
  console.log(cliHeader('Weekly overview'));
  console.log();

  const [weeklyUsage, weeklyQuota, forecast] = await Promise.all([
    getWeeklyUsage(),
    estimateWeeklyQuota(),
    forecastWeeklyUsage(),
  ]);

  const config = loadConfig();

  // Weekly progress
  const weeklyPercent = Math.round(weeklyQuota.tokens.percentUsed);

  console.log(sectionHeader('This Week'));
  console.log();
  console.log(`  ${progressBar(weeklyPercent, 24, { showPercent: true })}`);
  console.log();

  // Key stats
  const stats = [
    kvPair('Used', formatTokens(weeklyUsage.totalTokens)),
    kvPair('Remaining', formatTokens(weeklyQuota.tokens.remaining)),
    kvPair('Resets in', `${weeklyQuota.daysRemaining}d`),
  ];
  console.log(`  ${stats.join('   ')}`);

  // Daily breakdown
  console.log();
  console.log(sectionHeader('Daily Breakdown'));
  console.log();

  const tokenValues = weeklyUsage.days.map(d => d.estimatedTokens);
  const maxTokens = Math.max(...tokenValues, 1);

  for (const day of weeklyUsage.days) {
    const dayDate = new Date(day.date);
    const dayName = getDayName(dayDate.getDay());
    const isToday = day.date === new Date().toISOString().split('T')[0];

    const label = isToday
      ? chalk.white(dayName)
      : chalk.dim(dayName);

    const bar = miniBar(day.estimatedTokens, maxTokens, 10);
    const tokens = formatTokens(day.estimatedTokens).padStart(6);
    const sessions = chalk.dim(`${day.sessions}s`);

    console.log(`  ${label.padEnd(12)} ${bar}  ${tokens}  ${sessions}`);
  }

  // Show remaining days
  if (weeklyQuota.daysRemaining > 0) {
    const currentDate = new Date();
    const remainingDays: string[] = [];

    for (let i = 1; i <= weeklyQuota.daysRemaining; i++) {
      const futureDate = new Date(currentDate);
      futureDate.setDate(futureDate.getDate() + i);
      remainingDays.push(getDayName(futureDate.getDay()));
    }

    for (const dayName of remainingDays) {
      console.log(`  ${chalk.dim(dayName.padEnd(12))} ${chalk.dim('─'.repeat(10))}  ${chalk.dim('─'.repeat(6))}  ${chalk.dim('─')}`);
    }
  }

  // Sparkline
  if (tokenValues.length > 1) {
    console.log();
    console.log(`  ${chalk.dim('Trend')}  ${sparkline(tokenValues)}`);
  }

  // Forecast
  console.log();
  console.log(sectionHeader('Forecast'));
  console.log();

  const projectedPercent = Math.round((forecast.projectedWeeklyTokens / config.limits.tokensPerWeek) * 100);

  if (forecast.willExceedQuota) {
    console.log(chalk.yellow(`  ⚠ Projected: ${projectedPercent}% of weekly limit`));
    console.log(chalk.dim(`    ${forecast.recommendedAction}`));
  } else {
    console.log(chalk.green(`  ✓ On track`));
    console.log(chalk.dim(`    Projected: ${formatTokens(forecast.projectedWeeklyTokens)} (${projectedPercent}%)`));
  }

  // Budget suggestion
  if (weeklyQuota.daysRemaining > 0 && weeklyQuota.suggestedDailyBudget > 0) {
    console.log();
    console.log(chalk.dim(`  Daily budget: ~${formatTokens(weeklyQuota.suggestedDailyBudget)}/day to stay on track`));
  }

  console.log();
}
