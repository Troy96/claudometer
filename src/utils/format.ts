import chalk from 'chalk';

// Format duration from milliseconds to human readable
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return 'just now';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  if (seconds > 0) {
    return `${seconds}s`;
  }
  return 'just now';
}

// Format token count with K/M suffix
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `~${Math.round(tokens / 1000)}K`;
  }
  return String(tokens);
}

// Format percentage
export function formatPercent(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

// Create a progress bar
export function progressBar(
  percent: number,
  width: number = 10,
  options: {
    filled?: string;
    empty?: string;
    showPercent?: boolean;
  } = {}
): string {
  const { filled = '█', empty = '░', showPercent = false } = options;

  const clampedPercent = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clampedPercent / 100) * width);
  const emptyCount = width - filledCount;

  let bar = filled.repeat(filledCount) + empty.repeat(emptyCount);

  // Color based on usage level
  if (clampedPercent >= 90) {
    bar = chalk.red(bar);
  } else if (clampedPercent >= 75) {
    bar = chalk.yellow(bar);
  } else {
    bar = chalk.green(bar);
  }

  if (showPercent) {
    return `${bar} ${Math.round(clampedPercent)}%`;
  }

  return bar;
}

// Format a table row
export function tableRow(label: string, value: string, labelWidth: number = 20): string {
  return `  ${label.padEnd(labelWidth)} ${value}`;
}

// Create a section header
export function sectionHeader(title: string): string {
  return chalk.bold(title);
}

// Create a divider line
export function divider(char: string = '─', width: number = 25): string {
  return chalk.dim(char.repeat(width));
}

// Format a tip or hint
export function tip(message: string): string {
  return chalk.dim(`Tip: ${message}`);
}

// Format a warning
export function warning(message: string): string {
  return chalk.yellow(`⚠ ${message}`);
}

// Format an error
export function error(message: string): string {
  return chalk.red(`✗ ${message}`);
}

// Format success
export function success(message: string): string {
  return chalk.green(`✓ ${message}`);
}

// Format info
export function info(message: string): string {
  return chalk.blue(`ℹ ${message}`);
}

// Format a date relative to now
export function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    // Future date
    return formatDuration(-diffMs) + ' from now';
  }

  if (diffMs < 60000) {
    return 'just now';
  }

  return formatDuration(diffMs) + ' ago';
}

// Format time until reset
export function timeUntilReset(resetDate: Date): string {
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'now';
  }

  return `resets in ${formatDuration(diffMs)}`;
}

// Get day name
export function getDayName(dayIndex: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayIndex] || '';
}

// Format date as YYYY-MM-DD
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Format the main CLI header
export function cliHeader(): string {
  return chalk.bold('Claudometer') + '\n' + divider();
}

// Create a box around text
export function box(lines: string[], padding: number = 1): string {
  const maxWidth = Math.max(...lines.map(l => stripAnsi(l).length));
  const horizontal = '─'.repeat(maxWidth + padding * 2);
  const pad = ' '.repeat(padding);

  const result = [
    `┌${horizontal}┐`,
    ...lines.map(l => `│${pad}${l.padEnd(maxWidth)}${pad}│`),
    `└${horizontal}┘`,
  ];

  return result.join('\n');
}

// Strip ANSI codes for length calculation
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

// Format status indicator
export function statusIndicator(status: 'good' | 'warning' | 'critical'): string {
  switch (status) {
    case 'good':
      return chalk.green('●');
    case 'warning':
      return chalk.yellow('●');
    case 'critical':
      return chalk.red('●');
  }
}

// Create a sparkline chart from data points
export function sparkline(values: number[]): string {
  if (values.length === 0) return '';

  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  return values
    .map(v => {
      const normalized = (v - min) / range;
      const index = Math.min(Math.floor(normalized * chars.length), chars.length - 1);
      return chars[index];
    })
    .join('');
}

// Format a compact stat line
export function statLine(
  label: string,
  value: string | number,
  unit?: string
): string {
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;
  const unitStr = unit ? ` ${unit}` : '';
  return `${chalk.dim(label + ':')} ${formattedValue}${unitStr}`;
}
