/**
 * Evaluclaude CLI Theme
 * Consistent styling, colors, and formatting for a beautiful CLI experience
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Bright foreground colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Semantic color helpers
export const style = {
  // Text styles
  bold: (text: string) => `${colors.bold}${text}${colors.reset}`,
  dim: (text: string) => `${colors.dim}${text}${colors.reset}`,
  italic: (text: string) => `${colors.italic}${text}${colors.reset}`,
  
  // Semantic colors
  success: (text: string) => `${colors.green}${text}${colors.reset}`,
  error: (text: string) => `${colors.red}${text}${colors.reset}`,
  warning: (text: string) => `${colors.yellow}${text}${colors.reset}`,
  info: (text: string) => `${colors.cyan}${text}${colors.reset}`,
  highlight: (text: string) => `${colors.brightMagenta}${text}${colors.reset}`,
  muted: (text: string) => `${colors.brightBlack}${text}${colors.reset}`,
  
  // Accent colors
  primary: (text: string) => `${colors.brightCyan}${text}${colors.reset}`,
  secondary: (text: string) => `${colors.brightBlue}${text}${colors.reset}`,
  accent: (text: string) => `${colors.brightMagenta}${text}${colors.reset}`,
  
  // Special combinations
  command: (text: string) => `${colors.bold}${colors.cyan}${text}${colors.reset}`,
  path: (text: string) => `${colors.brightBlue}${text}${colors.reset}`,
  number: (text: string) => `${colors.brightYellow}${text}${colors.reset}`,
  label: (text: string) => `${colors.dim}${text}${colors.reset}`,
};

// Icons for consistent visual language
export const icons = {
  // Status
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  pending: '○',
  running: '◐',
  
  // Actions
  arrow: '→',
  arrowRight: '▸',
  bullet: '•',
  check: '✓',
  cross: '✗',
  
  // Objects
  folder: '📁',
  file: '📄',
  code: '💻',
  test: '🧪',
  spec: '📋',
  trace: '📊',
  
  // Process
  rocket: '🚀',
  gear: '⚙',
  magnify: '🔍',
  brain: '🧠',
  lightning: '⚡',
  sparkle: '✨',
  
  // Results
  passed: '✅',
  failed: '❌',
  skipped: '⏭️',
  
  // Categories
  python: '🐍',
  typescript: '📘',
  javascript: '📙',
};

// Box drawing characters
export const box = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  tLeft: '├',
  tRight: '┤',
  cross: '┼',
  
  // Double lines
  dHorizontal: '═',
  dVertical: '║',
  dTopLeft: '╔',
  dTopRight: '╗',
  dBottomLeft: '╚',
  dBottomRight: '╝',
};

// Banner and branding
export const BANNER = `
${style.primary('  ╔═══════════════════════════════════════════════════════╗')}
${style.primary('  ║')}  ${style.bold(style.accent('evaluclaude'))}${style.muted(' · zero-to-evals in one command')}      ${style.primary('║')}
${style.primary('  ╚═══════════════════════════════════════════════════════╝')}
`;

export const BANNER_MINIMAL = `${style.accent('evaluclaude')} ${style.muted('·')} ${style.dim('zero-to-evals in one command')}`;

// Common output formatters
export function header(title: string): string {
  const width = 60;
  const padding = Math.max(0, width - title.length - 4);
  return `\n${style.primary(box.dHorizontal.repeat(width))}
${style.bold(title)}
${style.primary(box.dHorizontal.repeat(width))}\n`;
}

export function subheader(title: string): string {
  return `\n${style.bold(title)}\n${style.dim(box.horizontal.repeat(40))}`;
}

export function section(title: string): string {
  return `\n${style.dim(box.horizontal.repeat(4))} ${style.bold(title)} ${style.dim(box.horizontal.repeat(Math.max(0, 34 - title.length)))}`;
}

export function keyValue(key: string, value: string | number, indent = 0): string {
  const pad = '  '.repeat(indent);
  return `${pad}${style.label(key + ':')} ${value}`;
}

export function bullet(text: string, indent = 0): string {
  const pad = '  '.repeat(indent);
  return `${pad}${style.dim(icons.bullet)} ${text}`;
}

export function step(num: number, text: string, status: 'pending' | 'running' | 'done' | 'error' = 'pending'): string {
  const statusIcon = {
    pending: style.dim(`${num}.`),
    running: style.info(`${icons.running}`),
    done: style.success(icons.success),
    error: style.error(icons.error),
  }[status];
  
  return `  ${statusIcon} ${status === 'done' ? style.muted(text) : text}`;
}

export function progressBar(current: number, total: number, width = 30): string {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  
  const bar = style.success('█'.repeat(filled)) + style.dim('░'.repeat(empty));
  return `${bar} ${style.muted(`${percentage}%`)}`;
}

export function table(rows: string[][]): string {
  if (rows.length === 0) return '';
  
  const colWidths = rows[0].map((_, i) => 
    Math.max(...rows.map(row => (row[i] || '').length))
  );
  
  return rows.map(row => 
    row.map((cell, i) => cell.padEnd(colWidths[i])).join('  ')
  ).join('\n');
}

// Spinner for async operations
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private text: string;
  
  constructor(text: string) {
    this.text = text;
  }
  
  start(): void {
    process.stdout.write('\x1b[?25l'); // Hide cursor
    this.render();
    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 80);
  }
  
  private render(): void {
    process.stdout.write(`\r${style.info(this.frames[this.frameIndex])} ${this.text}`);
  }
  
  update(text: string): void {
    this.text = text;
    this.render();
  }
  
  succeed(text?: string): void {
    this.stop();
    console.log(`\r${style.success(icons.success)} ${text || this.text}`);
  }
  
  fail(text?: string): void {
    this.stop();
    console.log(`\r${style.error(icons.error)} ${text || this.text}`);
  }
  
  warn(text?: string): void {
    this.stop();
    console.log(`\r${style.warning(icons.warning)} ${text || this.text}`);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    process.stdout.write('\x1b[?25h'); // Show cursor
    process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
  }
}

// Result summary box
export function resultBox(results: { passed: number; failed: number; skipped?: number; duration?: number }): string {
  const { passed, failed, skipped = 0, duration } = results;
  const total = passed + failed + skipped;
  const lines: string[] = [];
  
  lines.push(style.primary(`  ${box.topLeft}${box.horizontal.repeat(38)}${box.topRight}`));
  lines.push(style.primary(`  ${box.vertical}`) + ' '.repeat(38) + style.primary(box.vertical));
  lines.push(style.primary(`  ${box.vertical}`) + `   ${style.bold('Test Results')}`.padEnd(45) + style.primary(box.vertical));
  lines.push(style.primary(`  ${box.vertical}`) + ' '.repeat(38) + style.primary(box.vertical));
  lines.push(style.primary(`  ${box.vertical}`) + `   ${style.success(icons.passed)} Passed:  ${String(passed).padStart(4)}`.padEnd(45) + style.primary(box.vertical));
  lines.push(style.primary(`  ${box.vertical}`) + `   ${style.error(icons.failed)} Failed:  ${String(failed).padStart(4)}`.padEnd(45) + style.primary(box.vertical));
  
  if (skipped > 0) {
    lines.push(style.primary(`  ${box.vertical}`) + `   ${icons.skipped} Skipped: ${String(skipped).padStart(4)}`.padEnd(42) + style.primary(box.vertical));
  }
  
  lines.push(style.primary(`  ${box.vertical}`) + style.dim(`   ${'─'.repeat(20)}`).padEnd(45) + style.primary(box.vertical));
  lines.push(style.primary(`  ${box.vertical}`) + `   Total:     ${String(total).padStart(4)}`.padEnd(45) + style.primary(box.vertical));
  
  if (duration !== undefined) {
    lines.push(style.primary(`  ${box.vertical}`) + `   Duration:  ${formatDuration(duration)}`.padEnd(45) + style.primary(box.vertical));
  }
  
  lines.push(style.primary(`  ${box.vertical}`) + ' '.repeat(38) + style.primary(box.vertical));
  lines.push(style.primary(`  ${box.bottomLeft}${box.horizontal.repeat(38)}${box.bottomRight}`));
  
  return lines.join('\n');
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// Error formatting with suggestions
export function formatError(message: string, suggestions?: string[]): string {
  const lines: string[] = [];
  lines.push(`\n${style.error(`${icons.error} Error:`)} ${message}`);
  
  if (suggestions && suggestions.length > 0) {
    lines.push('');
    lines.push(style.dim('  Suggestions:'));
    for (const suggestion of suggestions) {
      lines.push(`    ${style.dim(icons.arrowRight)} ${suggestion}`);
    }
  }
  
  lines.push('');
  return lines.join('\n');
}

// Command examples helper
export function commandExample(command: string, description?: string): string {
  if (description) {
    return `  ${style.command(command)}  ${style.dim(description)}`;
  }
  return `  ${style.command(command)}`;
}

// Next steps helper
export function nextSteps(steps: { command: string; description: string }[]): string {
  const lines: string[] = [];
  lines.push(`\n${style.bold('Next steps:')}`);
  
  for (const step of steps) {
    lines.push(commandExample(step.command, step.description));
  }
  
  lines.push('');
  return lines.join('\n');
}

// Welcome message for first-time users
export function welcomeMessage(): string {
  return `
${BANNER}

${style.bold('Welcome to evaluclaude!')} ${icons.sparkle}

Generate functional tests for any codebase with the power of Claude.

${style.bold('Quick Start:')}

  ${style.command('evaluclaude pipeline .')}     ${style.dim('Full pipeline: analyze → render → run')}
  ${style.command('evaluclaude intro .')}        ${style.dim('Introspect codebase structure')}
  ${style.command('evaluclaude analyze .')}      ${style.dim('Generate EvalSpec with Claude')}

${style.bold('Learn More:')}

  ${style.command('evaluclaude --help')}         ${style.dim('Show all commands')}
  ${style.command('evaluclaude <cmd> --help')}   ${style.dim('Help for specific command')}

${style.muted('Documentation: https://github.com/harivansh-afk/evaluclaude-harness')}
`;
}
