# 6. Observability & Tracing - System Design

> **Priority**: 🟡 HIGH — Debugging is critical  
> **Complexity**: Medium  
> **Effort Estimate**: 4-6 hours

---

## Overview

Every eval run produces a **trace** capturing what Claude did and why. No black boxes. When a test fails, you can see:
- What files Claude analyzed
- What questions it asked
- What specs it generated
- The reasoning behind each decision

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Observability Pipeline                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Claude Agent │───▶│   Tracer     │───▶│  Trace Store │      │
│  │    Hooks     │    │  (collector) │    │   (.json)    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                │                │
│                                                ▼                │
│                                         ┌──────────────┐       │
│                                         │ Trace Viewer │       │
│                                         │ (Promptfoo)  │       │
│                                         └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Types

```typescript
interface EvalTrace {
  id: string;                    // UUID
  evalId: string;                // Links to EvalSpec
  startedAt: string;
  completedAt: string;
  duration: number;              // ms
  
  status: 'success' | 'partial' | 'failed';
  
  introspection: {
    filesAnalyzed: string[];
    totalFunctions: number;
    totalClasses: number;
    duration: number;
  };
  
  analysis: {
    promptTokens: number;
    completionTokens: number;
    toolCalls: ToolCall[];
    questionsAsked: Question[];
    decisions: Decision[];
  };
  
  generation: {
    scenariosGenerated: number;
    filesWritten: string[];
  };
  
  execution: {
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
    failures: TestFailure[];
  };
  
  errors: TraceError[];
}

interface ToolCall {
  timestamp: string;
  tool: string;
  input: any;
  output: any;
  duration: number;
}

interface Decision {
  timestamp: string;
  type: 'include' | 'exclude' | 'prioritize' | 'question';
  subject: string;              // What was decided about
  reasoning: string;            // Why
  confidence: number;           // 0-1
}

interface TestFailure {
  scenarioId: string;
  error: string;
  stack?: string;
  expected?: any;
  actual?: any;
}
```

---

## Hook-Based Collection

Use Claude Agent SDK hooks to capture everything:

```typescript
import { ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';
import { Tracer } from './tracer';

function createTracedOptions(tracer: Tracer): Partial<ClaudeAgentOptions> {
  return {
    hooks: {
      preToolUse: [{
        hooks: [async (input) => {
          tracer.recordToolStart(input.tool_name, input.tool_input);
          return { continue_: true };
        }]
      }],
      postToolUse: [{
        hooks: [async (input) => {
          tracer.recordToolEnd(input.tool_name, input.tool_output);
          return {};
        }]
      }],
    },
  };
}
```

---

## Tracer Implementation

```typescript
class Tracer {
  private trace: EvalTrace;
  private currentToolCall?: { name: string; input: any; startTime: number };

  constructor(evalId: string) {
    this.trace = {
      id: crypto.randomUUID(),
      evalId,
      startedAt: new Date().toISOString(),
      completedAt: '',
      duration: 0,
      status: 'success',
      introspection: { filesAnalyzed: [], totalFunctions: 0, totalClasses: 0, duration: 0 },
      analysis: { promptTokens: 0, completionTokens: 0, toolCalls: [], questionsAsked: [], decisions: [] },
      generation: { scenariosGenerated: 0, filesWritten: [] },
      execution: { testsPassed: 0, testsFailed: 0, testsSkipped: 0, failures: [] },
      errors: [],
    };
  }

  recordToolStart(name: string, input: any): void {
    this.currentToolCall = { name, input, startTime: Date.now() };
  }

  recordToolEnd(name: string, output: any): void {
    if (this.currentToolCall?.name === name) {
      this.trace.analysis.toolCalls.push({
        timestamp: new Date().toISOString(),
        tool: name,
        input: this.currentToolCall.input,
        output,
        duration: Date.now() - this.currentToolCall.startTime,
      });
      this.currentToolCall = undefined;
    }
  }

  recordQuestion(question: any, answer: string): void {
    this.trace.analysis.questionsAsked.push({
      ...question,
      answer,
      timestamp: new Date().toISOString(),
    });
  }

  recordDecision(type: Decision['type'], subject: string, reasoning: string, confidence: number): void {
    this.trace.analysis.decisions.push({
      timestamp: new Date().toISOString(),
      type,
      subject,
      reasoning,
      confidence,
    });
  }

  recordError(error: Error, context?: string): void {
    this.trace.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      context,
    });
    this.trace.status = 'failed';
  }

  finalize(): EvalTrace {
    this.trace.completedAt = new Date().toISOString();
    this.trace.duration = new Date(this.trace.completedAt).getTime() - new Date(this.trace.startedAt).getTime();
    return this.trace;
  }
}
```

---

## Trace Storage

```typescript
const TRACES_DIR = '.evaluclaude/traces';

async function saveTrace(trace: EvalTrace): Promise<string> {
  await fs.mkdir(TRACES_DIR, { recursive: true });
  const filePath = path.join(TRACES_DIR, `${trace.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(trace, null, 2));
  return filePath;
}

async function loadTrace(traceId: string): Promise<EvalTrace> {
  const filePath = path.join(TRACES_DIR, `${traceId}.json`);
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function listTraces(evalId?: string): Promise<EvalTrace[]> {
  const files = await fs.readdir(TRACES_DIR);
  const traces = await Promise.all(
    files.filter(f => f.endsWith('.json')).map(f => loadTrace(f.replace('.json', '')))
  );
  return evalId ? traces.filter(t => t.evalId === evalId) : traces;
}
```

---

## Promptfoo Integration

Link traces to test results:

```yaml
# promptfooconfig.yaml
defaultTest:
  metadata:
    traceFile: .evaluclaude/traces/{{evalId}}.json
```

---

## Trace Viewer CLI

```typescript
// src/cli/commands/view.ts
import { Command } from 'commander';
import { loadTrace, listTraces } from '../observability/trace-store';

export const viewCommand = new Command('view')
  .description('View eval trace')
  .argument('[trace-id]', 'Specific trace ID')
  .option('--last', 'View most recent trace')
  .option('--json', 'Output raw JSON')
  .action(async (traceId, options) => {
    let trace: EvalTrace;
    
    if (options.last) {
      const traces = await listTraces();
      trace = traces.sort((a, b) => 
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )[0];
    } else {
      trace = await loadTrace(traceId);
    }
    
    if (options.json) {
      console.log(JSON.stringify(trace, null, 2));
    } else {
      displayTrace(trace);
    }
  });

function displayTrace(trace: EvalTrace): void {
  console.log(`\n📊 Trace: ${trace.id}`);
  console.log(`   Status: ${trace.status}`);
  console.log(`   Duration: ${trace.duration}ms`);
  console.log(`\n📂 Introspection:`);
  console.log(`   Files: ${trace.introspection.filesAnalyzed.length}`);
  console.log(`   Functions: ${trace.introspection.totalFunctions}`);
  console.log(`\n🤖 Analysis:`);
  console.log(`   Tool calls: ${trace.analysis.toolCalls.length}`);
  console.log(`   Questions: ${trace.analysis.questionsAsked.length}`);
  console.log(`   Decisions: ${trace.analysis.decisions.length}`);
  console.log(`\n🧪 Execution:`);
  console.log(`   ✅ Passed: ${trace.execution.testsPassed}`);
  console.log(`   ❌ Failed: ${trace.execution.testsFailed}`);
  
  if (trace.execution.failures.length > 0) {
    console.log(`\n❌ Failures:`);
    trace.execution.failures.forEach(f => {
      console.log(`   - ${f.scenarioId}: ${f.error}`);
    });
  }
}
```

---

## File Structure

```
src/observability/
├── index.ts              # Main exports
├── tracer.ts             # Hook-based collection
├── trace-store.ts        # Persist to filesystem
├── trace-viewer.ts       # Format for display
└── types.ts              # EvalTrace interface

.evaluclaude/
└── traces/
    ├── abc123.json
    ├── def456.json
    └── ...
```

---

## What Gets Traced

| Phase | Captured |
|-------|----------|
| Introspection | Files parsed, functions/classes found, duration |
| Analysis | Every tool call, questions asked, decisions made |
| Generation | Scenarios created, files written |
| Execution | Test results, failures with context |
| Errors | Any exceptions with stack traces |

---

## Dependencies

```json
{
  "dependencies": {}
}
```

---

## Success Criteria

- [ ] Every eval run produces a trace
- [ ] Traces capture all tool calls
- [ ] Questions and answers are recorded
- [ ] Test failures link to trace
- [ ] CLI viewer displays traces clearly
- [ ] Traces stored efficiently (<1MB each)
