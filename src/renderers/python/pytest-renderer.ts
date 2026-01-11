import type { EvalScenario, Assertion } from '../../analyzer/types.js';
import { BaseRenderer } from '../base.js';
import { renderPytestAssertion, renderThrowsContext, formatPythonArgs, formatPythonKwargs } from './assertions.js';

export class PytestRenderer extends BaseRenderer {
  get language(): 'python' {
    return 'python';
  }

  get fileExtension(): string {
    return '.py';
  }

  protected renderTestFile(module: string, scenarios: EvalScenario[]): string {
    const imports = this.generateImports(module, scenarios);
    const fixtures = this.options.includeFixtures ? this.generateFixtures(scenarios) : '';
    const tests = scenarios.map(s => this.renderTest(s)).join('\n\n');

    return `${imports}\n\n${fixtures}${tests}\n`;
  }

  private generateImports(module: string, scenarios: EvalScenario[]): string {
    const imports: string[] = [
      'import pytest',
    ];

    const hasRegex = scenarios.some(s => 
      s.assertions.some(a => a.type === 'matches')
    );
    if (hasRegex) {
      imports.push('import re');
    }

    const hasMocks = scenarios.some(s => s.setup?.mocks?.length);
    if (hasMocks || this.options.generateMocks) {
      imports.push('from unittest.mock import patch, MagicMock');
    }

    const functions = [...new Set(scenarios.map(s => s.target.function))];
    const modulePath = module.replace(/\.(py|ts|tsx|js|jsx)$/, '').replace(/\//g, '.');
    imports.push(`from ${modulePath} import ${functions.join(', ')}`);

    return imports.join('\n');
  }

  private generateFixtures(scenarios: EvalScenario[]): string {
    const fixtureNames = new Set<string>();
    for (const scenario of scenarios) {
      if (scenario.setup?.fixtures) {
        for (const fixture of scenario.setup.fixtures) {
          fixtureNames.add(fixture);
        }
      }
    }

    if (fixtureNames.size === 0) return '';

    const fixtures = Array.from(fixtureNames).map(name => `
@pytest.fixture
def ${name}():
    # TODO: Implement fixture
    pass
`).join('\n');

    return fixtures + '\n';
  }

  private renderTest(scenario: EvalScenario): string {
    const testName = `test_${this.toSnakeCase(scenario.id)}`;
    const docstring = scenario.description ? `    """${scenario.description}"""\n` : '';
    
    const throwsAssertion = scenario.assertions.find(a => a.type === 'throws');
    const regularAssertions = scenario.assertions.filter(a => a.type !== 'throws');

    const fixtureParams = scenario.setup?.fixtures?.join(', ') || '';
    const funcParams = fixtureParams ? `(${fixtureParams})` : '()';

    let body: string;
    if (throwsAssertion) {
      body = this.renderThrowsTest(scenario, throwsAssertion);
    } else {
      body = this.renderRegularTest(scenario, regularAssertions);
    }

    const mocks = this.renderMocks(scenario);
    if (mocks) {
      body = mocks.decorators + `def ${testName}${funcParams}:\n${docstring}${mocks.setup}${body}`;
    } else {
      body = `def ${testName}${funcParams}:\n${docstring}${body}`;
    }

    return body;
  }

  private renderRegularTest(scenario: EvalScenario, assertions: Assertion[]): string {
    const funcCall = this.renderFunctionCall(scenario);
    const assertionLines = assertions
      .map(a => this.renderAssertion(a, 'result'))
      .filter(Boolean)
      .map(a => `    ${a}`)
      .join('\n');

    return `    result = ${funcCall}\n${assertionLines}`;
  }

  private renderThrowsTest(scenario: EvalScenario, throwsAssertion: Assertion): string {
    const ctx = renderThrowsContext(throwsAssertion);
    if (!ctx) return this.renderRegularTest(scenario, scenario.assertions);

    const funcCall = this.renderFunctionCall(scenario);
    return `    with ${ctx.contextManager}:\n        ${funcCall}`;
  }

  private renderFunctionCall(scenario: EvalScenario): string {
    const func = scenario.target.function;
    const args = formatPythonArgs(scenario.input.args);
    const kwargs = scenario.input.kwargs ? formatPythonKwargs(scenario.input.kwargs) : '';
    
    const allArgs = [args, kwargs].filter(Boolean).join(', ');
    return `${func}(${allArgs})`;
  }

  private renderMocks(scenario: EvalScenario): { decorators: string; setup: string } | null {
    if (!scenario.setup?.mocks?.length && !this.options.generateMocks) return null;
    
    const mocks = scenario.setup?.mocks || [];
    if (mocks.length === 0) return null;

    const decorators = mocks
      .map((m, i) => `@patch("${m.target}")\n`)
      .join('');

    const setup = mocks
      .map((m, i) => {
        const mockName = `mock_${i}`;
        if (m.returnValue !== undefined) {
          return `    ${mockName}.return_value = ${this.formatValue(m.returnValue)}\n`;
        }
        if (m.sideEffect) {
          return `    ${mockName}.side_effect = ${m.sideEffect}\n`;
        }
        return '';
      })
      .join('');

    return { decorators, setup };
  }

  protected renderAssertion(assertion: Assertion, resultVar: string): string {
    return renderPytestAssertion(assertion, resultVar);
  }

  protected formatValue(value: unknown): string {
    if (value === null) return 'None';
    if (value === undefined) return 'None';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'string') return JSON.stringify(value);
    return String(value);
  }
}
