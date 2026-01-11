# 1. Codebase Analyzer Prompt - System Design

> **Priority**: 🟡 HIGH — Core LLM logic  
> **Complexity**: High (prompt engineering)  
> **Effort Estimate**: 8-12 hours (iterative refinement)

---

## Overview

The Codebase Analyzer takes structured `RepoSummary` from the introspector and generates `EvalSpec` JSON defining what tests to create. Key insight: **Claude generates specs, not code**. Test code is deterministically rendered from specs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Codebase Analyzer Agent                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ RepoSummary  │───▶│ Claude Agent │───▶│   EvalSpec   │      │
│  │    JSON      │    │    SDK       │    │    JSON      │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                            │                                    │
│                            ▼                                    │
│                    ┌──────────────┐                             │
│                    │AskUserQuestion│                            │
│                    │   (optional)  │                            │
│                    └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Types

```typescript
interface EvalSpec {
  version: '1.0';
  repo: { name: string; languages: string[]; analyzedAt: string };
  scenarios: EvalScenario[];
  grading: {
    deterministic: DeterministicGrade[];
    rubrics: RubricGrade[];
  };
  metadata: {
    generatedBy: string;
    totalTokens: number;
    questionsAsked: number;
    confidence: 'low' | 'medium' | 'high';
  };
}

interface EvalScenario {
  id: string;                    // "auth-login-success"
  name: string;
  description: string;
  target: {
    module: string;
    function: string;
    type: 'function' | 'method' | 'class';
  };
  category: 'unit' | 'integration' | 'edge-case' | 'negative';
  priority: 'critical' | 'high' | 'medium' | 'low';
  setup?: { fixtures: string[]; mocks: MockSpec[] };
  input: { args: Record<string, any>; kwargs?: Record<string, any> };
  assertions: Assertion[];
  tags: string[];
}
```

---

## Prompt Architecture (Three-Part)

### 1. System Prompt
- Defines Claude's identity as codebase analyzer
- Constraints: functional tests only, no syntax checks, ask don't assume

### 2. Developer Prompt  
- Contains EvalSpec JSON schema
- Formatting rules (snake_case, kebab-case IDs)
- Assertion type reference

### 3. User Prompt (Template)
- Injects RepoSummary JSON
- User context about what to evaluate
- Instructions for output format

---

## Key Implementation

```typescript
async function generateEvalSpec(options: GenerateOptions): Promise<EvalSpec> {
  const agentOptions: ClaudeAgentOptions = {
    systemPrompt: await loadPrompt('analyzer-system.md'),
    permissionMode: options.interactive ? 'default' : 'dontAsk',
    canUseTool: async ({ toolName, input }) => {
      if (toolName === 'AskUserQuestion' && options.onQuestion) {
        const answer = await options.onQuestion(input);
        return { behavior: 'allow', updatedInput: { ...input, answers: { [input.question]: answer } } };
      }
      return { behavior: 'deny' };
    },
    outputFormat: { type: 'json_schema', json_schema: { name: 'EvalSpec', schema: EVAL_SPEC_SCHEMA } },
  };

  for await (const msg of query(prompt, agentOptions)) {
    if (msg.type === 'result') return msg.output as EvalSpec;
  }
}
```

---

## File Structure

```
src/analyzer/
├── index.ts              # Main entry point
├── types.ts              # EvalSpec types
├── spec-generator.ts     # Claude Agent SDK integration
├── validator.ts          # JSON schema validation
└── prompt-builder.ts     # Builds prompts from templates

prompts/
├── analyzer-system.md
├── analyzer-developer.md
└── analyzer-user.md
```

---

## Success Criteria

- [ ] Generates valid EvalSpec JSON for Python repos
- [ ] Generates valid EvalSpec JSON for TypeScript repos
- [ ] Asks 2-3 clarifying questions on complex repos
- [ ] <10k tokens per analysis
- [ ] 100% assertion coverage (every scenario has assertions)
