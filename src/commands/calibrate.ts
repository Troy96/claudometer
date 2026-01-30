import chalk from 'chalk';
import { updateConfig, loadConfig } from '../config/store.js';
import { cliHeader, success, error, info } from '../utils/format.js';
import { getCurrentSession, getWeeklyUsage } from '../data/aggregator.js';

interface CalibrateOptions {
  session?: string;
  weekly?: string;
  reset?: string;
}

export async function calibrateCommand(options: CalibrateOptions): Promise<void> {
  console.log(cliHeader());
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
      // If we estimate X tokens and that's Y% of limit, then limit = X / (Y/100)
      const sessionLimit = Math.round(session.estimatedTokens / (sessionPercent / 100));

      config.limits.tokensPerSession = sessionLimit;
      hasChanges = true;

      console.log(success(`Session limit: ${formatTokens(sessionLimit)}`));
      console.log(chalk.dim(`  (${formatTokens(session.estimatedTokens)} tokens = ${sessionPercent}%)`));
    } else {
      console.log(error('No active session found. Start a session first.'));
    }
  }

  // Calibrate weekly limit
  if (weeklyPercent && weeklyPercent > 0 && weeklyPercent <= 100) {
    const weekly = await getWeeklyUsage();

    if (weekly && weekly.totalTokens > 0) {
      const weeklyLimit = Math.round(weekly.totalTokens / (weeklyPercent / 100));

      config.limits.tokensPerWeek = weeklyLimit;
      hasChanges = true;

      console.log(success(`Weekly limit: ${formatTokens(weeklyLimit)}`));
      console.log(chalk.dim(`  (${formatTokens(weekly.totalTokens)} tokens = ${weeklyPercent}%)`));
    } else {
      console.log(error('No weekly usage data found.'));
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
      console.log(success(`Week resets: ${capitalize(resetDay)}`));
    } else {
      console.log(error(`Invalid day: ${resetDay}`));
    }
  }

  if (hasChanges) {
    updateConfig(config);
    console.log();
    console.log(chalk.green('✓ Calibration saved!'));
  }

  console.log();
}

function showUsage(): void {
  console.log(info('Calibrate limits using values from /usage command'));
  console.log();
  console.log(chalk.bold('Usage:'));
  console.log('  claudometer calibrate --session <percent> --weekly <percent> --reset <day>');
  console.log();
  console.log(chalk.bold('Examples:'));
  console.log('  claudometer calibrate --session 59 --weekly 29 --reset wed');
  console.log('  claudometer calibrate --session 45');
  console.log('  claudometer calibrate --weekly 30 --reset thursday');
  console.log();
  console.log(chalk.bold('Options:'));
  console.log('  --session <percent>  Session usage % shown in /usage');
  console.log('  --weekly <percent>   Weekly usage % shown in /usage');
  console.log('  --reset <day>        Day when weekly limit resets (e.g., wed, thursday)');
  console.log();
  console.log(chalk.dim('Run /usage in Claude Code to see your current percentages.'));
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
