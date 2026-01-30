import chalk from 'chalk';
import {
  cliHeader,
  progressBar,
  formatDuration,
} from '../utils/format.js';
import { getCurrentSession, getWeeklyUsage } from '../data/aggregator.js';
import { loadConfig } from '../config/store.js';

export async function statusCommand(): Promise<void> {
  console.log(cliHeader());
  console.log();

  const config = loadConfig();
  const [session, weekly] = await Promise.all([
    getCurrentSession(),
    getWeeklyUsage(),
  ]);

  // Session
  if (session) {
    const sessionPercent = Math.min(100, Math.round(
      (session.estimatedTokens / config.limits.tokensPerSession) * 100
    ));
    const sessionRemaining = 100 - sessionPercent;

    // Calculate session reset time (5-hour window from start)
    const sessionEndTime = new Date(session.startTime.getTime() + 5 * 60 * 60 * 1000);
    const sessionResetMs = sessionEndTime.getTime() - Date.now();

    let sessionColor = chalk.green;
    if (sessionPercent >= 90) sessionColor = chalk.red;
    else if (sessionPercent >= 75) sessionColor = chalk.yellow;

    console.log(chalk.bold('Session'));
    console.log(`  ${sessionColor(progressBar(sessionPercent, 10))} ${sessionPercent}% used`);

    if (sessionResetMs > 0) {
      console.log(chalk.dim(`  Resets in ${formatDuration(sessionResetMs)}`));
    } else {
      console.log(chalk.dim(`  Reset available`));
    }
  } else {
    console.log(chalk.bold('Session'));
    console.log(chalk.dim('  No active session'));
  }

  console.log();

  // Weekly
  const weeklyPercent = Math.min(100, Math.round(
    (weekly.totalTokens / config.limits.tokensPerWeek) * 100
  ));

  let weeklyColor = chalk.green;
  if (weeklyPercent >= 90) weeklyColor = chalk.red;
  else if (weeklyPercent >= 75) weeklyColor = chalk.yellow;

  const resetDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][config.weekStartDay];

  console.log(chalk.bold('Weekly'));
  console.log(`  ${weeklyColor(progressBar(weeklyPercent, 10))} ${weeklyPercent}% used`);
  console.log(chalk.dim(`  Resets ${resetDay}`));

  console.log();

  // Tip
  if (session) {
    const sessionPercent = Math.round(
      (session.estimatedTokens / config.limits.tokensPerSession) * 100
    );

    if (sessionPercent >= 90) {
      console.log(chalk.yellow('Tip: Session nearly full. Consider wrapping up.'));
    } else if (weeklyPercent >= 75) {
      console.log(chalk.yellow(`Tip: ${100 - weeklyPercent}% weekly quota left for ${weekly.daysRemaining} days.`));
    } else {
      console.log(chalk.dim('Tip: You\'re on track.'));
    }
    console.log();
  }
}
