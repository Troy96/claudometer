import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { homedir } from 'os';

// Types for Claude Code data structures

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface DailyModelTokens {
  date: string;
  tokensByModel: Record<string, number>;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: DailyActivity[];
  dailyModelTokens: DailyModelTokens[];
  modelUsage: Record<string, ModelUsage>;
}

export interface HistoryMessage {
  timestamp: string;
  sessionId: string;
  project?: string;
  type: 'user' | 'assistant';
  tokens?: number;
  messageLength?: number;
  model?: string;
  uuid?: string;
  cwd?: string;
}

export interface SessionIndex {
  sessions: SessionMeta[];
}

export interface SessionMeta {
  sessionId: string;
  startTime: string;
  endTime?: string;
  messageCount: number;
  projectPath?: string;
}

// Get Claude Code data directory
export function getClaudeDir(): string {
  return path.join(homedir(), '.claude');
}

// Parse stats-cache.json
export async function parseStatsCache(): Promise<StatsCache | null> {
  const filePath = path.join(getClaudeDir(), 'stats-cache.json');

  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content) as StatsCache;
  } catch (error) {
    return null;
  }
}

// Parse history.jsonl - stream-based for large files
export async function parseHistory(options?: {
  since?: Date;
  sessionId?: string;
  limit?: number;
}): Promise<HistoryMessage[]> {
  const filePath = path.join(getClaudeDir(), 'history.jsonl');
  const messages: HistoryMessage[] = [];

  try {
    if (!fs.existsSync(filePath)) {
      return messages;
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        const message = parseHistoryEntry(entry);

        if (message) {
          // Apply filters
          if (options?.since && new Date(message.timestamp) < options.since) {
            continue;
          }
          if (options?.sessionId && message.sessionId !== options.sessionId) {
            continue;
          }

          messages.push(message);

          if (options?.limit && messages.length >= options.limit) {
            break;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch (error) {
    // File doesn't exist or can't be read
  }

  return messages;
}

// Parse a single history entry (handles various formats)
function parseHistoryEntry(entry: unknown): HistoryMessage | null {
  if (!entry || typeof entry !== 'object') return null;

  const obj = entry as Record<string, unknown>;

  // Try to extract common fields
  const rawTimestamp = obj.timestamp || obj.ts || obj.time;
  const sessionId = obj.sessionId || obj.session_id || obj.session;

  if (!rawTimestamp || !sessionId) return null;

  // Convert timestamp to ISO string
  let timestamp: string;
  if (typeof rawTimestamp === 'number') {
    timestamp = new Date(rawTimestamp).toISOString();
  } else {
    timestamp = String(rawTimestamp);
  }

  // Determine message type and extract info
  let type: 'user' | 'assistant' = 'user';
  let tokens = 0;
  let messageLength = 0;

  if (obj.type === 'assistant' || obj.role === 'assistant') {
    type = 'assistant';
  }

  if (typeof obj.tokens === 'number') {
    tokens = obj.tokens;
  } else if (obj.usage && typeof obj.usage === 'object') {
    const usage = obj.usage as Record<string, number>;
    tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
  }

  // Check various fields for message content
  if (typeof obj.message === 'string') {
    messageLength = obj.message.length;
  } else if (typeof obj.content === 'string') {
    messageLength = obj.content.length;
  } else if (typeof obj.display === 'string') {
    messageLength = obj.display.length;
  }

  return {
    timestamp,
    sessionId: String(sessionId),
    project: obj.project ? String(obj.project) : undefined,
    type,
    tokens: tokens || undefined,
    messageLength: messageLength || undefined,
    model: obj.model ? String(obj.model) : undefined,
    uuid: obj.uuid ? String(obj.uuid) : undefined,
    cwd: obj.cwd ? String(obj.cwd) : undefined
  };
}

// Get all session indexes from projects
export async function parseSessionIndexes(): Promise<SessionMeta[]> {
  const projectsDir = path.join(getClaudeDir(), 'projects');
  const sessions: SessionMeta[] = [];

  try {
    if (!fs.existsSync(projectsDir)) {
      return sessions;
    }

    const projects = await fs.promises.readdir(projectsDir);

    for (const project of projects) {
      const indexPath = path.join(projectsDir, project, 'sessions-index.json');

      try {
        if (fs.existsSync(indexPath)) {
          const content = await fs.promises.readFile(indexPath, 'utf-8');
          const index = JSON.parse(content) as SessionIndex;

          if (index.sessions) {
            sessions.push(...index.sessions.map(s => ({
              ...s,
              projectPath: project
            })));
          }
        }
      } catch {
        // Skip malformed files
      }
    }
  } catch (error) {
    // Projects directory doesn't exist
  }

  return sessions;
}

// Get the most recent session ID from history
export async function getCurrentSessionId(): Promise<string | null> {
  const messages = await parseHistory({ limit: 100 });

  if (messages.length === 0) return null;

  // Get the most recent message and its session
  const sorted = messages.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return sorted[0]?.sessionId || null;
}

// Get messages for a specific session
export async function getSessionMessages(sessionId: string): Promise<HistoryMessage[]> {
  return parseHistory({ sessionId });
}

// Watch history file for changes
export function watchHistory(callback: (messages: HistoryMessage[]) => void): fs.FSWatcher | null {
  const filePath = path.join(getClaudeDir(), 'history.jsonl');

  try {
    let lastSize = 0;

    if (fs.existsSync(filePath)) {
      lastSize = fs.statSync(filePath).size;
    }

    return fs.watch(filePath, async (eventType) => {
      if (eventType === 'change') {
        const newSize = fs.statSync(filePath).size;

        if (newSize > lastSize) {
          // Read only new content
          const stream = fs.createReadStream(filePath, {
            start: lastSize,
            encoding: 'utf-8'
          });

          const newMessages: HistoryMessage[] = [];
          let buffer = '';

          stream.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const entry = JSON.parse(line);
                const message = parseHistoryEntry(entry);
                if (message) newMessages.push(message);
              } catch {
                // Skip malformed lines
              }
            }
          });

          stream.on('end', () => {
            if (buffer.trim()) {
              try {
                const entry = JSON.parse(buffer);
                const message = parseHistoryEntry(entry);
                if (message) newMessages.push(message);
              } catch {
                // Skip
              }
            }

            if (newMessages.length > 0) {
              callback(newMessages);
            }
          });

          lastSize = newSize;
        }
      }
    });
  } catch {
    return null;
  }
}
