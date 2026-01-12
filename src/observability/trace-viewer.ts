import type { EvalTrace, ToolCall, Question, Decision, TestFailure } from './types.js';

// ANSI color codes for terminal styling
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  brightBlack: '\x1b[90m',
  brightCyan: '\x1b[96m',
  brightMagenta: '\x1b[95m',
  brightYellow: '\x1b[93m',
};

const s = {
  bold: (t: string) => `${colors.bold}${t}${colors.reset}`,
  dim: (t: string) => `${colors.dim}${t}${colors.reset}`,
  success: (t: string) => `${colors.green}${t}${colors.reset}`,
  error: (t: string) => `${colors.red}${t}${colors.reset}`,
  warning: (t: string) => `${colors.yellow}${t}${colors.reset}`,
  info: (t: string) => `${colors.cyan}${t}${colors.reset}`,
  highlight: (t: string) => `${colors.brightMagenta}${t}${colors.reset}`,
  muted: (t: string) => `${colors.brightBlack}${t}${colors.reset}`,
  number: (t: string) => `${colors.brightYellow}${t}${colors.reset}`,
  primary: (t: string) => `${colors.brightCyan}${t}${colors.reset}`,
};

const box = {
  horizontal: '─',
  dHorizontal: '═',
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  vertical: '│',
  tLeft: '├',
  tRight: '┤',
};

export interface ViewOptions {
  json: boolean;
  verbose: boolean;
  showToolCalls: boolean;
  showQuestions: boolean;
  showDecisions: boolean;
}

const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  json: false,
  verbose: false,
  showToolCalls: false,
  showQuestions: true,
  showDecisions: true,
};

export function formatTrace(trace: EvalTrace, options: Partial<ViewOptions> = {}): string {
  const opts = { ...DEFAULT_VIEW_OPTIONS, ...options };

  if (opts.json) {
    return JSON.stringify(trace, null, 2);
  }

  const lines: string[] = [];
  const w = 60;

  // Header
  lines.push('');
  lines.push(s.primary(box.dHorizontal.repeat(w)));
  lines.push(`  📊 ${s.bold('Trace')} ${s.muted(trace.id)}`);
  lines.push(s.primary(box.dHorizontal.repeat(w)));
  lines.push('');

  // Overview
  lines.push(`   ${s.dim('Status:')}      ${formatStatus(trace.status)}`);
  lines.push(`   ${s.dim('Started:')}     ${s.muted(formatDate(trace.startedAt))}`);
  lines.push(`   ${s.dim('Duration:')}    ${s.number(formatDuration(trace.duration))}`);
  lines.push(`   ${s.dim('Eval ID:')}     ${s.muted(trace.evalId)}`);
  lines.push('');

  // Introspection section
  lines.push(sectionHeader('📂 Introspection'));
  lines.push(kv('Files analyzed', s.number(String(trace.introspection.filesAnalyzed.length))));
  lines.push(kv('Functions found', s.number(String(trace.introspection.totalFunctions))));
  lines.push(kv('Classes found', s.number(String(trace.introspection.totalClasses))));
  lines.push(kv('Duration', s.number(formatDuration(trace.introspection.duration))));
  lines.push('');

  // Analysis section
  lines.push(sectionHeader('🧠 Analysis'));
  lines.push(kv('Tool calls', s.number(String(trace.analysis.toolCalls.length))));
  lines.push(kv('Questions asked', s.number(String(trace.analysis.questionsAsked.length))));
  lines.push(kv('Decisions made', s.number(String(trace.analysis.decisions.length))));
  lines.push(kv('Prompt tokens', s.number(trace.analysis.promptTokens.toLocaleString())));
  lines.push(kv('Completion tokens', s.number(trace.analysis.completionTokens.toLocaleString())));
  lines.push('');

  // Generation section
  lines.push(sectionHeader('📝 Generation'));
  lines.push(kv('Scenarios', s.number(String(trace.generation.scenariosGenerated))));
  lines.push(kv('Files written', s.number(String(trace.generation.filesWritten.length))));
  lines.push('');

  // Execution section
  lines.push(sectionHeader('🧪 Execution'));
  lines.push(`   ${s.success('✓')} Passed:   ${s.success(String(trace.execution.testsPassed))}`);
  lines.push(`   ${s.error('✗')} Failed:   ${s.error(String(trace.execution.testsFailed))}`);
  lines.push(`   ${s.muted('○')} Skipped:  ${s.muted(String(trace.execution.testsSkipped ?? 0))}`);
  lines.push('');

  // Questions section
  if (opts.showQuestions && trace.analysis.questionsAsked.length > 0) {
    lines.push(sectionHeader('❓ Questions Asked'));
    for (const q of trace.analysis.questionsAsked) {
      lines.push(formatQuestion(q));
    }
    lines.push('');
  }

  // Decisions section
  if (opts.showDecisions && trace.analysis.decisions.length > 0) {
    lines.push(sectionHeader('🎯 Key Decisions'));
    for (const d of trace.analysis.decisions.slice(0, 10)) {
      lines.push(formatDecision(d));
    }
    if (trace.analysis.decisions.length > 10) {
      lines.push(`   ${s.dim(`... and ${trace.analysis.decisions.length - 10} more`)}`);
    }
    lines.push('');
  }

  // Tool calls section
  if (opts.showToolCalls && trace.analysis.toolCalls.length > 0) {
    lines.push(sectionHeader('🔧 Tool Calls'));
    for (const tc of trace.analysis.toolCalls.slice(0, 20)) {
      lines.push(formatToolCall(tc, opts.verbose));
    }
    if (trace.analysis.toolCalls.length > 20) {
      lines.push(`   ${s.dim(`... and ${trace.analysis.toolCalls.length - 20} more`)}`);
    }
    lines.push('');
  }

  // Test failures section
  if (trace.execution.failures.length > 0) {
    lines.push(sectionHeader('❌ Test Failures'));
    for (const f of trace.execution.failures) {
      lines.push(formatFailure(f));
    }
    lines.push('');
  }

  // Errors section
  if (trace.errors.length > 0) {
    lines.push(sectionHeader('⚠️ Errors'));
    for (const e of trace.errors) {
      lines.push(`   ${s.dim('[')}${s.muted(formatDate(e.timestamp))}${s.dim(']')}`);
      lines.push(`   ${s.error(e.message)}`);
      if (e.context) {
        lines.push(`   ${s.dim('Context:')} ${e.context}`);
      }
      lines.push('');
    }
  }

  lines.push(s.primary(box.dHorizontal.repeat(w)));
  lines.push('');

  return lines.join('\n');
}

function sectionHeader(title: string): string {
  return `${s.dim(box.horizontal.repeat(3))} ${s.bold(title)} ${s.dim(box.horizontal.repeat(Math.max(0, 35 - title.length)))}`;
}

function kv(key: string, value: string): string {
  return `   ${s.dim(key + ':')} ${value}`;
}

function formatStatus(status: EvalTrace['status']): string {
  switch (status) {
    case 'success':
      return s.success('✓ Success');
    case 'partial':
      return s.warning('⚠ Partial');
    case 'failed':
      return s.error('✗ Failed');
    default:
      return status;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function formatQuestion(q: Question): string {
  const lines: string[] = [];
  lines.push(`   ${s.highlight('Q:')} ${q.question}`);
  if (q.answer) {
    lines.push(`   ${s.info('A:')} ${q.answer}`);
  } else {
    lines.push(`   ${s.dim('A: (no answer)')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatDecision(d: Decision): string {
  const icon = d.type === 'include' ? s.success('✓') : d.type === 'exclude' ? s.error('✗') : s.info('→');
  const conf = (d.confidence * 100).toFixed(0);
  return `   ${icon} ${s.dim(`[${d.type}]`)} ${d.subject}\n      ${s.dim('Reason:')} ${d.reasoning}\n      ${s.dim('Confidence:')} ${s.number(conf + '%')}\n`;
}

function formatToolCall(tc: ToolCall, verbose: boolean): string {
  const duration = formatDuration(tc.duration);
  if (verbose) {
    const input = JSON.stringify(tc.input).slice(0, 100);
    return `   ${s.info(tc.tool)} ${s.dim(`(${duration})`)}\n      ${s.dim('Input:')} ${input}...\n`;
  }
  return `   ${s.info(tc.tool)} ${s.dim(`(${duration})`)}`;
}

function formatFailure(f: TestFailure): string {
  const lines: string[] = [];
  lines.push(`   ${s.error('•')} ${s.bold(f.testName)}`);
  lines.push(`      ${s.dim('Scenario:')} ${f.scenarioId}`);
  lines.push(`      ${s.dim('Error:')} ${s.error(f.error)}`);
  if (f.expected !== undefined && f.actual !== undefined) {
    lines.push(`      ${s.dim('Expected:')} ${s.success(JSON.stringify(f.expected))}`);
    lines.push(`      ${s.dim('Actual:')}   ${s.error(JSON.stringify(f.actual))}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function formatTraceList(traces: Array<{ 
  id: string; 
  startedAt: string; 
  status: string; 
  duration: number;
  testsPassed: number;
  testsFailed: number;
}>): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push(`  ${s.bold('📋 Recent Traces')}`);
  lines.push(s.primary(`  ${box.dHorizontal.repeat(76)}`));
  lines.push('');
  
  // Header row
  const hId = s.dim('ID'.padEnd(38));
  const hStatus = s.dim('Status'.padEnd(10));
  const hPassed = s.dim('Passed'.padStart(8));
  const hFailed = s.dim('Failed'.padStart(8));
  const hDuration = s.dim('Duration'.padStart(10));
  lines.push(`  ${hId}${hStatus}${hPassed}${hFailed}${hDuration}`);
  lines.push(s.dim(`  ${box.horizontal.repeat(76)}`));

  for (const t of traces) {
    const id = s.muted(t.id.slice(0, 36).padEnd(38));
    
    let statusIcon: string;
    if (t.status === 'success') {
      statusIcon = s.success('✓ Pass'.padEnd(10));
    } else if (t.status === 'partial') {
      statusIcon = s.warning('⚠ Partial'.padEnd(10));
    } else {
      statusIcon = s.error('✗ Fail'.padEnd(10));
    }
    
    const passed = s.success(String(t.testsPassed).padStart(8));
    const failed = t.testsFailed > 0 
      ? s.error(String(t.testsFailed).padStart(8))
      : s.dim(String(t.testsFailed).padStart(8));
    const duration = s.number(formatDuration(t.duration).padStart(10));
    
    lines.push(`  ${id}${statusIcon}${passed}${failed}${duration}`);
  }

  lines.push('');
  lines.push(`  ${s.dim('View a trace:')} ${s.info('evaluclaude view <trace-id>')}`);
  lines.push('');
  
  return lines.join('\n');
}
