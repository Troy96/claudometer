import { loadConfig, PlanLimits } from '../config/store.js';
import {
  getCurrentSession,
  getTodayUsage,
  getWeeklyUsage,
  SessionStats,
  DailyUsage,
  WeeklyUsage,
} from './aggregator.js';

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  percentRemaining: number;
}

export interface SessionQuota {
  messages: QuotaStatus;
  tokens: QuotaStatus;
  isOverLimit: boolean;
  warningLevel: 'ok' | 'warning' | 'critical';
}

export interface DailyQuota {
  messages: QuotaStatus;
  tokens: QuotaStatus;
  sessions: number;
  isOverLimit: boolean;
  warningLevel: 'ok' | 'warning' | 'critical';
}

export interface WeeklyQuota {
  messages: QuotaStatus;
  tokens: QuotaStatus;
  sessions: number;
  daysRemaining: number;
  suggestedDailyBudget: number;
  isOverLimit: boolean;
  warningLevel: 'ok' | 'warning' | 'critical';
  resetTime: Date;
}

export interface FullQuotaEstimate {
  session: SessionQuota | null;
  daily: DailyQuota;
  weekly: WeeklyQuota;
  recommendation: string;
}

// Calculate quota status from usage and limit
function calculateQuotaStatus(used: number, limit: number): QuotaStatus {
  const remaining = Math.max(0, limit - used);
  const percentUsed = limit > 0 ? (used / limit) * 100 : 0;
  const percentRemaining = 100 - percentUsed;

  return {
    used,
    limit,
    remaining,
    percentUsed: Math.min(percentUsed, 100),
    percentRemaining: Math.max(percentRemaining, 0),
  };
}

// Determine warning level from percentage
function getWarningLevel(
  percentUsed: number,
  warningThreshold: number
): 'ok' | 'warning' | 'critical' {
  if (percentUsed >= 95) return 'critical';
  if (percentUsed >= warningThreshold) return 'warning';
  return 'ok';
}

// Estimate current session quota
export async function estimateSessionQuota(): Promise<SessionQuota | null> {
  const config = loadConfig();
  const limits = config.limits;
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  const messagesQuota = calculateQuotaStatus(
    session.userMessages,  // Count user messages for limit
    limits.messagesPerSession
  );

  const tokensQuota = calculateQuotaStatus(
    session.estimatedTokens,
    limits.tokensPerSession
  );

  const maxPercent = Math.max(messagesQuota.percentUsed, tokensQuota.percentUsed);
  const warningLevel = getWarningLevel(maxPercent, config.alerts.sessionWarning);

  return {
    messages: messagesQuota,
    tokens: tokensQuota,
    isOverLimit: maxPercent >= 100,
    warningLevel,
  };
}

// Estimate daily quota
export async function estimateDailyQuota(): Promise<DailyQuota> {
  const config = loadConfig();
  const limits = config.limits;
  const today = await getTodayUsage();

  const messagesQuota = calculateQuotaStatus(
    today.userMessages,
    limits.messagesPerDay
  );

  const tokensQuota = calculateQuotaStatus(
    today.estimatedTokens,
    limits.tokensPerDay
  );

  // Focus on token-based quota for warnings (more reliable metric)
  const warningLevel = getWarningLevel(tokensQuota.percentUsed, config.alerts.dailyWarning);

  return {
    messages: messagesQuota,
    tokens: tokensQuota,
    sessions: today.sessions,
    isOverLimit: tokensQuota.percentUsed >= 100,
    warningLevel,
  };
}

// Estimate weekly quota
export async function estimateWeeklyQuota(): Promise<WeeklyQuota> {
  const config = loadConfig();
  const limits = config.limits;
  const week = await getWeeklyUsage();

  const messagesQuota = calculateQuotaStatus(
    week.totalMessages,
    limits.messagesPerWeek
  );

  const tokensQuota = calculateQuotaStatus(
    week.totalTokens,
    limits.tokensPerWeek
  );

  // Calculate reset time (end of current week)
  const resetTime = new Date(week.weekEnd);
  resetTime.setDate(resetTime.getDate() + 1);
  resetTime.setHours(0, 0, 0, 0);

  // Calculate suggested daily budget for remaining days
  const suggestedDailyBudget = week.daysRemaining > 0
    ? Math.round(tokensQuota.remaining / week.daysRemaining)
    : 0;

  // Focus on token-based quota for warnings (more reliable metric)
  const warningLevel = getWarningLevel(tokensQuota.percentUsed, config.alerts.weeklyWarning);

  return {
    messages: messagesQuota,
    tokens: tokensQuota,
    sessions: week.totalSessions,
    daysRemaining: week.daysRemaining,
    suggestedDailyBudget,
    isOverLimit: tokensQuota.percentUsed >= 100,
    warningLevel,
    resetTime,
  };
}

// Get full quota estimate with recommendations
export async function getFullQuotaEstimate(): Promise<FullQuotaEstimate> {
  const [session, daily, weekly] = await Promise.all([
    estimateSessionQuota(),
    estimateDailyQuota(),
    estimateWeeklyQuota(),
  ]);

  // Generate recommendation
  const recommendation = generateRecommendation(session, daily, weekly);

  return {
    session,
    daily,
    weekly,
    recommendation,
  };
}

// Generate a usage recommendation
function generateRecommendation(
  session: SessionQuota | null,
  daily: DailyQuota,
  weekly: WeeklyQuota
): string {
  // Priority: critical warnings first
  if (session?.warningLevel === 'critical') {
    return 'Your session is nearly at capacity. Consider starting a new session soon.';
  }

  if (daily.warningLevel === 'critical') {
    return 'You\'re approaching your daily limit. Consider pacing your remaining usage.';
  }

  if (weekly.warningLevel === 'critical') {
    return `Weekly limit nearly reached with ${weekly.daysRemaining} days remaining. Consider light usage until reset.`;
  }

  // Warning level suggestions
  if (session?.warningLevel === 'warning') {
    const remainingPercent = Math.round(session.tokens.percentRemaining);
    return `Session at ${Math.round(session.tokens.percentUsed)}% capacity. ~${remainingPercent}% remaining.`;
  }

  if (weekly.warningLevel === 'warning') {
    return `${Math.round(weekly.tokens.percentRemaining)}% of weekly quota remaining for ${weekly.daysRemaining} days.`;
  }

  // Good status
  if (weekly.daysRemaining > 0 && weekly.suggestedDailyBudget > 0) {
    const formattedBudget = formatTokens(weekly.suggestedDailyBudget);
    return `You're on track. Suggested daily budget: ${formattedBudget} tokens.`;
  }

  return 'Usage looking good!';
}

// Format token count
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K`;
  }
  return String(tokens);
}

// Detect potential rate limit events from gaps in history
export async function detectRateLimitEvents(): Promise<Date[]> {
  // Rate limits often show as gaps of 1-2 minutes between messages
  // after rapid succession of messages
  // This is a heuristic and may have false positives

  const session = await getCurrentSession();
  if (!session) return [];

  // Would need message timestamps to detect this properly
  // For now, return empty - could be implemented with more detailed history parsing
  return [];
}

// Calculate session efficiency (how well the session quota is being used)
export function calculateSessionEfficiency(session: SessionStats): number {
  const config = loadConfig();
  const limits = config.limits;

  // Efficiency = how much of the session quota was used
  // A "wasted" session would have low efficiency
  // An "optimal" session would have ~80-90% efficiency

  const tokenEfficiency = session.estimatedTokens / limits.tokensPerSession;
  const messageEfficiency = session.userMessages / limits.messagesPerSession;

  // Weight tokens more heavily
  const efficiency = (tokenEfficiency * 0.7 + messageEfficiency * 0.3) * 100;

  return Math.min(efficiency, 100);
}

// Suggest optimal session start times based on patterns
export function suggestOptimalTimes(
  hourlyPatterns: Array<{ hour: number; averageMessages: number; sessionCount: number }>
): number[] {
  // Find hours with lowest historical usage (less competition for quota)
  const sorted = [...hourlyPatterns]
    .filter(p => p.hour >= 8 && p.hour <= 22)  // Reasonable hours
    .sort((a, b) => a.averageMessages - b.averageMessages);

  // Return top 3 lowest-usage hours
  return sorted.slice(0, 3).map(p => p.hour);
}

// Forecast usage for the rest of the week
export interface UsageForecast {
  projectedWeeklyTokens: number;
  projectedWeeklyMessages: number;
  willExceedQuota: boolean;
  recommendedAction: string;
}

export async function forecastWeeklyUsage(): Promise<UsageForecast> {
  const config = loadConfig();
  const weekly = await getWeeklyUsage();

  // Calculate average daily usage
  const daysElapsed = weekly.days.length;
  const avgDailyTokens = daysElapsed > 0 ? weekly.totalTokens / daysElapsed : 0;
  const avgDailyMessages = daysElapsed > 0 ? weekly.totalMessages / daysElapsed : 0;

  // Project to end of week
  const totalDays = daysElapsed + weekly.daysRemaining;
  const projectedWeeklyTokens = Math.round(avgDailyTokens * totalDays);
  const projectedWeeklyMessages = Math.round(avgDailyMessages * totalDays);

  // Focus on token-based quota (more accurate for rate limiting)
  const willExceedTokens = projectedWeeklyTokens > config.limits.tokensPerWeek;
  const willExceedQuota = willExceedTokens;

  let recommendedAction: string;

  if (willExceedQuota) {
    const excessPercent = Math.round(
      ((projectedWeeklyTokens / config.limits.tokensPerWeek) - 1) * 100
    );
    recommendedAction = `At current pace, you may exceed token quota by ~${excessPercent}%. Consider reducing daily usage.`;
  } else {
    const remainingCapacity = config.limits.tokensPerWeek - projectedWeeklyTokens;
    recommendedAction = `On track to stay within quota with ~${formatTokens(remainingCapacity)} buffer.`;
  }

  return {
    projectedWeeklyTokens,
    projectedWeeklyMessages,
    willExceedQuota,
    recommendedAction,
  };
}
