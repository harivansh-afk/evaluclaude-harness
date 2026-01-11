# 4. Functional Test Execution & Grading - System Design

> **Priority**: 🟢 MEDIUM — Runtime layer  
> **Complexity**: Medium-High  
> **Effort Estimate**: 6-10 hours

---

## Overview

Executes generated tests in a **sandboxed environment** and produces structured results. Tests run in isolation to prevent accidental side effects. Results feed into Promptfoo for aggregation and UI.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Test Execution Pipeline                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Test Files  │───▶│   Sandbox    │───▶│   Results    │      │
│  │  (.py/.ts)   │    │   Runner     │    │    JSON      │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                            │                   │                │
│                            ▼                   ▼                │
│                    ┌──────────────┐    ┌──────────────┐        │
│                    │  pytest/     │    │  Promptfoo   │        │
│                    │  vitest      │    │  Integration │        │
│                    └──────────────┘    └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Types

```typescript
interface ExecutionOptions {
  framework: 'pytest' | 'vitest' | 'jest';
  sandbox: boolean;
  timeout: number;          // ms per test
  parallel: boolean;
  filter?: string[];        // Run specific test IDs
}

interface ExecutionResult {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  tests: TestResult[];
  errors: string[];
}

interface TestResult {
  id: string;               // Maps to EvalScenario.id
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  assertions: {
    passed: number;
    failed: number;
    details: AssertionResult[];
  };
  error?: { message: string; stack?: string };
  stdout?: string;
  stderr?: string;
}
```

---

## Sandbox Configuration

```typescript
const SANDBOX_CONFIG = {
  enabled: true,
  autoAllowBashIfSandboxed: true,
  network: {
    allowLocalBinding: true,
    allowOutbound: false,    // No external network
  },
  filesystem: {
    readOnly: ['/'],
    writable: ['/tmp', './test-output'],
  },
  env: {
    inherit: ['PATH', 'HOME'],
    set: { CI: 'true', NODE_ENV: 'test' },
  },
};
```

---

## Runner Implementations

### Pytest Runner

```typescript
async function runPytest(testDir: string, options: ExecutionOptions): Promise<ExecutionResult> {
  const args = [
    '-v',
    '--tb=short',
    '--json-report',
    '--json-report-file=results.json',
    options.parallel ? '-n auto' : '',
    options.filter?.map(f => `-k ${f}`).join(' ') || '',
  ].filter(Boolean);

  const { exitCode, stdout, stderr } = await exec(
    `pytest ${args.join(' ')} ${testDir}`,
    { timeout: options.timeout, cwd: testDir }
  );

  const report = JSON.parse(await fs.readFile('results.json', 'utf-8'));
  return parseJsonReport(report);
}
```

### Vitest Runner

```typescript
async function runVitest(testDir: string, options: ExecutionOptions): Promise<ExecutionResult> {
  const args = [
    'run',
    '--reporter=json',
    '--outputFile=results.json',
    options.filter?.length ? `--testNamePattern="${options.filter.join('|')}"` : '',
  ].filter(Boolean);

  const { exitCode } = await exec(
    `npx vitest ${args.join(' ')}`,
    { timeout: options.timeout, cwd: testDir }
  );

  const report = JSON.parse(await fs.readFile('results.json', 'utf-8'));
  return parseVitestReport(report);
}
```

---

## Promptfoo Integration

### Custom Provider (`providers/test-runner.py`)

```python
def get_provider_response(prompt: str, options: dict, context: dict) -> dict:
    """Runs tests and returns structured results."""
    import subprocess
    import json

    test_dir = options.get('test_dir', './tests')
    framework = options.get('framework', 'pytest')

    if framework == 'pytest':
        result = subprocess.run(
            ['pytest', '--json-report', '--json-report-file=/tmp/results.json', test_dir],
            capture_output=True, text=True, timeout=300
        )
        with open('/tmp/results.json') as f:
            report = json.load(f)
    
    return {
        'output': json.dumps({
            'passed': report['summary']['passed'],
            'failed': report['summary']['failed'],
            'tests': report['tests'],
        }),
        'error': None,
    }
```

### Promptfoo Config

```yaml
providers:
  - id: file://providers/test-runner.py
    label: functional-tests
    config:
      test_dir: .evaluclaude/tests
      framework: pytest
      timeout: 300

tests:
  - vars:
      scenario_id: auth-login-success
    assert:
      - type: python
        value: |
          import json
          result = json.loads(output)
          result['passed'] > 0 and result['failed'] == 0
```

---

## File Structure

```
src/runners/
├── index.ts              # Main entry + registry
├── types.ts              # Interfaces
├── sandbox.ts            # Isolation wrapper
├── pytest-runner.ts      # Python test execution
├── vitest-runner.ts      # Vitest execution
├── jest-runner.ts        # Jest execution
└── result-parser.ts      # Normalize results

providers/
└── test-runner.py        # Promptfoo provider
```

---

## Result Parsing

```typescript
function parseJsonReport(report: any): ExecutionResult {
  return {
    summary: {
      total: report.summary.total,
      passed: report.summary.passed,
      failed: report.summary.failed,
      skipped: report.summary.skipped || 0,
      duration: report.duration,
    },
    tests: report.tests.map((t: any) => ({
      id: extractScenarioId(t.nodeid),
      name: t.nodeid,
      status: t.outcome,
      duration: t.call?.duration || 0,
      assertions: { passed: 0, failed: 0, details: [] },
      error: t.call?.crash ? { message: t.call.crash.message } : undefined,
    })),
    errors: [],
  };
}
```

---

## Dependencies

```json
{
  "dependencies": {}
}
```

**Test framework deps (installed in target repo):**
- `pytest`, `pytest-json-report`, `pytest-xdist` (Python)
- `vitest` (TypeScript)

---

## Success Criteria

- [ ] Pytest tests run and produce JSON results
- [ ] Vitest tests run and produce JSON results
- [ ] Sandbox prevents network/filesystem escape
- [ ] Results map back to EvalScenario IDs
- [ ] Promptfoo integration works
- [ ] Parallel execution supported
