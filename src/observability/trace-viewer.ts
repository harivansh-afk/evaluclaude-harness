import type { EvalTrace, ToolCall, Question, Decision, TestFailure } from './types.js';

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

  lines.push('');
  lines.push('═'.repeat(60));
  lines.push(`📊 Trace: ${trace.id}`);
  lines.push('═'.repeat(60));
  lines.push('');

  lines.push(`   Status:     ${formatStatus(trace.status)}`);
  lines.push(`   Started:    ${formatDate(trace.startedAt)}`);
  lines.push(`   Duration:   ${formatDuration(trace.duration)}`);
  lines.push(`   Eval ID:    ${trace.evalId}`);
  lines.push('');

  lines.push('📂 Introspection');
  lines.push('─'.repeat(40));
  lines.push(`   Files analyzed:    ${trace.introspection.filesAnalyzed.length}`);
  lines.push(`   Functions found:   ${trace.introspection.totalFunctions}`);
  lines.push(`   Classes found:     ${trace.introspection.totalClasses}`);
  lines.push(`   Duration:          ${formatDuration(trace.introspection.duration)}`);
  lines.push('');

  lines.push('🤖 Analysis');
  lines.push('─'.repeat(40));
  lines.push(`   Tool calls:        ${trace.analysis.toolCalls.length}`);
  lines.push(`   Questions asked:   ${trace.analysis.questionsAsked.length}`);
  lines.push(`   Decisions made:    ${trace.analysis.decisions.length}`);
  lines.push(`   Prompt tokens:     ${trace.analysis.promptTokens.toLocaleString()}`);
  lines.push(`   Completion tokens: ${trace.analysis.completionTokens.toLocaleString()}`);
  lines.push('');

  lines.push('📝 Generation');
  lines.push('─'.repeat(40));
  lines.push(`   Scenarios:         ${trace.generation.scenariosGenerated}`);
  lines.push(`   Files written:     ${trace.generation.filesWritten.length}`);
  lines.push('');

  lines.push('🧪 Execution');
  lines.push('─'.repeat(40));
  lines.push(`   ✅ Passed:         ${trace.execution.testsPassed}`);
  lines.push(`   ❌ Failed:         ${trace.execution.testsFailed}`);
  lines.push(`   ⏭️  Skipped:        ${trace.execution.testsSkipped}`);
  lines.push('');

  if (opts.showQuestions && trace.analysis.questionsAsked.length > 0) {
    lines.push('❓ Questions Asked');
    lines.push('─'.repeat(40));
    for (const q of trace.analysis.questionsAsked) {
      lines.push(formatQuestion(q));
    }
    lines.push('');
  }

  if (opts.showDecisions && trace.analysis.decisions.length > 0) {
    lines.push('🎯 Key Decisions');
    lines.push('─'.repeat(40));
    for (const d of trace.analysis.decisions.slice(0, 10)) {
      lines.push(formatDecision(d));
    }
    if (trace.analysis.decisions.length > 10) {
      lines.push(`   ... and ${trace.analysis.decisions.length - 10} more`);
    }
    lines.push('');
  }

  if (opts.showToolCalls && trace.analysis.toolCalls.length > 0) {
    lines.push('🔧 Tool Calls');
    lines.push('─'.repeat(40));
    for (const tc of trace.analysis.toolCalls.slice(0, 20)) {
      lines.push(formatToolCall(tc, opts.verbose));
    }
    if (trace.analysis.toolCalls.length > 20) {
      lines.push(`   ... and ${trace.analysis.toolCalls.length - 20} more`);
    }
    lines.push('');
  }

  if (trace.execution.failures.length > 0) {
    lines.push('❌ Test Failures');
    lines.push('─'.repeat(40));
    for (const f of trace.execution.failures) {
      lines.push(formatFailure(f));
    }
    lines.push('');
  }

  if (trace.errors.length > 0) {
    lines.push('⚠️  Errors');
    lines.push('─'.repeat(40));
    for (const e of trace.errors) {
      lines.push(`   [${formatDate(e.timestamp)}]`);
      lines.push(`   ${e.message}`);
      if (e.context) {
        lines.push(`   Context: ${e.context}`);
      }
      lines.push('');
    }
  }

  lines.push('═'.repeat(60));
  lines.push('');

  return lines.join('\n');
}

function formatStatus(status: EvalTrace['status']): string {
  switch (status) {
    case 'success':
      return '✅ Success';
    case 'partial':
      return '⚠️  Partial';
    case 'failed':
      return '❌ Failed';
    default:
      return status;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function formatQuestion(q: Question): string {
  const lines: string[] = [];
  lines.push(`   Q: ${q.question}`);
  if (q.answer) {
    lines.push(`   A: ${q.answer}`);
  } else {
    lines.push(`   A: (no answer)`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatDecision(d: Decision): string {
  const icon = d.type === 'include' ? '✓' : d.type === 'exclude' ? '✗' : '→';
  return `   ${icon} [${d.type}] ${d.subject}\n     Reason: ${d.reasoning}\n     Confidence: ${(d.confidence * 100).toFixed(0)}%\n`;
}

function formatToolCall(tc: ToolCall, verbose: boolean): string {
  const duration = formatDuration(tc.duration);
  if (verbose) {
    return `   [${tc.tool}] (${duration})\n     Input: ${JSON.stringify(tc.input).slice(0, 100)}...\n`;
  }
  return `   ${tc.tool} (${duration})`;
}

function formatFailure(f: TestFailure): string {
  const lines: string[] = [];
  lines.push(`   • ${f.testName}`);
  lines.push(`     Scenario: ${f.scenarioId}`);
  lines.push(`     Error: ${f.error}`);
  if (f.expected !== undefined && f.actual !== undefined) {
    lines.push(`     Expected: ${JSON.stringify(f.expected)}`);
    lines.push(`     Actual: ${JSON.stringify(f.actual)}`);
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
  lines.push('📋 Recent Traces');
  lines.push('═'.repeat(80));
  lines.push('');
  lines.push('ID                                     Status     Passed  Failed  Duration');
  lines.push('─'.repeat(80));

  for (const t of traces) {
    const statusIcon = t.status === 'success' ? '✅' : t.status === 'partial' ? '⚠️ ' : '❌';
    const id = t.id.slice(0, 36);
    const passed = String(t.testsPassed).padStart(6);
    const failed = String(t.testsFailed).padStart(6);
    const duration = formatDuration(t.duration).padStart(8);
    lines.push(`${id}  ${statusIcon}  ${passed}  ${failed}  ${duration}`);
  }

  lines.push('');
  return lines.join('\n');
}
