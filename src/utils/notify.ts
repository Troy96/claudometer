import notifier from 'node-notifier';
import chalk from 'chalk';
import { loadConfig } from '../config/store.js';

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface Alert {
  title: string;
  message: string;
  level: AlertLevel;
}

// Send a system notification
export function sendSystemNotification(alert: Alert): void {
  const config = loadConfig();

  if (!config.alerts.enableSystemNotifications) {
    return;
  }

  notifier.notify({
    title: `Claude Calc: ${alert.title}`,
    message: alert.message,
    sound: alert.level === 'critical',
    wait: false,
  });
}

// Print a terminal alert
export function printTerminalAlert(alert: Alert): void {
  const config = loadConfig();

  if (!config.alerts.enableTerminalAlerts) {
    return;
  }

  let prefix: string;
  let colorFn: (s: string) => string;

  switch (alert.level) {
    case 'critical':
      prefix = '🚨';
      colorFn = chalk.red;
      break;
    case 'warning':
      prefix = '⚠️';
      colorFn = chalk.yellow;
      break;
    default:
      prefix = 'ℹ️';
      colorFn = chalk.blue;
  }

  console.log();
  console.log(colorFn(`${prefix} ${alert.title}`));
  console.log(colorFn(`   ${alert.message}`));
  console.log();
}

// Send both system and terminal notifications
export function notify(alert: Alert): void {
  sendSystemNotification(alert);
  printTerminalAlert(alert);
}

// Session quota alert
export function alertSessionQuota(usagePercent: number): void {
  const config = loadConfig();

  if (usagePercent >= 95) {
    notify({
      title: 'Session Almost Full',
      message: `You've used ${Math.round(usagePercent)}% of your session quota. Consider wrapping up.`,
      level: 'critical',
    });
  } else if (usagePercent >= config.alerts.sessionWarning) {
    notify({
      title: 'Session Usage High',
      message: `You've used ${Math.round(usagePercent)}% of your session quota.`,
      level: 'warning',
    });
  }
}

// Daily quota alert
export function alertDailyQuota(usagePercent: number): void {
  const config = loadConfig();

  if (usagePercent >= 95) {
    notify({
      title: 'Daily Limit Almost Reached',
      message: `You've used ${Math.round(usagePercent)}% of your daily quota.`,
      level: 'critical',
    });
  } else if (usagePercent >= config.alerts.dailyWarning) {
    notify({
      title: 'Daily Usage High',
      message: `You've used ${Math.round(usagePercent)}% of your daily quota. Consider pacing yourself.`,
      level: 'warning',
    });
  }
}

// Weekly quota alert
export function alertWeeklyQuota(usagePercent: number, daysRemaining: number): void {
  const config = loadConfig();

  if (usagePercent >= 95) {
    notify({
      title: 'Weekly Limit Almost Reached',
      message: `You've used ${Math.round(usagePercent)}% of your weekly quota with ${daysRemaining} days remaining.`,
      level: 'critical',
    });
  } else if (usagePercent >= config.alerts.weeklyWarning) {
    const suggestion = daysRemaining > 0
      ? `Consider saving ~${Math.round((100 - usagePercent) / daysRemaining)}% for each remaining day.`
      : 'Quota resets soon.';

    notify({
      title: 'Weekly Usage High',
      message: `You've used ${Math.round(usagePercent)}% of your weekly quota. ${suggestion}`,
      level: 'warning',
    });
  }
}

// Rate limit detected alert
export function alertRateLimit(): void {
  notify({
    title: 'Rate Limit Detected',
    message: 'You may have hit a rate limit. Consider waiting before the next request.',
    level: 'warning',
  });
}

// Session recommendation
export function suggestSessionEnd(): void {
  notify({
    title: 'Session Recommendation',
    message: 'Based on your usage pattern, now might be a good time to wrap up this session.',
    level: 'info',
  });
}

// Weekly planning suggestion
export function suggestWeeklyPlan(averageDaily: number, daysRemaining: number, remainingQuota: number): void {
  const suggestedDaily = Math.round(remainingQuota / Math.max(daysRemaining, 1));
  const comparison = suggestedDaily > averageDaily
    ? 'You have room for higher usage.'
    : 'Consider reducing usage to stay within quota.';

  notify({
    title: 'Weekly Planning Tip',
    message: `Suggested daily budget: ${suggestedDaily} tokens. ${comparison}`,
    level: 'info',
  });
}
