import chalk from 'chalk';
import * as readline from 'readline';
import {
  cliHeader,
  sectionHeader,
  divider,
  tableRow,
  formatTokens,
  success,
  info,
} from '../utils/format.js';
import {
  loadConfig,
  saveConfig,
  updateConfig,
  setPlanType,
  updateLimit,
  updateAlert,
  resetConfig,
  getLimitsDescription,
  getAlertsDescription,
  getConfigPath,
  Config,
  PlanLimits,
  AlertThresholds,
  DEFAULTS,
} from '../config/store.js';

interface ConfigOptions {
  show?: boolean;
  reset?: boolean;
  plan?: 'pro' | 'free' | 'custom';
  set?: string;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  if (options.reset) {
    await resetConfigInteractive();
    return;
  }

  if (options.plan) {
    await setPlanTypeCommand(options.plan);
    return;
  }

  if (options.set) {
    await setConfigValue(options.set);
    return;
  }

  // Default: show current config
  await showConfig();
}

async function showConfig(): Promise<void> {
  console.log(cliHeader());
  console.log();

  const config = loadConfig();

  console.log(sectionHeader('Current Configuration'));
  console.log();
  console.log(chalk.dim(`Config file: ${getConfigPath()}`));
  console.log();

  // Plan info
  console.log(tableRow('Plan Type', config.planType));
  console.log(tableRow('Week Starts', getDayName(config.weekStartDay)));
  console.log(tableRow('Timezone', config.timezone));

  console.log();
  console.log(divider());
  console.log();

  // Limits
  console.log(sectionHeader('Plan Limits'));
  console.log();

  console.log(chalk.bold('  Session:'));
  console.log(tableRow('    Messages', String(config.limits.messagesPerSession)));
  console.log(tableRow('    Tokens', formatTokensNum(config.limits.tokensPerSession)));

  console.log();
  console.log(chalk.bold('  Daily:'));
  console.log(tableRow('    Messages', String(config.limits.messagesPerDay)));
  console.log(tableRow('    Tokens', formatTokensNum(config.limits.tokensPerDay)));

  console.log();
  console.log(chalk.bold('  Weekly:'));
  console.log(tableRow('    Messages', String(config.limits.messagesPerWeek)));
  console.log(tableRow('    Tokens', formatTokensNum(config.limits.tokensPerWeek)));

  console.log();
  console.log(divider());
  console.log();

  // Alerts
  console.log(sectionHeader('Alert Thresholds'));
  console.log();

  console.log(tableRow('Session Warning', `${config.alerts.sessionWarning}%`));
  console.log(tableRow('Daily Warning', `${config.alerts.dailyWarning}%`));
  console.log(tableRow('Weekly Warning', `${config.alerts.weeklyWarning}%`));

  console.log();
  console.log(tableRow('System Notifications', config.alerts.enableSystemNotifications ? 'enabled' : 'disabled'));
  console.log(tableRow('Terminal Alerts', config.alerts.enableTerminalAlerts ? 'enabled' : 'disabled'));

  console.log();
  console.log(divider());
  console.log();

  console.log(chalk.dim('Usage:'));
  console.log(chalk.dim('  claudometer config --plan pro|free     Set plan type'));
  console.log(chalk.dim('  claudometer config --set key=value     Set a specific value'));
  console.log(chalk.dim('  claudometer config --reset             Reset to defaults'));
  console.log();
  console.log(chalk.dim('Available settings:'));
  console.log(chalk.dim('  limits.tokensPerSession, limits.tokensPerDay, limits.tokensPerWeek'));
  console.log(chalk.dim('  limits.messagesPerSession, limits.messagesPerDay, limits.messagesPerWeek'));
  console.log(chalk.dim('  alerts.sessionWarning, alerts.dailyWarning, alerts.weeklyWarning'));
  console.log(chalk.dim('  alerts.enableSystemNotifications, alerts.enableTerminalAlerts'));
  console.log(chalk.dim('  weekStartDay (0=Sun, 1=Mon, ...)'));
  console.log();
}

async function setPlanTypeCommand(planType: 'pro' | 'free' | 'custom'): Promise<void> {
  const config = setPlanType(planType);

  console.log(success(`Plan type set to: ${planType}`));
  console.log();

  if (planType !== 'custom') {
    console.log(info('Default limits applied:'));
    const limits = config.limits;
    console.log(`  Session: ${limits.messagesPerSession} msgs, ${formatTokensNum(limits.tokensPerSession)}`);
    console.log(`  Daily: ${limits.messagesPerDay} msgs, ${formatTokensNum(limits.tokensPerDay)}`);
    console.log(`  Weekly: ${limits.messagesPerWeek} msgs, ${formatTokensNum(limits.tokensPerWeek)}`);
    console.log();
    console.log(chalk.dim('Tip: Use --set to customize individual limits.'));
  }
  console.log();
}

async function setConfigValue(setting: string): Promise<void> {
  const [key, value] = setting.split('=');

  if (!key || value === undefined) {
    console.log(chalk.red('Invalid format. Use: --set key=value'));
    console.log(chalk.dim('Example: --set limits.tokensPerDay=500000'));
    return;
  }

  const config = loadConfig();

  // Parse the key path
  const parts = key.split('.');

  try {
    if (parts[0] === 'limits' && parts.length === 2) {
      const limitKey = parts[1] as keyof PlanLimits;
      const numValue = parseInt(value, 10);

      if (isNaN(numValue) || numValue < 0) {
        throw new Error('Value must be a positive number');
      }

      if (!(limitKey in config.limits)) {
        throw new Error(`Unknown limit: ${limitKey}`);
      }

      updateLimit(limitKey, numValue);
      console.log(success(`${key} set to ${numValue}`));
    } else if (parts[0] === 'alerts' && parts.length === 2) {
      const alertKey = parts[1] as keyof AlertThresholds;

      if (!(alertKey in config.alerts)) {
        throw new Error(`Unknown alert setting: ${alertKey}`);
      }

      let parsedValue: number | boolean;

      if (alertKey.startsWith('enable')) {
        parsedValue = value === 'true' || value === '1';
      } else {
        parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 100) {
          throw new Error('Threshold must be a number between 0 and 100');
        }
      }

      updateAlert(alertKey, parsedValue as AlertThresholds[typeof alertKey]);
      console.log(success(`${key} set to ${parsedValue}`));
    } else if (key === 'weekStartDay') {
      const dayNum = parseInt(value, 10) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) {
        throw new Error('weekStartDay must be 0-6 (0=Sunday, 1=Monday, ...)');
      }
      updateConfig({ weekStartDay: dayNum });
      console.log(success(`Week start day set to ${getDayName(dayNum)}`));
    } else {
      throw new Error(`Unknown setting: ${key}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`Error: ${message}`));
  }
  console.log();
}

async function resetConfigInteractive(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Reset all settings to defaults? (y/N) ', (answer) => {
    rl.close();

    if (answer.toLowerCase() === 'y') {
      resetConfig();
      console.log(success('Configuration reset to defaults.'));
    } else {
      console.log(chalk.dim('Reset cancelled.'));
    }
    console.log();
  });
}

function formatTokensNum(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K`;
  }
  return String(tokens);
}

function getDayName(dayIndex: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayIndex] || 'Unknown';
}
