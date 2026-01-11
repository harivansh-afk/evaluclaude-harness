# Codebase Analysis Request

## Repository Summary

```json
{{REPO_SUMMARY}}
```

## Analysis Focus

{{FOCUS_INSTRUCTIONS}}

## Instructions

1. Review the module exports, focusing on:
   - Functions with signatures (testable interfaces)
   - Classes with methods
   - High-complexity modules

2. For each testable target, generate scenarios covering:
   - Happy path (normal operation)
   - Edge cases (empty, null, boundary values)
   - Error paths (exceptions, invalid inputs)

3. Use AskUserQuestion if you need clarification about:
   - Business logic requirements
   - Expected behavior for ambiguous cases
   - Priority of specific modules

4. Generate the EvalSpec JSON with {{MAX_SCENARIOS}} scenarios maximum.

5. Prioritize:
   - Most active files (by git history)
   - Functions with docstrings (clearer intent)
   - Public exports over internal helpers
