# 5. LLM Rubric Graders - System Design

> **Priority**: 🟢 MEDIUM — Subjective quality layer  
> **Complexity**: Medium  
> **Effort Estimate**: 4-6 hours

---

## Overview

LLM Rubric Graders use Claude to evaluate **subjective quality** that deterministic tests can't measure:
- Code readability
- Error message helpfulness
- Documentation quality
- API design consistency

These complement functional tests with human-like judgment.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      LLM Grading Pipeline                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │    Output    │───▶│   Rubric     │───▶│   Grading    │      │
│  │   (code/    │    │   + Claude   │    │   Result     │      │
│  │    text)     │    │              │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                            │                                    │
│                    Uses Promptfoo                               │
│                    llm-rubric assertion                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Types

```typescript
interface Rubric {
  name: string;
  description: string;
  criteria: RubricCriterion[];
  passingThreshold: number;  // 0-1
}

interface RubricCriterion {
  name: string;
  description: string;
  weight: number;            // Relative weight
  examples?: {
    good: string;
    bad: string;
  };
}

interface RubricGradingResult {
  pass: boolean;
  score: number;             // 0-1
  reason: string;
  criterionScores: {
    name: string;
    score: number;
    feedback: string;
  }[];
}
```

---

## Rubric Examples

### Code Quality Rubric (`rubrics/code-quality.yaml`)

```yaml
name: code-quality
description: Evaluates generated code for quality and maintainability
passingThreshold: 0.7

criteria:
  - name: readability
    weight: 0.3
    description: Code is easy to read and understand
    examples:
      good: "Clear variable names, logical flow, proper indentation"
      bad: "Single-letter variables, deeply nested logic, inconsistent style"
  
  - name: correctness
    weight: 0.4
    description: Code correctly implements the intended behavior
    examples:
      good: "Handles edge cases, correct algorithm, proper error handling"
      bad: "Missing edge cases, off-by-one errors, swallowed exceptions"
  
  - name: efficiency
    weight: 0.2
    description: Code uses appropriate data structures and algorithms
    examples:
      good: "O(n) where O(n) is optimal, avoids unnecessary allocations"
      bad: "O(n²) when O(n) is possible, creates objects in tight loops"
  
  - name: maintainability
    weight: 0.1
    description: Code is easy to modify and extend
    examples:
      good: "Single responsibility, low coupling, clear interfaces"
      bad: "God functions, tight coupling, magic numbers"
```

### Error Messages Rubric (`rubrics/error-messages.yaml`)

```yaml
name: error-messages
description: Evaluates quality of error messages
passingThreshold: 0.6

criteria:
  - name: clarity
    weight: 0.4
    description: Error message clearly explains what went wrong
  
  - name: actionability
    weight: 0.4
    description: Error message suggests how to fix the problem
  
  - name: context
    weight: 0.2
    description: Error message includes relevant context (file, line, values)
```

---

## Promptfoo Integration

### Using `llm-rubric` Assertion

```yaml
# promptfooconfig.yaml
tests:
  - vars:
      code_output: "{{generated_code}}"
    assert:
      - type: llm-rubric
        value: |
          Evaluate this code for quality:
          
          {{code_output}}
          
          Score on:
          1. Readability (0-10)
          2. Correctness (0-10)
          3. Efficiency (0-10)
          4. Maintainability (0-10)
          
          Provide overall score and specific feedback.
        threshold: 0.7
```

### Custom Python Grader

```python
# graders/rubric_grader.py
import json
from anthropic import Anthropic

def get_assert(output: str, context: dict) -> dict:
    """Grade output using LLM rubric."""
    rubric = context.get('config', {}).get('rubric', 'code-quality')
    rubric_def = load_rubric(rubric)
    
    client = Anthropic()
    
    prompt = f"""
You are evaluating code quality against this rubric:

{json.dumps(rubric_def, indent=2)}

Code to evaluate:
```
{output}
```

For each criterion, provide:
1. Score (0-1)
2. Brief feedback

Return JSON:
{{
  "scores": {{"criterion_name": {{"score": 0.8, "feedback": "..."}}}},
  "overall": 0.75,
  "summary": "..."
}}
"""
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    
    result = json.loads(response.content[0].text)
    
    return {
        "pass": result["overall"] >= rubric_def["passingThreshold"],
        "score": result["overall"],
        "reason": result["summary"],
        "namedScores": {k: v["score"] for k, v in result["scores"].items()},
    }
```

---

## Calibration

LLM graders need calibration to ensure consistency:

```typescript
interface CalibrationSet {
  rubric: string;
  examples: CalibrationExample[];
}

interface CalibrationExample {
  input: string;
  expectedScore: number;
  expectedFeedback: string[];
}

async function calibrate(rubric: Rubric, examples: CalibrationExample[]): Promise<CalibrationResult> {
  const results = await Promise.all(
    examples.map(ex => gradeWithRubric(ex.input, rubric))
  );
  
  const agreement = results.filter((r, i) => 
    Math.abs(r.score - examples[i].expectedScore) < 0.1
  ).length / results.length;
  
  return {
    agreement,
    drift: results.map((r, i) => r.score - examples[i].expectedScore),
    needsAdjustment: agreement < 0.8,
  };
}
```

---

## File Structure

```
src/graders/
├── llm/
│   ├── index.ts          # Main entry
│   ├── provider.ts       # Promptfoo custom provider
│   ├── rubric-loader.ts  # Load YAML rubrics
│   └── grader.ts         # Core grading logic
└── calibration/
    ├── calibrator.ts     # Calibration runner
    └── examples/         # Calibration datasets

rubrics/
├── code-quality.yaml
├── error-messages.yaml
├── documentation.yaml
└── api-design.yaml

graders/
└── rubric_grader.py      # Python grader for Promptfoo
```

---

## When to Use LLM vs Deterministic

| Use LLM Graders | Use Deterministic |
|-----------------|-------------------|
| Subjective quality | Pass/fail assertions |
| Style/readability | Type checking |
| Helpfulness | Value equality |
| Consistency | Error presence |
| User experience | Performance thresholds |

---

## Dependencies

```json
{
  "js-yaml": "^4.1.0"
}
```

---

## Success Criteria

- [ ] Rubrics load from YAML files
- [ ] LLM grader produces consistent scores
- [ ] Calibration detects drift
- [ ] Integrates with Promptfoo `llm-rubric`
- [ ] Custom Python grader works
- [ ] >80% agreement with human judgment
