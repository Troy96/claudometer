import {
  parseHistory,
  parseStatsCache,
  parseSessionIndexes,
  HistoryMessage,
  SessionMeta,
  StatsCache,
} from './parser.js';
import { loadConfig } from '../config/store.js';

// Cache for stats-cache.json data
let statsCacheData: StatsCache | null = null;
let statsCacheLoaded = false;

async function getStatsCache(): Promise<StatsCache | null> {
  if (!statsCacheLoaded) {
    statsCacheData = await parseStatsCache();
    statsCacheLoaded = true;
  }
  return statsCacheData;
}

// Get stats from stats-cache.json for a specific date
async function getStatsCacheForDate(dateStr: string): Promise<{
  messageCount: number;
  sessionCount: number;
  tokens: number;
} | null> {
  const cache = await getStatsCache();
  if (!cache) return null;

  const activity = cache.dailyActivity?.find(d => d.date === dateStr);
  const tokenData = cache.dailyModelTokens?.find(d => d.date === dateStr);

  if (!activity && !tokenData) return null;

  // Sum tokens across all models
  let tokens = 0;
  if (tokenData?.tokensByModel) {
    tokens = Object.values(tokenData.tokensByModel).reduce((sum, t) => sum + t, 0);
  }

  return {
    messageCount: activity?.messageCount || 0,
    sessionCount: activity?.sessionCount || 0,
    tokens,
  };
}

export interface SessionStats {
  sessionId: string;
  startTime: Date;
  duration: number;  // milliseconds
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  estimatedTokens: number;
  project?: string;
}

export interface DailyUsage {
  date: string;  // YYYY-MM-DD
  sessions: number;
  messages: number;
  userMessages: number;
  assistantMessages: number;
  estimatedTokens: number;
  projects: string[];
}

export interface WeeklyUsage {
  weekStart: string;  // YYYY-MM-DD
  weekEnd: string;
  days: DailyUsage[];
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  averageDailyTokens: number;
  averageDailyMessages: number;
  daysRemaining: number;
}

export interface HourlyPattern {
  hour: number;  // 0-23
  averageMessages: number;
  averageTokens: number;
  sessionCount: number;
}

export interface ProjectStats {
  project: string;
  sessions: number;
  messages: number;
  tokens: number;
  lastUsed: Date;
}

// Estimate tokens from message content length
// Rough approximation: ~4 characters per token for English
export function estimateTokens(messageLength: number): number {
  return Math.ceil(messageLength / 4);
}

// Cache for context multiplier (cache tokens / regular tokens ratio)
let cachedContextMultiplier: number | null = null;

// Get context multiplier from stats-cache (cache tokens vs regular tokens)
// Claude Code sends lots of context (files, history), so cache tokens dominate
async function getContextMultiplier(): Promise<number> {
  if (cachedContextMultiplier !== null) {
    return cachedContextMultiplier;
  }

  const DEFAULT_MULTIPLIER = 250; // Conservative default based on typical usage

  try {
    const cache = await getStatsCache();
    if (!cache?.modelUsage) {
      cachedContextMultiplier = DEFAULT_MULTIPLIER;
      return DEFAULT_MULTIPLIER;
    }

    // Sum across all models
    let totalRegular = 0;
    let totalCacheCreation = 0;

    for (const usage of Object.values(cache.modelUsage)) {
      totalRegular += (usage.inputTokens || 0) + (usage.outputTokens || 0);
      totalCacheCreation += usage.cacheCreationInputTokens || 0;
    }

    if (totalRegular > 0 && totalCacheCreation > 0) {
      // Cache creation tokens represent new context sent to API
      cachedContextMultiplier = Math.max(50, Math.min(500, totalCacheCreation / totalRegular));
    } else {
      cachedContextMultiplier = DEFAULT_MULTIPLIER;
    }
  } catch {
    cachedContextMultiplier = DEFAULT_MULTIPLIER;
  }

  return cachedContextMultiplier;
}

// Token multiplier for session estimation (user input -> full context)
const SESSION_TOKEN_MULTIPLIER = 300; // User input is ~0.3% of total context

async function getTokenMultiplier(): Promise<number> {
  return SESSION_TOKEN_MULTIPLIER;
}

// Default session gap: 2 hours in milliseconds
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

// Group messages into logical sessions based on time gaps
function groupMessagesByTimeGap(
  messages: HistoryMessage[],
  gapMs: number = SESSION_GAP_MS
): HistoryMessage[][] {
  if (messages.length === 0) return [];

  // Sort by timestamp ascending
  const sorted = [...messages].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const sessions: HistoryMessage[][] = [];
  let currentSession: HistoryMessage[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].timestamp).getTime();
    const currTime = new Date(sorted[i].timestamp).getTime();

    if (currTime - prevTime > gapMs) {
      // Gap too large, start a new session
      sessions.push(currentSession);
      currentSession = [sorted[i]];
    } else {
      currentSession.push(sorted[i]);
    }
  }

  // Don't forget the last session
  if (currentSession.length > 0) {
    sessions.push(currentSession);
  }

  return sessions;
}

// Get current session stats (using time-based grouping)
export async function getCurrentSession(): Promise<SessionStats | null> {
  const messages = await parseHistory();

  if (messages.length === 0) {
    return null;
  }

  // Group messages by time gaps (2 hour gap = new session)
  const logicalSessions = groupMessagesByTimeGap(messages);

  if (logicalSessions.length === 0) {
    return null;
  }

  // Get the most recent logical session
  const currentSessionMessages = logicalSessions[logicalSessions.length - 1];

  if (currentSessionMessages.length === 0) {
    return null;
  }

  // Use a composite ID from the session
  const sessionId = `logical-${new Date(currentSessionMessages[0].timestamp).getTime()}`;

  return await computeSessionStats(sessionId, currentSessionMessages);
}

// Compute stats for a session from its messages
async function computeSessionStats(
  sessionId: string,
  messages: HistoryMessage[]
): Promise<SessionStats> {
  const sorted = messages.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const startTime = new Date(sorted[0].timestamp);
  const endTime = new Date(sorted[sorted.length - 1].timestamp);
  const duration = endTime.getTime() - startTime.getTime();

  const userMessages = messages.filter(m => m.type === 'user');
  const assistantMessages = messages.filter(m => m.type === 'assistant');

  // Get token multiplier from historical data
  const multiplier = await getTokenMultiplier();

  // Estimate user input tokens from message length
  let userInputTokens = 0;
  for (const msg of messages) {
    if (msg.messageLength) {
      userInputTokens += estimateTokens(msg.messageLength);
    } else {
      // Default estimate per user message
      userInputTokens += 100;
    }
  }

  // Apply multiplier to estimate total session tokens (input + output + context)
  const estimatedTokens = Math.round(userInputTokens * multiplier);

  // Find project from messages
  const project = messages.find(m => m.project)?.project;

  return {
    sessionId,
    startTime,
    duration,
    messageCount: messages.length,
    userMessages: userMessages.length,
    assistantMessages: assistantMessages.length,
    estimatedTokens,
    project,
  };
}

// Get today's usage
export async function getTodayUsage(): Promise<DailyUsage> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return getDayUsage(today);
}

// Get usage for a specific day
export async function getDayUsage(date: Date): Promise<DailyUsage> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const dateStr = dayStart.toISOString().split('T')[0];

  // Try to get data from stats-cache.json first (more accurate)
  const cachedStats = await getStatsCacheForDate(dateStr);

  const messages = await parseHistory({ since: dayStart });
  const dayMessages = messages.filter(m => {
    const msgDate = new Date(m.timestamp);
    return msgDate >= dayStart && msgDate <= dayEnd;
  });

  // Count sessions using time-based grouping
  const logicalSessions = groupMessagesByTimeGap(dayMessages);
  const projects = new Set(dayMessages.map(m => m.project).filter(Boolean) as string[]);

  const userMessages = dayMessages.filter(m => m.type === 'user');
  const assistantMessages = dayMessages.filter(m => m.type === 'assistant');

  // Use cached token count if available, apply context multiplier for full usage
  const contextMultiplier = await getContextMultiplier();
  let estimatedTokens = 0;

  if (cachedStats?.tokens) {
    // Stats-cache has input/output tokens, multiply by context ratio for full usage
    estimatedTokens = Math.round(cachedStats.tokens * contextMultiplier);
  } else {
    // Estimate from user messages with full multiplier
    for (const msg of dayMessages) {
      if (msg.messageLength) {
        estimatedTokens += estimateTokens(msg.messageLength);
      } else {
        estimatedTokens += 100; // Default per message
      }
    }
    estimatedTokens = Math.round(estimatedTokens * SESSION_TOKEN_MULTIPLIER);
  }

  // Use cached message count if available (includes assistant messages)
  const totalMessages = cachedStats?.messageCount || dayMessages.length;

  return {
    date: dateStr,
    sessions: logicalSessions.length,
    messages: totalMessages,
    userMessages: userMessages.length,
    assistantMessages: cachedStats ? (totalMessages - userMessages.length) : assistantMessages.length,
    estimatedTokens,
    projects: Array.from(projects),
  };
}

// Get weekly usage
export async function getWeeklyUsage(): Promise<WeeklyUsage> {
  const config = loadConfig();
  const now = new Date();

  // Calculate week start based on config
  const weekStart = getWeekStart(now, config.weekStartDay);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Get usage for each day of the week
  const days: DailyUsage[] = [];
  const currentDate = new Date(weekStart);

  while (currentDate <= now) {
    const dayUsage = await getDayUsage(currentDate);
    days.push(dayUsage);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Compute totals
  const totalSessions = days.reduce((sum, d) => sum + d.sessions, 0);
  const totalMessages = days.reduce((sum, d) => sum + d.messages, 0);
  const totalTokens = days.reduce((sum, d) => sum + d.estimatedTokens, 0);

  const daysWithUsage = days.filter(d => d.messages > 0).length;
  const averageDailyTokens = daysWithUsage > 0 ? Math.round(totalTokens / daysWithUsage) : 0;
  const averageDailyMessages = daysWithUsage > 0 ? Math.round(totalMessages / daysWithUsage) : 0;

  // Calculate days remaining in the week
  const daysRemaining = Math.max(0, 7 - days.length);

  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0],
    days,
    totalSessions,
    totalMessages,
    totalTokens,
    averageDailyTokens,
    averageDailyMessages,
    daysRemaining,
  };
}

// Get the start of the week for a given date
function getWeekStart(date: Date, weekStartDay: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  const currentDay = result.getDay();
  const diff = (currentDay - weekStartDay + 7) % 7;

  result.setDate(result.getDate() - diff);
  return result;
}

// Get hourly usage patterns
export async function getHourlyPatterns(): Promise<HourlyPattern[]> {
  const messages = await parseHistory();

  // Group by hour
  const hourlyData: Map<number, { messages: number; tokens: number; sessions: Set<string> }> = new Map();

  for (let i = 0; i < 24; i++) {
    hourlyData.set(i, { messages: 0, tokens: 0, sessions: new Set() });
  }

  for (const msg of messages) {
    const hour = new Date(msg.timestamp).getHours();
    const data = hourlyData.get(hour)!;

    data.messages++;
    data.sessions.add(msg.sessionId);

    if (msg.tokens) {
      data.tokens += msg.tokens;
    } else if (msg.messageLength) {
      data.tokens += estimateTokens(msg.messageLength);
    }
  }

  // Calculate averages (rough estimate - divide by approximate number of days)
  const allDates = new Set(messages.map(m =>
    new Date(m.timestamp).toISOString().split('T')[0]
  ));
  const totalDays = Math.max(allDates.size, 1);

  return Array.from(hourlyData.entries()).map(([hour, data]) => ({
    hour,
    averageMessages: Math.round(data.messages / totalDays),
    averageTokens: Math.round(data.tokens / totalDays),
    sessionCount: data.sessions.size,
  }));
}

// Get per-project stats
export async function getProjectStats(): Promise<ProjectStats[]> {
  const messages = await parseHistory();
  const projectData: Map<string, {
    sessions: Set<string>;
    messages: number;
    tokens: number;
    lastUsed: Date;
  }> = new Map();

  for (const msg of messages) {
    const project = msg.project || msg.cwd || 'unknown';

    if (!projectData.has(project)) {
      projectData.set(project, {
        sessions: new Set(),
        messages: 0,
        tokens: 0,
        lastUsed: new Date(0),
      });
    }

    const data = projectData.get(project)!;
    data.sessions.add(msg.sessionId);
    data.messages++;

    if (msg.tokens) {
      data.tokens += msg.tokens;
    } else if (msg.messageLength) {
      data.tokens += estimateTokens(msg.messageLength);
    }

    const msgDate = new Date(msg.timestamp);
    if (msgDate > data.lastUsed) {
      data.lastUsed = msgDate;
    }
  }

  return Array.from(projectData.entries())
    .map(([project, data]) => ({
      project,
      sessions: data.sessions.size,
      messages: data.messages,
      tokens: data.tokens,
      lastUsed: data.lastUsed,
    }))
    .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
}

// Get all session stats (using time-based grouping)
export async function getAllSessions(): Promise<SessionStats[]> {
  const messages = await parseHistory();

  // Group messages by time gaps instead of sessionId
  const logicalSessions = groupMessagesByTimeGap(messages);

  // Compute stats for each logical session
  const sessionPromises = logicalSessions.map((msgs) => {
    const sessionId = `logical-${new Date(msgs[0].timestamp).getTime()}`;
    return computeSessionStats(sessionId, msgs);
  });

  const sessions = await Promise.all(sessionPromises);
  return sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}

// Get recent trend data (last N days)
export async function getRecentTrend(days: number = 7): Promise<DailyUsage[]> {
  const result: DailyUsage[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    result.push(await getDayUsage(date));
  }

  return result;
}
