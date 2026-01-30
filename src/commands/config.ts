import chalk from 'chalk';
import * as readline from 'readline';
import {
  cliHeader,
  sectionHeader,
  formatTokens,
  kvPair,
} from '../utils/format.js';
import {
  loadConfig,
  saveConfig,
  updateConfig,
  setPlanType,
  updateLimit,
  updateAlert,
  resetConfig,
  getConfigPath,
  Config,
  PlanLimits,
  AlertThresholds,
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

  await showConfig();
}

async function showConfig(): Promise<void> {
  console.log(cliHeader('Configuration'));
  console.log();

  const config = loadConfig();

  console.log(sectionHeader('Settings'));
  console.log();

  // Plan info
  console.log(`  ${kvPair('Plan', config.planType)}`);
  console.log(`  ${kvPair('Week starts', getDayName(config.weekStartDay))}`);
  console.log(`  ${kvPair('Timezone', config.timezone)}`);

  // Limits
  console.log();
  console.log(sectionHeader('Limits'));
  console.log();

  console.log(`  ${chalk.dim('Session')}   ${kvPair('tokens', formatTokensNum(config.limits.tokensPerSession))}   ${kvPair('messages', config.limits.messagesPerSession.toString())}`);
  console.log(`  ${chalk.dim('Daily')}     ${kvPair('tokens', formatTokensNum(config.limits.tokensPerDay))}   ${kvPair('messages', config.limits.messagesPerDay.toString())}`);
  console.log(`  ${chalk.dim('Weekly')}    ${kvPair('tokens', formatTokensNum(config.limits.tokensPerWeek))}   ${kvPair('messages', config.limits.messagesPerWeek.toString())}`);

  // Alerts
  console.log();
  console.log(sectionHeader('Alerts'));
  console.log();

  console.log(`  ${kvPair('Session warning', `${config.alerts.sessionWarning}%`)}`);
  console.log(`  ${kvPair('Weekly warning', `${config.alerts.weeklyWarning}%`)}`);
  console.log(`  ${kvPair('Notifications', config.alerts.enableSystemNotifications ? 'on' : 'off')}`);

  // Help
  console.log();
  console.log(chalk.dim('  Commands:'));
  console.log(chalk.dim('    claudometer config --plan pro|free'));
  console.log(chalk.dim('    claudometer config --set limits.tokensPerWeek=50000000'));
  console.log(chalk.dim('    claudometer config --reset'));
  console.log();
}

async function setPlanTypeCommand(planType: 'pro' | 'free' | 'custom'): Promise<void> {
  console.log(cliHeader('Configuration'));
  console.log();

  const config = setPlanType(planType);

  console.log(chalk.green(`  ✓ Plan set to ${planType}`));

  if (planType !== 'custom') {
    console.log();
    console.log(chalk.dim(`  Session: ${formatTokensNum(config.limits.tokensPerSession)}`));
    console.log(chalk.dim(`  Weekly: ${formatTokensNum(config.limits.tokensPerWeek)}`));
  }
  console.log();
}

async function setConfigValue(setting: string): Promise<void> {
  console.log(cliHeader('Configuration'));
  console.log();

  const [key, value] = setting.split('=');

  if (!key || value === undefined) {
    console.log(chalk.red('  ✗ Invalid format. Use: --set key=value'));
    console.log();
    return;
  }

  const config = loadConfig();
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
      console.log(chalk.green(`  ✓ ${key} = ${numValue}`));
    } else if (parts[0] === 'alerts' && parts.length === 2) {
      const alertKey = parts[1] as keyof AlertThresholds;

      if (!(alertKey in config.alerts)) {
        throw new Error(`Unknown alert: ${alertKey}`);
      }

      let parsedValue: number | boolean;

      if (alertKey.startsWith('enable')) {
        parsedValue = value === 'true' || value === '1';
      } else {
        parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 100) {
          throw new Error('Threshold must be 0-100');
        }
      }

      updateAlert(alertKey, parsedValue as AlertThresholds[typeof alertKey]);
      console.log(chalk.green(`  ✓ ${key} = ${parsedValue}`));
    } else if (key === 'weekStartDay') {
      const dayNum = parseInt(value, 10) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) {
        throw new Error('weekStartDay must be 0-6');
      }
      updateConfig({ weekStartDay: dayNum });
      console.log(chalk.green(`  ✓ Week starts ${getDayName(dayNum)}`));
    } else {
      throw new Error(`Unknown: ${key}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`  ✗ ${message}`));
  }
  console.log();
}

async function resetConfigInteractive(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(cliHeader('Configuration'));
  console.log();

  rl.question('  Reset to defaults? (y/N) ', (answer) => {
    rl.close();

    if (answer.toLowerCase() === 'y') {
      resetConfig();
      console.log(chalk.green('  ✓ Reset complete'));
    } else {
      console.log(chalk.dim('  Cancelled'));
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
