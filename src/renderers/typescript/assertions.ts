import type { Assertion } from '../../analyzer/types.js';

export type TSFramework = 'vitest' | 'jest';

export function renderTSAssertion(assertion: Assertion, resultVar: string, framework: TSFramework): string {
  const target = getTargetExpression(assertion, resultVar);

  switch (assertion.type) {
    case 'equals':
      if (typeof assertion.expected === 'object' && assertion.expected !== null) {
        return `expect(${target}).toEqual(${formatTSValue(assertion.expected)});`;
      }
      return `expect(${target}).toBe(${formatTSValue(assertion.expected)});`;

    case 'contains':
      return `expect(${target}).toContain(${formatTSValue(assertion.value)});`;

    case 'typeof':
      return renderTypeofAssertion(target, assertion.expected, framework);

    case 'matches':
      return `expect(${target}).toMatch(${formatTSValue(assertion.pattern)});`;

    case 'throws':
      return ''; // Handled specially in test structure

    case 'truthy':
      return `expect(${target}).toBeTruthy();`;

    case 'falsy':
      return `expect(${target}).toBeFalsy();`;

    case 'custom':
      return `expect(${assertion.check}).toBe(true); // ${assertion.description}`;

    case 'llm-rubric':
      return `// LLM Rubric: ${assertion.rubric} - skipped (requires grader)`;

    default:
      return `// Unknown assertion type: ${(assertion as Assertion).type}`;
  }
}

function renderTypeofAssertion(target: string, expected: string, _framework: TSFramework): string {
  switch (expected) {
    case 'array':
      return `expect(Array.isArray(${target})).toBe(true);`;
    case 'null':
      return `expect(${target}).toBeNull();`;
    case 'undefined':
      return `expect(${target}).toBeUndefined();`;
    case 'object':
      return `expect(typeof ${target}).toBe('object');`;
    default:
      return `expect(typeof ${target}).toBe('${expected}');`;
  }
}

function getTargetExpression(assertion: Assertion, resultVar: string): string {
  if ('path' in assertion && assertion.path) {
    const path = assertion.path;
    if (path.startsWith('[')) {
      return `${resultVar}${path}`;
    }
    if (path.includes('.')) {
      return `${resultVar}.${path}`;
    }
    return `${resultVar}['${path}']`;
  }
  return resultVar;
}

function formatTSValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(formatTSValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => `${k}: ${formatTSValue(v)}`)
      .join(', ');
    return `{ ${entries} }`;
  }
  return String(value);
}

export function renderThrowsExpectation(
  funcCall: string, 
  assertion: Assertion, 
  isAsync: boolean
): string {
  if (assertion.type !== 'throws') return '';

  const expectFn = isAsync 
    ? `await expect(async () => ${funcCall})` 
    : `expect(() => ${funcCall})`;
  
  const throwMatcher = isAsync ? 'rejects.toThrow' : 'toThrow';

  if (assertion.errorType) {
    return `${expectFn}.${throwMatcher}(${assertion.errorType});`;
  }
  if (assertion.messageContains) {
    return `${expectFn}.${throwMatcher}(${formatTSValue(assertion.messageContains)});`;
  }
  return `${expectFn}.${throwMatcher}();`;
}

export function formatTSArgs(args: Record<string, unknown>): string {
  return Object.values(args).map(formatTSValue).join(', ');
}
