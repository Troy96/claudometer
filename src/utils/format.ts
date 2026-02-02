import chalk from 'chalk';

// Claude Code inspired orange/amber accent
const accent = chalk.hex('#CC5500');  // Burnt orange
const accentDim = chalk.hex('#996633');  // Muted amber

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
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
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
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return String(tokens);
}

// Format percentage
export function formatPercent(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

// Create a progress bar - clean minimal style
export function progressBar(
  percent: number,
  width: number = 12,
  options: {
    showPercent?: boolean;
    colorize?: boolean;
  } = {}
): string {
  const { showPercent = false, colorize = true } = options;

  const clampedPercent = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clampedPercent / 100) * width);
  const emptyCount = width - filledCount;

  const filledChar = '━';
  const emptyChar = chalk.dim('─');

  let filledPart = filledChar.repeat(filledCount);

  if (colorize) {
    if (clampedPercent >= 90) {
      filledPart = chalk.red(filledPart);
    } else if (clampedPercent >= 75) {
      filledPart = chalk.yellow(filledPart);
    } else {
      filledPart = accent(filledPart);
    }
  } else {
    filledPart = accent(filledPart);
  }

  const bar = filledPart + emptyChar.repeat(emptyCount);

  if (showPercent) {
    const percentStr = `${Math.round(clampedPercent)}%`.padStart(4);
    return `${bar} ${chalk.dim(percentStr)}`;
  }

  return bar;
}

// Create a mini bar chart for daily breakdown
export function miniBar(value: number, maxValue: number, width: number = 8): string {
  if (maxValue === 0) return chalk.dim('·'.repeat(width));

  const ratio = Math.min(value / maxValue, 1);
  const filledCount = Math.round(ratio * width);
  const emptyCount = width - filledCount;

  return accent('▮'.repeat(filledCount)) + chalk.dim('·'.repeat(emptyCount));
}

// Format a table row with dim label
export function tableRow(label: string, value: string, labelWidth: number = 18): string {
  return `  ${chalk.dim(label.padEnd(labelWidth))} ${value}`;
}

// Create a section header - clean style
export function sectionHeader(title: string): string {
  return chalk.bold.white(title);
}

// Create a subtle divider
export function divider(): string {
  return '';
}

// Format a tip or hint
export function tip(message: string): string {
  return chalk.dim(`  ${message}`);
}

// Format a warning
export function warning(message: string): string {
  return chalk.yellow(`  ⚠ ${message}`);
}

// Format an error
export function error(message: string): string {
  return chalk.red(`  ✗ ${message}`);
}

// Format success
export function success(message: string): string {
  return chalk.green(`  ✓ ${message}`);
}

// Format info
export function info(message: string): string {
  return chalk.dim(`  ℹ ${message}`);
}

// Format a date relative to now
export function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
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

  return formatDuration(diffMs);
}

// Get day name
export function getDayName(dayIndex: number, short: boolean = true): string {
  const days = short
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayIndex] || '';
}

// Format date as YYYY-MM-DD
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Get terminal width or default
function getTerminalWidth(): number {
  return process.stdout.columns || 100;
}

// ASCII art logo for CLAUDETRAIL
const ASCII_LOGO = [
  '█▀▀ █   █▀█ █ █ █▀▄ █▀▀ ▀█▀ █▀█ █▀█ ▀█▀ █  ',
  '█   █   █▀█ █ █ █ █ █▀▀  █  █▀▄ █▀█  █  █  ',
  '▀▀▀ ▀▀▀ ▀ ▀ ▀▀▀ ▀▀  ▀▀▀  ▀  ▀ ▀ ▀ ▀ ▀▀▀ ▀▀▀',
];

// Format the main CLI header - fixed-width banner box
export function cliHeader(subtitle?: string): string {
  const bannerWidth = 70; // Fixed width for a clean box look
  const innerWidth = bannerWidth - 4; // Account for thicker borders

  // Thick border characters
  const topLeft = accent('╔');
  const topRight = accent('╗');
  const bottomLeft = accent('╚');
  const bottomRight = accent('╝');
  const horizontal = accent('═');
  const vertical = accent('║');

  const top = topLeft + horizontal.repeat(innerWidth + 2) + topRight;
  const bottom = bottomLeft + horizontal.repeat(innerWidth + 2) + bottomRight;

  // Empty line helper
  const emptyLine = () => `${vertical}${' '.repeat(innerWidth + 2)}${vertical}`;

  // Padded line helper
  const paddedLine = (content: string, leftPad: number = 2) => {
    const contentLen = stripAnsi(content).length;
    const rightPad = Math.max(0, innerWidth - contentLen - leftPad + 2);
    return `${vertical}${' '.repeat(leftPad)}${content}${' '.repeat(rightPad)}${vertical}`;
  };

  // Center a line
  const centerLine = (content: string) => {
    const contentLen = stripAnsi(content).length;
    const totalPad = innerWidth + 2 - contentLen;
    const leftPad = Math.floor(totalPad / 2);
    const rightPad = totalPad - leftPad;
    return `${vertical}${' '.repeat(leftPad)}${content}${' '.repeat(rightPad)}${vertical}`;
  };

  // Build the banner
  const lines: string[] = [];

  // Top border
  lines.push(top);
  lines.push(emptyLine());

  // ASCII art logo - centered
  for (const logoLine of ASCII_LOGO) {
    lines.push(centerLine(accent(logoLine)));
  }

  lines.push(emptyLine());

  // Tagline
  const tagline = chalk.dim('━━━  Usage Analytics for Claude Code  ━━━');
  lines.push(centerLine(tagline));

  lines.push(emptyLine());

  // Divider line
  const dividerWidth = Math.min(50, innerWidth - 10);
  const dividerPad = Math.floor((innerWidth + 2 - dividerWidth) / 2);
  const divider = accent('▔'.repeat(dividerWidth));
  lines.push(`${vertical}${' '.repeat(dividerPad)}${divider}${' '.repeat(innerWidth + 2 - dividerPad - dividerWidth)}${vertical}`);

  lines.push(emptyLine());

  // Subtitle / context line
  if (subtitle) {
    const subContent = accent('◆') + ' ' + chalk.bold.white(subtitle);
    lines.push(paddedLine(subContent, 4));
  } else {
    const hint = accent('◆') + ' ' + chalk.dim('Track your session and weekly usage');
    lines.push(paddedLine(hint, 4));
  }

  // Version and help
  const versionInfo = chalk.dim(`v1.0.0`) + chalk.dim('  │  ') + chalk.dim('claudetrail --help for commands');
  lines.push(paddedLine(versionInfo, 4));

  lines.push(emptyLine());
  lines.push(bottom);

  return lines.join('\n');
}

// Strip ANSI codes for length calculation
export function stripAnsi(str: string): string {
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
      return accent(chars[index]);
    })
    .join('');
}

// Format a compact stat line
export function statLine(label: string, value: string | number, unit?: string): string {
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;
  const unitStr = unit ? ` ${unit}` : '';
  return `${chalk.dim(label)} ${formattedValue}${unitStr}`;
}

// Format a key-value pair inline
export function kvPair(key: string, value: string | number): string {
  return `${chalk.dim(key + ':')} ${value}`;
}

// Create a labeled section
export function section(title: string, content: string[]): string {
  return [
    sectionHeader(title),
    ...content
  ].join('\n');
}

// Format number with commas
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Create a simple horizontal rule
export function hr(width: number = 40): string {
  return chalk.dim('─'.repeat(width));
}

// Box for highlighting important info
export function highlightBox(lines: string[]): string {
  const maxWidth = Math.max(...lines.map(l => stripAnsi(l).length));
  const border = chalk.dim('│');

  return lines.map(line => `  ${border} ${line.padEnd(maxWidth)} ${border}`).join('\n');
}
