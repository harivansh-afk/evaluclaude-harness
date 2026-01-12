# evaluclaude

> **Zero-to-evals in one command.** Claude analyzes your codebase and generates functional tests.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

## What is this?

**evaluclaude** is a CLI tool that uses Claude to understand your codebase and generate real, runnable functional tests. Unlike traditional test generators that produce boilerplate, evaluclaude:

- **Parses your code** with tree-sitter (no LLM tokens wasted on structure)
- **Asks smart questions** to understand your testing priorities
- **Generates specs, not code** — deterministic renderers create the actual tests
- **Full observability** — every run produces a trace you can inspect

## Quick Start

```bash
# Install
npm install -g evaluclaude-harness

# Run the full pipeline
evaluclaude pipeline .

# Or step by step
evaluclaude intro .           # Introspect codebase
evaluclaude analyze . -o spec.json -i  # Generate spec (interactive)
evaluclaude render spec.json  # Create test files
evaluclaude run               # Execute tests
```

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    evaluclaude pipeline                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   1. INTROSPECT        Parse code with tree-sitter      │
│      📂 → 📋           Extract functions, classes       │
│                                                         │
│   2. ANALYZE           Claude generates EvalSpec        │
│      📋 → 🧠           Asks clarifying questions        │
│                                                         │
│   3. RENDER            Deterministic code generation    │
│      🧠 → 📄           pytest / vitest / jest           │
│                                                         │
│   4. RUN               Execute in sandbox               │
│      📄 → 🧪           Collect results + traces         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Commands

### Core Pipeline

| Command | Description |
|---------|-------------|
| `pipeline [path]` | Run the full pipeline: introspect → analyze → render → run |
| `intro [path]` | Introspect codebase with tree-sitter |
| `analyze [path]` | Generate EvalSpec with Claude |
| `render <spec>` | Render EvalSpec to test files |
| `run [test-dir]` | Execute tests and collect results |

### Grading & Rubrics

| Command | Description |
|---------|-------------|
| `grade <input>` | Grade output using LLM rubric |
| `rubrics` | List available rubrics |
| `calibrate` | Calibrate rubric against examples |

### Observability

| Command | Description |
|---------|-------------|
| `view [trace-id]` | View trace details |
| `traces` | List all traces |
| `ui` | Launch Promptfoo dashboard |
| `eval` | Run Promptfoo evaluations |

## Examples

### Analyze a Python project interactively

```bash
evaluclaude analyze ./my-python-project -i -o spec.json
```

Claude will ask questions like:
- "I see 3 database models. Which is the core domain object?"
- "Found 47 utility functions. Want me to prioritize the most-used ones?"

### Focus on specific modules

```bash
evaluclaude pipeline . --focus auth,payments --max-scenarios 20
```

### View test results in browser

```bash
evaluclaude run --export-promptfoo
evaluclaude ui
```

### Skip steps in the pipeline

```bash
# Use existing spec, just run tests
evaluclaude pipeline . --skip-analyze --skip-render

# Generate tests without running
evaluclaude pipeline . --skip-run
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

### Output Structure

```
.evaluclaude/
├── spec.json           # Generated EvalSpec
├── traces/             # Execution traces
│   └── trace-xxx.json
├── results/            # Test results
│   └── run-xxx.json
└── promptfooconfig.yaml  # Promptfoo config (with --promptfoo)
```

## Rubrics

Create custom grading rubrics in YAML:

```yaml
# rubrics/my-rubric.yaml
name: my-rubric
description: Custom quality checks
passingThreshold: 0.7

criteria:
  - name: correctness
    description: Code produces correct results
    weight: 0.5
  - name: clarity
    description: Code is clear and readable
    weight: 0.3
  - name: efficiency
    description: Code is reasonably efficient
    weight: 0.2
```

Use it:
```bash
evaluclaude grade output.txt -r my-rubric
```

## Architecture

evaluclaude follows key principles:

1. **Tree-sitter for introspection** — Never send raw code to Claude for structure extraction
2. **Claude generates specs, not code** — EvalSpec JSON is LLM output; test code is deterministic
3. **Functional tests only** — Every test must invoke actual code, no syntax checks
4. **Full observability** — Every eval run produces an inspectable trace

## Supported Languages

| Language | Parser | Test Framework |
|----------|--------|----------------|
| Python | tree-sitter-python | pytest |
| TypeScript | tree-sitter-typescript | vitest, jest |
| JavaScript | tree-sitter-typescript | vitest, jest |

## Development

```bash
# Build
npm run build

# Run in dev mode
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

## License

MIT
