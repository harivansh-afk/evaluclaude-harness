# Evaluclaude Harness - Development Plan

> **Goal**: Zero-to-evals in one command. Install into any codebase, Claude analyzes it, generates real functional tests.

---

## The Vibe

This isn't just another test generator. It's a **collaborative eval system** where Claude actually understands your codebase and asks smart questions before generating tests. The key insights:

1. **Claude generates specs, we generate code** — Claude is great at understanding intent, bad at deterministic code gen. We use its strengths.

2. **Functional tests only** — Every test must invoke actual code. No syntax checks. No "output looks good" vibes. Real assertions that catch real bugs.

3. **Conversation, not commands** — During init, Claude asks questions like "I see 3 database models. Which is the core one?" This turns a dumb generator into a thinking partner.

4. **Full observability** — Every eval (deterministic or LLM-graded) has a trace. You can click into it and see exactly what Claude was thinking.

---

## Core Principles (Non-Negotiable)

These are foundational. Don't compromise on them.

### 🌳 Tree-Sitter Introspector
Claude should **never see raw code** for structure extraction. Use tree-sitter to parse Python/TypeScript and extract:
- Function signatures
- Class hierarchies  
- Import graphs
- Public APIs

Then send Claude a **structured summary**, not the actual files. This saves tokens, is faster, and more reliable.

### 🔄 Git-Aware Incremental Generation
- `init` command → Full codebase analysis
- `generate` command → Only analyze git diff since last run

Don't re-analyze unchanged files. Massive time/cost savings.

### 🐛 Hooks for Debugging
You WILL need to debug why Claude generated bad specs. Log every tool call:
```typescript
hooks: {
  PostToolUse: [{
    hooks: [async (input) => {
      await trace.log({ tool: input.tool_name, input: input.tool_input });
      return {};
    }]
  }]
}
```

### 💬 AskUserQuestion is Gold
During init, Claude should ask clarifying questions:
- "I see 3 database models. Which is the core domain object?"
- "This API has no tests. Should I generate CRUD tests or skip it?"
- "Found a `config.example.py`. Should tests use these values?"
- "There are 47 utility functions. Want me to prioritize the 10 most-used?"

This transforms eval generation from "spray and pray" to thoughtful, targeted tests.

### 👁️ Full Observability
Every eval run (deterministic AND LLM-graded) must produce a trace:
- What files Claude read
- What questions it asked
- What specs it generated
- The thinking behind each decision

In the UI, you click an eval and see the entire reasoning chain. No black boxes.

### 🔒 Sandbox Mode for Test Execution
Generated tests might do unexpected things. Run them in isolation:
```typescript
sandbox: {
  enabled: true,
  autoAllowBashIfSandboxed: true,
  network: { allowLocalBinding: true }
}
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         evaluclaude-harness CLI                          │
├──────────────────────────────────────────────────────────────────────────┤
│  init  │  generate  │  run  │  view  │  validate  │  calibrate          │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Claude Agent SDK (Local Auth)                        │
│  Uses locally authenticated Claude Code instance                         │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
┌───────────────────┐                   ┌───────────────────┐
│  Analyzer Agent   │                   │  Grader Agent     │
│  (Spec Generator) │                   │  (LLM Rubrics)    │
└─────────┬─────────┘                   └─────────┬─────────┘
          │                                       │
          ▼                                       ▼
┌───────────────────┐                   ┌───────────────────┐
│  EvalSpec JSON    │                   │  Rubrics JSON     │
│  (Deterministic)  │                   │  (Subjective)     │
└─────────┬─────────┘                   └─────────┬─────────┘
          │                                       │
          ▼                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Test Renderers                                  │
│  Python (pytest)  │  TypeScript (Vitest/Jest)  │  Grader Scripts        │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            Promptfoo                                     │
│  Orchestration  │  Execution  │  Results  │  Web UI                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Iteration Areas (Split Work)

The project has **6 major iteration areas** that can be developed in parallel by different agents/sessions. Each requires significant thought and refinement.

> **Note for agents**: Each area is self-contained. You can work on one without deep knowledge of the others. The interfaces between them are defined by TypeScript types (EvalSpec, RepoSummary, TraceEvent, etc.).

---

### 0. Tree-Sitter Introspector (`/src/introspector/`)

**Complexity**: Medium  
**Iteration Required**: Moderate  
**Priority**: 🔴 FOUNDATIONAL — Build this first

#### What It Does
Parses Python and TypeScript codebases using tree-sitter to extract structured information WITHOUT using LLM tokens. This is the foundation — Claude never sees raw code for structure extraction.

#### Key Outputs

```typescript
interface RepoSummary {
  languages: ('python' | 'typescript')[];
  root: string;
  
  // File inventory (no content, just structure)
  files: {
    path: string;
    lang: 'python' | 'typescript' | 'other';
    role: 'source' | 'test' | 'config' | 'docs';
    size: number;
  }[];
  
  // Extracted structure (from tree-sitter, NOT from reading files)
  modules: {
    path: string;
    exports: {
      name: string;
      kind: 'function' | 'class' | 'constant' | 'type';
      signature?: string;  // e.g., "(user_id: int, include_deleted: bool = False) -> User"
      docstring?: string;  // First line only
    }[];
    imports: string[];  // What this module depends on
  }[];
  
  // Config detection
  config: {
    python?: {
      entryPoints: string[];
      testFramework: 'pytest' | 'unittest' | 'none';
      hasTyping: boolean;
    };
    typescript?: {
      entryPoints: string[];
      testFramework: 'vitest' | 'jest' | 'none';
      hasTypes: boolean;
    };
  };
  
  // Git info for incremental
  git?: {
    lastAnalyzedCommit: string;
    changedSince: string[];  // Files changed since last analysis
  };
}
```

#### Tree-Sitter Integration

```typescript
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import TypeScript from 'tree-sitter-typescript';

const parser = new Parser();
parser.setLanguage(Python);

const tree = parser.parse(sourceCode);

// Extract function signatures
const query = new Parser.Query(Python, `
  (function_definition
    name: (identifier) @name
    parameters: (parameters) @params
    return_type: (type)? @return
  ) @func
`);

const matches = query.matches(tree.rootNode);
```

#### Git-Aware Incremental

```typescript
// On `generate` command, only re-analyze changed files
async function getChangedFiles(since: string): Promise<string[]> {
  const result = await exec(`git diff --name-only ${since}`);
  return result.stdout.split('\n').filter(f => isSourceFile(f));
}

// Skip unchanged modules in RepoSummary
const incrementalSummary = await introspector.analyze({
  onlyFiles: await getChangedFiles(lastCommit)
});
```

#### Iteration Focus
- Parse accuracy across different Python/TS coding styles
- Handle edge cases: decorators, async functions, generics
- Performance on large codebases (>1000 files)
- Incremental updates without full re-parse

#### Files to Create
```
src/introspector/
├── tree-sitter.ts      # Core parser wrapper
├── python-parser.ts    # Python-specific queries
├── typescript-parser.ts# TS-specific queries
├── git-diff.ts         # Incremental change detection
└── summarizer.ts       # Combine into RepoSummary
```

---

### 1. Codebase Analyzer Prompt (`/prompts/analyzer.md`)

**Complexity**: High  
**Iteration Required**: Extensive

#### What It Does
The core LLM prompt that analyzes any Python/TypeScript codebase and outputs a structured `EvalSpec` JSON. Must be language-agnostic in design but produce language-specific output.

#### Key Challenges
- Must work across diverse project structures (monorepos, microservices, simple scripts)
- Must identify *functional behaviors* not just code structure
- Must produce deterministic, unambiguous test specifications
- Must avoid proposing tests that depend on network, time, randomness, or external state

#### EvalSpec Schema (Output Target)

```typescript
interface EvalSpec {
  functional_tests: FunctionalTestSpec[];
  rubric_graders: RubricGraderSpec[];
}

interface FunctionalTestSpec {
  id: string;
  description: string;
  target: {
    runtime: 'python' | 'typescript';
    module_path: string;       // e.g., "src/utils/math.py"
    import_path: string;       // e.g., "project.utils.math"
    callable: string;          // function/method name
    kind: 'function' | 'method' | 'cli' | 'http_handler';
  };
  setup?: {
    env?: Record<string, string>;
    files?: { path: string; content: string }[];
  };
  cases: {
    id: string;
    description: string;
    inputs: unknown;
    expected: {
      return_value?: unknown;
      stdout_contains?: string[];
      stderr_contains?: string[];
      json_schema?: unknown;
      raises_exception?: string;
      requires_mocks?: boolean;
    };
  }[];
}

interface RubricGraderSpec {
  id: string;
  description: string;
  target: {
    kind: 'cli_output' | 'http_response' | 'error_message' | 'doc_page';
    location: string;
  };
  rubric: {
    dimensions: {
      name: string;
      weight: number;
      scale: {
        min: number;
        max: number;
        definitions: { score: number; description: string }[];
      };
    }[];
    overall_scoring: 'weighted_average';
  };
}
```

#### Prompt Structure (Multi-Part)

1. **System Prompt**: Role definition, constraints, JSON-only output
2. **Developer Prompt**: Schema definition, formatting rules
3. **User Prompt**: `RepoSummary` JSON + specific instructions

#### Iteration Focus
- Test against diverse repos: CLI tools, web apps, libraries, ML projects
- Refine heuristics for identifying "testable" vs "non-testable" code
- Tune specificity of test case generation
- Handle edge cases: no tests exist, tests exist but are bad, etc.

#### Files to Create
```
prompts/
├── analyzer-system.md      # Core identity + constraints
├── analyzer-developer.md   # Schema + formatting
└── analyzer-user.md        # Template for RepoSummary injection
```

---

### 2. Synchronous Claude Session with Questions (`/src/session/`)

**Complexity**: Medium-High  
**Iteration Required**: Moderate

#### What It Does
Runs Claude Agent SDK synchronously, handles `AskUserQuestion` tool calls, collects user input via CLI, and returns answers to continue the agent.

#### Key Technical Details

**Claude Agent SDK Patterns**:
```typescript
// Using ClaudeSDKClient for multi-turn with questions
import { ClaudeSDKClient, ClaudeAgentOptions } from 'claude-agent-sdk';

const options: ClaudeAgentOptions = {
  allowed_tools: ['Read', 'Glob', 'Grep', 'AskUserQuestion'],
  permission_mode: 'acceptEdits',
  can_use_tool: async (toolName, input, context) => {
    if (toolName === 'AskUserQuestion') {
      // Display questions to user
      const answers = await promptUserForAnswers(input.questions);
      return {
        behavior: 'allow',
        updatedInput: { ...input, answers }
      };
    }
    return { behavior: 'allow', updatedInput: input };
  }
};
```

**Two Operating Modes**:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `--interactive` | Questions allowed, waits for user | Local development |
| `--non-interactive` | Questions forbidden, best-effort | CI/CD, automation |

#### Iteration Focus
- Clean CLI UX for question display (multi-choice, free text)
- Timeout handling (60s limit per question)
- Graceful fallback when questions are disabled
- Session persistence for resuming interrupted generation

#### Files to Create
```
src/session/
├── client.ts           # ClaudeSDKClient wrapper
├── question-handler.ts # AskUserQuestion UI
├── modes.ts            # Interactive vs non-interactive
└── persistence.ts      # Session save/resume
```

---

### 3. Test Renderers (Deterministic Code Gen) (`/src/renderers/`)

**Complexity**: Medium  
**Iteration Required**: Moderate

#### What It Does
Transforms `EvalSpec` JSON into actual runnable test files. **Claude generates specs, we generate code** — this is critical for reliability.

#### Python Renderer (pytest)

**Input**: `FunctionalTestSpec`  
**Output**: `.py` file in `.evaluclaude/tests/`

```python
# Generated: .evaluclaude/tests/test_{id}.py
import importlib
import pytest

module = importlib.import_module("{import_path}")
target = getattr(module, "{callable}")

@pytest.mark.evaluclaude
def test_{id}_{case_id}():
    result = target(**{inputs})
    assert result == {expected.return_value}
```

**Features**:
- `pytest` fixtures for env vars (`monkeypatch.setenv`)
- `tmp_path` for file setup
- `capsys` for stdout/stderr assertions
- Parameterized tests for multiple cases

#### TypeScript Renderer (Vitest/Jest)

**Input**: `FunctionalTestSpec`  
**Output**: `.test.ts` file in `.evaluclaude/tests/`

```typescript
// Generated: .evaluclaude/tests/{id}.test.ts
import { describe, it, expect } from 'vitest';
import { callable } from '{import_path}';

describe('{description}', () => {
  it('{case.description}', () => {
    const result = callable({inputs});
    expect(result).toEqual({expected.return_value});
  });
});
```

#### Iteration Focus
- Handle all `FunctionalTestSpec.target.kind` variants (function, method, CLI, HTTP)
- Proper import path resolution (relative, absolute, aliased)
- Mock scaffolding for `requires_mocks: true` cases
- Error handling for invalid specs

#### Files to Create
```
src/renderers/
├── python/
│   ├── pytest-renderer.ts
│   ├── fixtures.ts
│   └── templates/
├── typescript/
│   ├── vitest-renderer.ts
│   ├── jest-renderer.ts
│   └── templates/
└── common/
    ├── spec-validator.ts
    └── path-resolver.ts
```

---

### 4. Functional Test Execution & Grading (`/src/runners/`)

**Complexity**: Medium-High  
**Iteration Required**: Moderate

#### What It Does
Executes generated tests and produces structured results for Promptfoo. **Tests must be functional, never just syntax checks.**

#### Pytest Execution

```bash
pytest .evaluclaude/tests/ \
  --json-report \
  --json-report-file=.evaluclaude/results/pytest.json
```

**Key Packages**:
- `pytest-json-report`: Structured JSON output with per-test pass/fail
- `pytest.main()`: Programmatic invocation from Python

**JSON Report Structure**:
```json
{
  "summary": { "passed": 5, "failed": 1, "total": 6 },
  "tests": [
    {
      "nodeid": "test_auth.py::test_login_success",
      "outcome": "passed",
      "duration": 0.023
    }
  ]
}
```

#### Vitest/Jest Execution

```bash
vitest run .evaluclaude/tests/ --reporter=json --outputFile=.evaluclaude/results/vitest.json
```

**Programmatic (Vitest)**:
```typescript
import { startVitest } from 'vitest/node';

const vitest = await startVitest('test', ['.evaluclaude/tests/']);
const results = vitest.state.getFiles();
```

#### Grader Interface for Promptfoo

```typescript
// graders/deterministic/run-tests.ts
export async function getAssert(output: string, context: AssertContext): Promise<GradingResult> {
  const testResults = await runTests(context.vars.runtime);
  
  return {
    pass: testResults.failed === 0,
    score: testResults.passed / testResults.total,
    reason: testResults.failed > 0 
      ? `${testResults.failed} tests failed`
      : 'All tests passed',
    componentResults: testResults.tests.map(t => ({
      pass: t.outcome === 'passed',
      score: t.outcome === 'passed' ? 1 : 0,
      reason: t.outcome,
      assertion: t.nodeid
    }))
  };
}
```

#### Iteration Focus
- Isolated test environments (clean state per run)
- Timeout handling for long-running tests
- Parallel execution where safe
- Rich error reporting with stack traces

#### Files to Create
```
src/runners/
├── pytest-runner.ts
├── vitest-runner.ts
├── result-parser.ts
└── grader-adapter.ts   # Promptfoo GradingResult format

graders/
├── deterministic/
│   ├── run-tests.py    # Python grader entry
│   └── run-tests.ts    # TypeScript grader entry
└── templates/
    └── grader-wrapper.ts
```

---

### 5. LLM Rubric Graders (`/src/graders/llm/`)

**Complexity**: Medium  
**Iteration Required**: High (calibration)

#### What It Does
Uses Claude to grade subjective qualities (code clarity, error message helpfulness, documentation completeness) via structured rubrics.

#### Custom Promptfoo Provider

```typescript
// providers/evaluclaude-grader.ts
import { query, ClaudeAgentOptions } from 'claude-agent-sdk';

export async function call(
  input: string,  // Candidate output to grade
  context: { vars?: Record<string, any>; config?: { rubricId: string } }
) {
  const rubric = loadRubric(context.config.rubricId);
  
  const systemPrompt = `You are a deterministic grader.
Use the rubric to assign scores. Output JSON only.
Do not use randomness. If unsure, choose the lower score.`;

  const messages = [];
  for await (const msg of query({
    prompt: JSON.stringify({ rubric, candidateOutput: input }),
    options: {
      system_prompt: systemPrompt,
      allowed_tools: [],  // No tools needed for grading
    }
  })) {
    messages.push(msg);
  }
  
  return { output: extractGradeFromMessages(messages) };
}
```

#### Rubric Structure

```yaml
# rubrics/code-quality.yaml
id: code_quality
description: Evaluates code changes for quality
dimensions:
  - name: correctness
    weight: 0.4
    scale:
      min: 1
      max: 5
      definitions:
        - score: 5
          description: "Code is completely correct, handles all edge cases"
        - score: 3
          description: "Code works for common cases, misses some edge cases"
        - score: 1
          description: "Code has significant bugs or doesn't work"
  
  - name: clarity
    weight: 0.3
    scale:
      min: 1
      max: 5
      definitions:
        - score: 5
          description: "Code is self-documenting, easy to understand"
        - score: 3
          description: "Code is understandable with some effort"
        - score: 1
          description: "Code is confusing or poorly organized"
  
  - name: efficiency
    weight: 0.3
    scale:
      min: 1
      max: 5
      definitions:
        - score: 5
          description: "Optimal algorithm and implementation"
        - score: 3
          description: "Reasonable performance, not optimal"
        - score: 1
          description: "Significant performance issues"

overall_scoring: weighted_average
```

#### Iteration Focus
- Calibration against human judgments
- Consistency across runs (temperature=0, fixed seeds if available)
- Rubric design for different eval types
- Version control for rubrics (drift detection)

#### Files to Create
```
src/graders/
├── llm/
│   ├── provider.ts         # Promptfoo custom provider
│   ├── rubric-loader.ts
│   └── grade-parser.ts
└── calibration/
    ├── benchmark-cases/    # Known good/bad examples
    └── calibrator.ts       # Compare LLM grades to human

rubrics/
├── code-quality.yaml
├── error-messages.yaml
├── documentation.yaml
└── api-design.yaml
```

---

### 6. Observability & Tracing (`/src/observability/`)

**Complexity**: Medium  
**Iteration Required**: Moderate  
**Priority**: 🟡 IMPORTANT — Debug-ability depends on this

#### What It Does
Captures a complete trace of every eval run so you can click into any result and see exactly what happened. No black boxes.

#### What Gets Traced

Every eval (deterministic OR LLM-graded) produces a trace:

```typescript
interface EvalTrace {
  id: string;
  timestamp: Date;
  evalId: string;  // Links to Promptfoo test case
  
  // What the introspector found
  introspection: {
    filesScanned: number;
    modulesExtracted: number;
    duration: number;
  };
  
  // Claude's analysis session
  analysis: {
    // Every tool Claude called
    toolCalls: {
      tool: string;
      input: unknown;
      output: unknown;
      duration: number;
    }[];
    
    // Questions asked (if interactive)
    questions: {
      question: string;
      options: string[];
      userAnswer: string;
    }[];
    
    // Claude's reasoning (from thinking blocks if available)
    reasoning?: string;
    
    // Final spec generated
    specsGenerated: string[];  // IDs of FunctionalTestSpecs
  };
  
  // Test execution
  execution: {
    testsRun: number;
    passed: number;
    failed: number;
    sandboxed: boolean;
    duration: number;
  };
  
  // For LLM-graded evals
  grading?: {
    rubricUsed: string;
    dimensionScores: Record<string, number>;
    finalScore: number;
    reasoning: string;
  };
}
```

#### Hook-Based Collection

```typescript
// Automatically collect traces via SDK hooks
const traceCollector: TraceCollector = new TraceCollector();

const options: ClaudeAgentOptions = {
  hooks: {
    PreToolUse: [{
      hooks: [async (input, toolUseId) => {
        traceCollector.startToolCall(toolUseId, input.tool_name, input.tool_input);
        return {};
      }]
    }],
    PostToolUse: [{
      hooks: [async (input, toolUseId) => {
        traceCollector.endToolCall(toolUseId, input.tool_response);
        return {};
      }]
    }],
    UserPromptSubmit: [{
      hooks: [async (input) => {
        traceCollector.recordPrompt(input.prompt);
        return {};
      }]
    }]
  }
};
```

#### UI Integration

Traces are stored as JSON and surfaced in the Promptfoo UI:

```yaml
# In generated promptfooconfig.yaml
defaultTest:
  metadata:
    traceFile: .evaluclaude/traces/{{evalId}}.json
```

When you click an eval in Promptfoo's web UI, you see:
1. **Overview**: Pass/fail, duration, cost
2. **Introspection**: What files were analyzed
3. **Claude's Journey**: Every tool call, every question asked
4. **Reasoning**: Why Claude made the decisions it did
5. **Execution**: Which tests ran, which failed

#### Iteration Focus
- Efficient storage (traces can get large)
- Clean UI formatting (collapsible sections, syntax highlighting)
- Linking traces to specific test failures
- Diff view for comparing traces between runs

#### Files to Create
```
src/observability/
├── tracer.ts           # Hook-based collection
├── trace-store.ts      # Persist to .evaluclaude/traces/
├── trace-viewer.ts     # Format for display
└── types.ts            # EvalTrace interface

templates/
└── trace-ui/           # Custom Promptfoo view components
```

---

## Technology Reference

### Claude Agent SDK

| Feature | Usage |
|---------|-------|
| `query()` | One-off tasks, stateless |
| `ClaudeSDKClient` | Multi-turn, sessions, questions |
| `AskUserQuestion` | Clarifying questions during generation |
| `can_use_tool` | Permission callback for questions |
| Local Auth | Uses `claude` CLI authentication |

**Key Flags**:
- `permission_mode: 'acceptEdits'` — Auto-approve file changes
- `allowed_tools: [...]` — Restrict tool access
- `setting_sources: ['project']` — Load CLAUDE.md

### Promptfoo

| Feature | Usage |
|---------|-------|
| Python Provider | `file://providers/agent.py` |
| Python Assertions | `file://graders/check.py` |
| LLM Rubrics | `llm-rubric:` assertion type |
| Custom Provider | For Claude Agent SDK integration |
| JSON Reports | `promptfoo eval -o results.json` |

**Python Grader Return Types**:
```python
# Boolean
return True  # pass
return False # fail

# Score (0-1)
return 0.85

# GradingResult
return {
    'pass': True,
    'score': 0.85,
    'reason': 'All checks passed',
    'componentResults': [...]
}
```

### Test Runners

| Runner | JSON Output | Programmatic API |
|--------|-------------|------------------|
| pytest | `pytest-json-report` | `pytest.main([...])` |
| Vitest | `--reporter=json` | `startVitest('test', [...])` |
| Jest | `jest-ctrf-json-reporter` | `runCLI({...})` |

---

## Directory Structure (Final)

```
evaluclaude-harness/
├── src/
│   ├── cli/                    # Commander.js CLI
│   │   ├── index.ts
│   │   ├── commands/
│   │   │   ├── init.ts         # Full analysis + questions
│   │   │   ├── generate.ts     # Incremental (git diff only)
│   │   │   ├── run.ts          # Execute evals
│   │   │   └── view.ts         # Open Promptfoo UI
│   │   └── utils/
│   │
│   ├── introspector/           # 🌳 NON-LLM codebase parsing
│   │   ├── tree-sitter.ts      # Multi-language AST parsing
│   │   ├── python-parser.ts    # Python-specific extraction
│   │   ├── typescript-parser.ts# TS-specific extraction
│   │   ├── git-diff.ts         # 🔄 Incremental change detection
│   │   └── summarizer.ts       # RepoSummary generation
│   │
│   ├── session/                # Claude SDK wrapper
│   │   ├── client.ts           # ClaudeSDKClient wrapper
│   │   ├── question-handler.ts # 💬 AskUserQuestion UI
│   │   ├── modes.ts            # Interactive vs non-interactive
│   │   └── persistence.ts      # Session save/resume
│   │
│   ├── observability/          # 👁️ Full tracing
│   │   ├── tracer.ts           # Hook-based logging
│   │   ├── trace-store.ts      # Persist traces per eval
│   │   └── trace-viewer.ts     # Format for UI display
│   │
│   ├── analyzer/               # LLM-based analysis
│   │   ├── spec-generator.ts   # RepoSummary → EvalSpec
│   │   └── validator.ts        # Validate generated specs
│   │
│   ├── renderers/              # Spec → Test code (deterministic)
│   │   ├── python/
│   │   │   ├── pytest-renderer.ts
│   │   │   └── fixtures.ts
│   │   └── typescript/
│   │       ├── vitest-renderer.ts
│   │       └── jest-renderer.ts
│   │
│   ├── runners/                # 🔒 Sandboxed test execution
│   │   ├── sandbox.ts          # Isolation wrapper
│   │   ├── pytest-runner.ts
│   │   ├── vitest-runner.ts
│   │   └── result-parser.ts
│   │
│   └── graders/                # LLM grading
│       ├── llm/
│       │   ├── provider.ts     # Promptfoo custom provider
│       │   └── rubric-loader.ts
│       ├── deterministic/
│       │   └── test-grader.ts
│       └── calibration/
│           └── calibrator.ts
│
├── prompts/                    # LLM prompts (iterable)
│   ├── analyzer-system.md      # Core identity + constraints
│   ├── analyzer-developer.md   # Schema + formatting
│   └── analyzer-user.md        # Template for RepoSummary
│
├── rubrics/                    # Grading rubrics
│   ├── code-quality.yaml
│   ├── error-messages.yaml
│   └── documentation.yaml
│
├── templates/                  # Generated file templates
│   ├── promptfooconfig.yaml
│   └── ...
│
├── tests/                      # Our own tests
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development Phases

### Phase 1: Foundation (Days 1-2)
- [ ] CLI scaffold with Commander.js
- [ ] 🌳 **Tree-sitter introspector** — This is foundational, do it first
- [ ] RepoSummary type definitions
- [ ] Basic Claude SDK session wrapper

### Phase 2: Analysis (Days 2-4)
- [ ] Analyzer prompt v1 (system + developer + user)
- [ ] EvalSpec schema + validation
- [ ] 💬 **AskUserQuestion flow** — Interactive mode with CLI prompts
- [ ] Non-interactive fallback mode

### Phase 3: Observability (Days 3-4)
- [ ] 👁️ **Hook-based tracing** — Capture every tool call
- [ ] Trace storage (.evaluclaude/traces/)
- [ ] Basic trace viewer formatting

### Phase 4: Renderers (Days 4-5)
- [ ] Python/pytest renderer
- [ ] TypeScript/Vitest renderer
- [ ] Spec validation before rendering
- [ ] 🔄 **Git-aware incremental** — Only regenerate for changed files

### Phase 5: Execution (Days 5-6)
- [ ] 🔒 **Sandbox mode** — Isolated test execution
- [ ] Test runners (pytest, Vitest)
- [ ] Result parsing and aggregation
- [ ] Promptfoo integration

### Phase 6: Grading (Days 6-7)
- [ ] LLM grader provider
- [ ] Rubric system
- [ ] Calibration tooling

### Phase 7: Polish (Day 7+)
- [ ] Error handling and recovery
- [ ] Trace UI improvements
- [ ] Documentation
- [ ] Example repos for testing

---

## Key Design Decisions

1. **Claude generates specs, not code**: Test code is deterministically rendered from specs. This ensures reliability and maintainability.

2. **Functional tests only**: Every test must invoke actual code. No syntax checks, no format validation, no "output looks good" assertions.

3. **Language-agnostic schema**: One analyzer prompt, multiple renderers. Adding new languages means adding renderers, not prompts.

4. **Two-mode operation**: Interactive for development (questions allowed), non-interactive for CI (best-effort, no blocking).

5. **Promptfoo as orchestrator**: We do the heavy lifting; Promptfoo handles parallelism, caching, and UI.

6. **🌳 Tree-sitter over token burn**: Never send raw code to Claude for structure extraction. Parse locally, send summaries.

7. **🔄 Incremental by default**: `generate` only re-analyzes git diff. Full analysis is opt-in via `init --full`.

8. **👁️ No black boxes**: Every eval has a trace. You can always see what Claude did and why.

9. **🔒 Sandbox execution**: Generated tests run in isolation. Assume they might do anything.

10. **💬 Conversation > commands**: Claude asks clarifying questions. This isn't a fire-and-forget generator.

---

## Success Criteria

- [ ] `npx evaluclaude-harness init` works on a fresh Python/TS repo
- [ ] Generated tests actually run and catch real bugs
- [ ] LLM graders correlate with human judgment (>80% agreement)
- [ ] Full pipeline runs in <5 minutes for medium repo
- [ ] Zero manual config required for basic usage
- [ ] 🌳 Introspector handles 1000+ file repos in <10 seconds
- [ ] 🔄 Incremental `generate` is 10x faster than full `init`
- [ ] 👁️ Every eval result is traceable to Claude's decisions
- [ ] 💬 Claude asks at least 2-3 clarifying questions on complex repos
- [ ] 🔒 No test can escape sandbox to affect host system
