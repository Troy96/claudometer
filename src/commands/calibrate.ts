import chalk from 'chalk';
import { updateConfig, loadConfig } from '../config/store.js';
import { cliHeader, kvPair } from '../utils/format.js';
import { getCurrentSession, getWeeklyUsage } from '../data/aggregator.js';

interface CalibrateOptions {
  session?: string;
  weekly?: string;
  reset?: string;
}

export async function calibrateCommand(options: CalibrateOptions): Promise<void> {
  console.log(cliHeader('Calibration'));
  console.log();

  const sessionPercent = options.session ? parseFloat(options.session) : null;
  const weeklyPercent = options.weekly ? parseFloat(options.weekly) : null;
  const resetDay = options.reset?.toLowerCase();

  if (!sessionPercent && !weeklyPercent && !resetDay) {
    showUsage();
    return;
  }

  const config = loadConfig();
  let hasChanges = false;

  // Calibrate session limit
  if (sessionPercent && sessionPercent > 0 && sessionPercent <= 100) {
    const session = await getCurrentSession();

    if (session && session.estimatedTokens > 0) {
      const sessionLimit = Math.round(session.estimatedTokens / (sessionPercent / 100));
      config.limits.tokensPerSession = sessionLimit;
      hasChanges = true;

      console.log(chalk.green(`  ✓ Session limit: ${formatTokens(sessionLimit)}`));
      console.log(chalk.dim(`    ${formatTokens(session.estimatedTokens)} = ${sessionPercent}%`));
    } else {
      console.log(chalk.yellow('  ⚠ No active session to calibrate'));
    }
  }

  // Calibrate weekly limit
  if (weeklyPercent && weeklyPercent > 0 && weeklyPercent <= 100) {
    const weekly = await getWeeklyUsage();

    if (weekly && weekly.totalTokens > 0) {
      const weeklyLimit = Math.round(weekly.totalTokens / (weeklyPercent / 100));
      config.limits.tokensPerWeek = weeklyLimit;
      hasChanges = true;

      console.log(chalk.green(`  ✓ Weekly limit: ${formatTokens(weeklyLimit)}`));
      console.log(chalk.dim(`    ${formatTokens(weekly.totalTokens)} = ${weeklyPercent}%`));
    } else {
      console.log(chalk.yellow('  ⚠ No weekly data to calibrate'));
    }
  }

  // Set reset day
  if (resetDay) {
    const dayMap: Record<string, number> = {
      'sun': 0, 'sunday': 0,
      'mon': 1, 'monday': 1,
      'tue': 2, 'tuesday': 2,
      'wed': 3, 'wednesday': 3,
      'thu': 4, 'thursday': 4,
      'fri': 5, 'friday': 5,
      'sat': 6, 'saturday': 6,
    };

    const dayNum = dayMap[resetDay];
    if (dayNum !== undefined) {
      config.weekStartDay = dayNum as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      hasChanges = true;
      console.log(chalk.green(`  ✓ Week resets: ${capitalize(resetDay)}`));
    } else {
      console.log(chalk.red(`  ✗ Invalid day: ${resetDay}`));
    }
  }

  if (hasChanges) {
    updateConfig(config);
    console.log();
    console.log(chalk.dim('  Saved'));
  }

  console.log();
}

function showUsage(): void {
  console.log(chalk.dim('  Calibrate using values from /usage command'));
  console.log();
  console.log('  Usage:');
  console.log(chalk.dim('    claudometer calibrate -s <session%> -w <weekly%> -r <day>'));
  console.log();
  console.log('  Examples:');
  console.log(chalk.dim('    claudometer calibrate -s 59 -w 29 -r wed'));
  console.log(chalk.dim('    claudometer calibrate -s 45'));
  console.log(chalk.dim('    claudometer calibrate -w 30 -r thursday'));
  console.log();
  console.log(chalk.dim('  Run /usage in Claude Code to see your percentages'));
  console.log();
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K`;
  }
  return String(tokens);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
