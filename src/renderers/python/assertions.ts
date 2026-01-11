import type { Assertion } from '../../analyzer/types.js';

export function renderPytestAssertion(assertion: Assertion, resultVar: string): string {
  const target = getTargetExpression(assertion, resultVar);

  switch (assertion.type) {
    case 'equals':
      return `assert ${target} == ${formatPythonValue(assertion.expected)}`;

    case 'contains':
      return `assert ${formatPythonValue(assertion.value)} in ${target}`;

    case 'typeof':
      return `assert isinstance(${target}, ${mapPythonType(assertion.expected)})`;

    case 'matches':
      return `assert re.match(${formatPythonValue(assertion.pattern)}, ${target})`;

    case 'throws':
      return ''; // Handled specially in test structure

    case 'truthy':
      return `assert ${target}`;

    case 'falsy':
      return `assert not ${target}`;

    case 'custom':
      return `assert ${assertion.check}  # ${assertion.description}`;

    case 'llm-rubric':
      return `# LLM Rubric: ${assertion.rubric} - skipped (requires grader)`;

    default:
      return `# Unknown assertion type: ${(assertion as Assertion).type}`;
  }
}

function getTargetExpression(assertion: Assertion, resultVar: string): string {
  if ('path' in assertion && assertion.path) {
    const path = assertion.path;
    if (path.startsWith('[')) {
      return `${resultVar}${path}`;
    }
    return `${resultVar}["${path}"]`;
  }
  return resultVar;
}

function formatPythonValue(value: unknown): string {
  if (value === null) return 'None';
  if (value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(formatPythonValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => `"${k}": ${formatPythonValue(v)}`)
      .join(', ');
    return `{${entries}}`;
  }
  return String(value);
}

function mapPythonType(tsType: string): string {
  const typeMap: Record<string, string> = {
    'string': 'str',
    'number': '(int, float)',
    'boolean': 'bool',
    'object': 'dict',
    'array': 'list',
    'null': 'type(None)',
    'undefined': 'type(None)',
  };
  return typeMap[tsType] || tsType;
}

export function renderThrowsContext(assertion: Assertion): { contextManager: string; exceptionType: string } | null {
  if (assertion.type !== 'throws') return null;
  
  const exceptionType = assertion.errorType || 'Exception';
  let contextManager = `pytest.raises(${exceptionType})`;
  
  if (assertion.messageContains) {
    contextManager = `pytest.raises(${exceptionType}, match=${formatPythonValue(assertion.messageContains)})`;
  }
  
  return { contextManager, exceptionType };
}

export function formatPythonArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([_, value]) => formatPythonValue(value))
    .join(', ');
}

export function formatPythonKwargs(kwargs: Record<string, unknown>): string {
  return Object.entries(kwargs)
    .map(([key, value]) => `${key}=${formatPythonValue(value)}`)
    .join(', ');
}
