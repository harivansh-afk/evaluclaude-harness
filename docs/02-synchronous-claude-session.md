# 2. Synchronous Claude Session with Questions - System Design

> **Priority**: 🟡 HIGH — Interactive UX  
> **Complexity**: Medium  
> **Effort Estimate**: 4-6 hours

---

## Overview

Handles **interactive communication** between Claude and the user during eval generation. When Claude calls `AskUserQuestion`, we display it in CLI, collect the answer, and return it to Claude.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Session Manager                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐                    ┌──────────────┐          │
│  │ Claude Agent │◀──────────────────▶│  Question    │          │
│  │    SDK       │   AskUserQuestion  │   Handler    │          │
│  └──────────────┘                    └──────────────┘          │
│         │                                   │                   │
│         ▼                                   ▼                   │
│     Result                              CLI/stdin               │
│    (EvalSpec)                           (inquirer)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Session Modes

| Mode | Usage | Behavior |
|------|-------|----------|
| `interactive` | Local dev | Full CLI prompts via inquirer |
| `non-interactive` | CI/CD | Deny questions, use defaults |
| `auto-answer` | Scripted | Use provided default answers |

---

## Core Types

```typescript
interface Question {
  header: string;
  question: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
  freeText?: boolean;
  defaultValue?: string;
}

interface SessionOptions {
  interactive: boolean;
  defaultAnswers?: Record<string, string>;
  timeout?: number;
}

type SessionMode = 'interactive' | 'non-interactive' | 'auto-answer';
```

---

## Key Implementation

```typescript
class ClaudeSession {
  async run<T>(systemPrompt: string, userPrompt: string, outputSchema?: object): Promise<T> {
    const agentOptions: ClaudeAgentOptions = {
      systemPrompt,
      permissionMode: this.getPermissionMode(),
      canUseTool: this.createToolHandler(),
      outputFormat: outputSchema ? { type: 'json_schema', json_schema: { name: 'Output', schema: outputSchema } } : undefined,
    };

    for await (const msg of query(userPrompt, agentOptions)) {
      if (msg.type === 'result') return msg.output as T;
    }
  }

  private async handleAskUserQuestion(input: any) {
    if (this.mode === 'non-interactive') {
      return { behavior: 'deny', message: 'Interactive questions not allowed in CI' };
    }
    
    const answers: Record<string, string> = {};
    for (const question of input.questions) {
      answers[question.question] = await promptCLI(question);
    }
    return { behavior: 'allow', updatedInput: { questions: input.questions, answers } };
  }
}
```

---

## CLI Adapter (inquirer)

```typescript
async function promptSelect(question: Question): Promise<string> {
  const { answer } = await inquirer.prompt([{
    type: 'list',
    name: 'answer',
    message: question.question,
    choices: question.options!.map(opt => ({ name: `${opt.label} - ${opt.description}`, value: opt.label })),
  }]);
  return answer;
}
```

**User sees:**
```
┌─ Priority ────────────────────────
│ I found 47 utility functions. Which should I prioritize?

? Select an option:
❯ all - Test all 47 functions
  top-10 - Focus on 10 most-used
  critical - Only critical path functions
```

---

## File Structure

```
src/session/
├── index.ts              # Main exports
├── types.ts              # TypeScript interfaces
├── client.ts             # Claude SDK wrapper
├── question-handler.ts   # AskUserQuestion logic
├── cli-adapter.ts        # Terminal UI (inquirer)
├── modes.ts              # Mode detection
└── persistence.ts        # Save/resume session
```

---

## Dependencies

```json
{
  "@anthropic-ai/claude-agent-sdk": "^0.1.0",
  "inquirer": "^9.2.0"
}
```

---

## Success Criteria

- [ ] Interactive mode works in terminal
- [ ] Non-interactive mode works in CI
- [ ] Auto-answer mode uses provided defaults
- [ ] Session state can be saved and resumed
- [ ] Ctrl+C exits cleanly
