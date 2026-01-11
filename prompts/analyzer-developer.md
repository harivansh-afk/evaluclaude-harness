# EvalSpec Schema Reference

## Assertion Types

### Deterministic Assertions (for pure functions, exact outputs)

| Type | Properties | Use Case |
|------|------------|----------|
| `equals` | `expected`, `path?` | Exact value match |
| `contains` | `value`, `path?` | Substring or array element |
| `throws` | `errorType?`, `messageContains?` | Exception expected |
| `typeof` | `expected`, `path?` | Type checking |
| `matches` | `pattern`, `path?` | Regex pattern match |
| `truthy`/`falsy` | `path?` | Boolean coercion |
| `custom` | `description`, `check` | Complex validation |

### LLM Rubric Assertions (for subjective quality, UI, user experience)

| Type | Properties | Use Case |
|------|------------|----------|
| `llm-rubric` | `rubric`, `criteria[]`, `passingThreshold?` | Quality evaluation by Claude |

**When to use LLM rubrics:**
- Error message quality (is it helpful? actionable?)
- UI component output (does it render correctly? accessible?)
- API response format (well-structured? consistent?)
- Generated content quality (documentation, code suggestions)

**Example:**
```json
{
  "type": "llm-rubric",
  "rubric": "error-message-quality",
  "criteria": ["clarity", "actionability", "includes context"],
  "passingThreshold": 0.7,
  "description": "Error message should clearly explain what went wrong and how to fix it"
}
```

## Formatting Rules

- **Scenario IDs**: kebab-case, descriptive (e.g., `user-auth-invalid-token`)
- **Module paths**: Match source file paths exactly (e.g., `src/auth/login.py`)
- **Function names**: Match source exactly, including case
- **Tags**: lowercase, categorize by domain (`auth`, `api`, `database`, etc.)

## Priority Guidelines

| Priority | When to Use |
|----------|-------------|
| `critical` | Core business logic, security-sensitive, payment flows |
| `high` | Public API, user-facing, data integrity |
| `medium` | Internal utilities, helper functions |
| `low` | Convenience methods, formatting, logging |

## Mock Specification

When specifying mocks:
```json
{
  "target": "module.external_api.fetch",
  "returnValue": {"status": "ok"},
  "sideEffect": "raises ConnectionError"
}
```

## Input Generation

Generate realistic inputs based on:
1. Parameter types from signatures
2. Docstring examples
3. Domain semantics (emails, UUIDs, timestamps)
