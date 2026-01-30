import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

export interface PlanLimits {
  // Session limits
  messagesPerSession: number;
  tokensPerSession: number;

  // Daily limits
  messagesPerDay: number;
  tokensPerDay: number;

  // Weekly limits
  messagesPerWeek: number;
  tokensPerWeek: number;
}

export interface AlertThresholds {
  // Percentage thresholds (0-100)
  sessionWarning: number;  // e.g., 80 = warn at 80% usage
  dailyWarning: number;
  weeklyWarning: number;

  // Enable/disable notifications
  enableSystemNotifications: boolean;
  enableTerminalAlerts: boolean;
}

export interface Config {
  planType: 'pro' | 'free' | 'custom';
  limits: PlanLimits;
  alerts: AlertThresholds;
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0 = Sunday, 1 = Monday, etc.
  timezone: string;
  lastUpdated: string;
}

// Default Pro plan limits (calibrated from actual usage data)
// Based on: 12M cache tokens = 29% weekly → ~41M weekly limit
// Session appears to be ~5 hour window with context-based limiting
const DEFAULT_PRO_LIMITS: PlanLimits = {
  messagesPerSession: 50,
  tokensPerSession: 5000000,   // ~5M tokens per session (context-heavy)
  messagesPerDay: 200,
  tokensPerDay: 15000000,      // ~15M tokens per day
  messagesPerWeek: 1000,
  tokensPerWeek: 45000000,     // ~45M tokens per week
};

const DEFAULT_FREE_LIMITS: PlanLimits = {
  messagesPerSession: 20,
  tokensPerSession: 50000,
  messagesPerDay: 50,
  tokensPerDay: 100000,
  messagesPerWeek: 200,
  tokensPerWeek: 400000,
};

const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  sessionWarning: 80,
  dailyWarning: 85,
  weeklyWarning: 75,
  enableSystemNotifications: true,
  enableTerminalAlerts: true,
};

const DEFAULT_CONFIG: Config = {
  planType: 'pro',
  limits: DEFAULT_PRO_LIMITS,
  alerts: DEFAULT_ALERT_THRESHOLDS,
  weekStartDay: 1,  // Monday
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  lastUpdated: new Date().toISOString(),
};

// Get config directory
export function getConfigDir(): string {
  return path.join(homedir(), '.claudometer');
}

// Get config file path
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

// Ensure config directory exists
function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Load config (creates default if doesn't exist)
export function loadConfig(): Config {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<Config>;

      // Merge with defaults to handle missing fields
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        limits: {
          ...DEFAULT_CONFIG.limits,
          ...(parsed.limits || {}),
        },
        alerts: {
          ...DEFAULT_CONFIG.alerts,
          ...(parsed.alerts || {}),
        },
      };
    }
  } catch {
    // Config file corrupted, use defaults
  }

  // Create default config
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

// Save config
export function saveConfig(config: Config): void {
  ensureConfigDir();
  const configPath = getConfigPath();

  config.lastUpdated = new Date().toISOString();

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// Update specific config values
export function updateConfig(updates: Partial<Config>): Config {
  const current = loadConfig();

  const updated: Config = {
    ...current,
    ...updates,
    limits: {
      ...current.limits,
      ...(updates.limits || {}),
    },
    alerts: {
      ...current.alerts,
      ...(updates.alerts || {}),
    },
  };

  saveConfig(updated);
  return updated;
}

// Set plan type and apply default limits
export function setPlanType(planType: 'pro' | 'free' | 'custom'): Config {
  const limits = planType === 'pro'
    ? DEFAULT_PRO_LIMITS
    : planType === 'free'
    ? DEFAULT_FREE_LIMITS
    : loadConfig().limits;  // Keep current limits for custom

  return updateConfig({ planType, limits });
}

// Update a single limit
export function updateLimit<K extends keyof PlanLimits>(
  key: K,
  value: PlanLimits[K]
): Config {
  const current = loadConfig();
  current.limits[key] = value;
  current.planType = 'custom';  // Mark as custom when manually editing limits
  saveConfig(current);
  return current;
}

// Update a single alert threshold
export function updateAlert<K extends keyof AlertThresholds>(
  key: K,
  value: AlertThresholds[K]
): Config {
  const current = loadConfig();
  current.alerts[key] = value;
  saveConfig(current);
  return current;
}

// Get limits for display
export function getLimitsDescription(): string[] {
  const config = loadConfig();
  const limits = config.limits;

  return [
    `Plan type: ${config.planType}`,
    '',
    'Session limits:',
    `  Messages: ${limits.messagesPerSession}`,
    `  Tokens: ${formatTokens(limits.tokensPerSession)}`,
    '',
    'Daily limits:',
    `  Messages: ${limits.messagesPerDay}`,
    `  Tokens: ${formatTokens(limits.tokensPerDay)}`,
    '',
    'Weekly limits:',
    `  Messages: ${limits.messagesPerWeek}`,
    `  Tokens: ${formatTokens(limits.tokensPerWeek)}`,
  ];
}

// Get alert thresholds for display
export function getAlertsDescription(): string[] {
  const config = loadConfig();
  const alerts = config.alerts;

  return [
    'Alert thresholds:',
    `  Session warning at: ${alerts.sessionWarning}%`,
    `  Daily warning at: ${alerts.dailyWarning}%`,
    `  Weekly warning at: ${alerts.weeklyWarning}%`,
    '',
    'Notifications:',
    `  System notifications: ${alerts.enableSystemNotifications ? 'enabled' : 'disabled'}`,
    `  Terminal alerts: ${alerts.enableTerminalAlerts ? 'enabled' : 'disabled'}`,
  ];
}

// Helper to format token counts
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return String(tokens);
}

// Reset config to defaults
export function resetConfig(): Config {
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

// Export defaults for reference
export const DEFAULTS = {
  PRO_LIMITS: DEFAULT_PRO_LIMITS,
  FREE_LIMITS: DEFAULT_FREE_LIMITS,
  ALERT_THRESHOLDS: DEFAULT_ALERT_THRESHOLDS,
};
