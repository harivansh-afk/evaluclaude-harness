# 3. Test Renderers - System Design

> **Priority**: 🟢 MEDIUM — Deterministic layer  
> **Complexity**: Medium  
> **Effort Estimate**: 8-12 hours

---

## Overview

Test Renderers **deterministically transform** `EvalSpec` JSON into runnable test files. Key insight:
- **Claude generates specs** (what to test, inputs, assertions)
- **Renderers generate code** (deterministic, templated, no LLM)

This makes tests reliable, debuggable, and version-controllable.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Renderer Pipeline                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   EvalSpec   │───▶│   Renderer   │───▶│  Test Files  │      │
│  │     JSON     │    │   (per-lang) │    │  (.py/.ts)   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                 │
│  Supported: pytest (Python) | vitest (TS) | jest (TS)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Types

```typescript
interface RenderOptions {
  outputDir: string;
  framework: 'pytest' | 'vitest' | 'jest';
  includeFixtures: boolean;
  generateMocks: boolean;
}

interface RenderResult {
  files: GeneratedFile[];
  stats: { scenarioCount: number; fileCount: number; assertionCount: number };
}

interface GeneratedFile {
  path: string;
  content: string;
  scenarios: string[];  // Which scenario IDs
}
```

---

## Assertion Mapping

| EvalSpec Type | Python (pytest) | TypeScript (vitest) |
|---------------|-----------------|---------------------|
| `equals` | `assert result == expected` | `expect(result).toBe(expected)` |
| `contains` | `assert key in result` | `expect(result).toContain(key)` |
| `matches` | `assert re.match(pattern, result)` | `expect(result).toMatch(pattern)` |
| `throws` | `pytest.raises(ExceptionType)` | `expect(() => fn()).toThrow()` |
| `type` | `assert isinstance(result, Type)` | `expect(typeof result).toBe('type')` |

---

## Example Transformation

**EvalSpec scenario:**
```json
{
  "id": "auth-login-success",
  "target": { "module": "src/auth/login.py", "function": "login" },
  "input": { "args": { "username": "test", "password": "valid" } },
  "assertions": [
    { "type": "type", "target": "return", "expected": "dict" },
    { "type": "contains", "target": "return", "expected": "token" }
  ]
}
```

**Generated pytest:**
```python
def test_auth_login_success():
    """Verify login returns JWT on valid credentials"""
    result = login("test", "valid")
    assert isinstance(result, dict)
    assert "token" in result
```

---

## File Structure

```
src/renderers/
├── index.ts              # Registry + main export
├── types.ts              # Interfaces
├── base.ts               # Abstract base renderer
├── python/
│   ├── pytest-renderer.ts
│   ├── assertions.ts
│   └── templates/
│       └── test-file.py.hbs
├── typescript/
│   ├── vitest-renderer.ts
│   ├── jest-renderer.ts
│   └── assertions.ts
└── utils/
    └── template-engine.ts
```

---

## Incremental Rendering

```typescript
async function renderIncremental(
  spec: EvalSpec,
  options: RenderOptions,
  changedFiles: string[]
): Promise<RenderResult> {
  const filteredSpec = {
    ...spec,
    scenarios: spec.scenarios.filter(s => 
      changedFiles.some(f => s.target.module.includes(f))
    ),
  };
  return renderSpec(filteredSpec, options);
}
```

---

## Dependencies

```json
{
  "handlebars": "^4.7.8"
}
```

---

## Success Criteria

- [ ] Pytest renderer generates valid Python test files
- [ ] Vitest renderer generates valid TypeScript test files
- [ ] Generated tests pass linting
- [ ] All assertion types are supported
- [ ] Mocks and fixtures correctly generated
- [ ] Incremental rendering works
