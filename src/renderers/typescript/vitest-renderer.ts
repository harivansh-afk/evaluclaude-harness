import type { EvalScenario, Assertion } from '../../analyzer/types.js';
import { BaseRenderer } from '../base.js';
import { renderTSAssertion, renderThrowsExpectation, formatTSArgs } from './assertions.js';

export class VitestRenderer extends BaseRenderer {
  get language(): 'typescript' {
    return 'typescript';
  }

  get fileExtension(): string {
    return '.test.ts';
  }

  protected renderTestFile(module: string, scenarios: EvalScenario[]): string {
    const imports = this.generateImports(module, scenarios);
    const describes = this.generateDescribe(module, scenarios);
    return `${imports}\n\n${describes}\n`;
  }

  protected generateImports(module: string, scenarios: EvalScenario[]): string {
    const imports: string[] = [
      `import { describe, it, expect } from 'vitest';`,
    ];

    const hasMocks = scenarios.some(s => s.setup?.mocks?.length);
    if (hasMocks || this.options.generateMocks) {
      imports.push(`import { vi } from 'vitest';`);
    }

    const functions = [...new Set(scenarios.map(s => s.target.function))];
    const modulePath = module.replace(/\.(ts|tsx|js|jsx)$/, '');
    imports.push(`import { ${functions.join(', ')} } from '${modulePath}';`);

    return imports.join('\n');
  }

  protected generateDescribe(module: string, scenarios: EvalScenario[]): string {
    const moduleName = module.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || module;
    const tests = scenarios.map(s => this.renderTest(s)).join('\n\n');
    return `describe('${moduleName}', () => {\n${tests}\n});`;
  }

  protected renderTest(scenario: EvalScenario): string {
    const testName = scenario.name || scenario.id;
    const isAsync = this.hasAsyncTarget(scenario);
    const asyncPrefix = isAsync ? 'async ' : '';
    
    const throwsAssertion = scenario.assertions.find(a => a.type === 'throws');
    const regularAssertions = scenario.assertions.filter(a => a.type !== 'throws');

    let body: string;
    if (throwsAssertion) {
      body = this.renderThrowsTest(scenario, throwsAssertion, isAsync);
    } else {
      body = this.renderRegularTest(scenario, regularAssertions, isAsync);
    }

    const mocks = this.renderMocks(scenario);
    const mockSetup = mocks ? `\n${mocks}` : '';

    return `  it('${testName}', ${asyncPrefix}() => {${mockSetup}
${body}
  });`;
  }

  protected hasAsyncTarget(scenario: EvalScenario): boolean {
    return scenario.target.type === 'function' && 
           (scenario.target.function.startsWith('async') || 
            scenario.tags?.includes('async'));
  }

  protected renderRegularTest(scenario: EvalScenario, assertions: Assertion[], isAsync: boolean): string {
    const funcCall = this.renderFunctionCall(scenario);
    const awaitPrefix = isAsync ? 'await ' : '';
    
    const assertionLines = assertions
      .map(a => this.renderAssertion(a, 'result'))
      .filter(Boolean)
      .map(a => `    ${a}`)
      .join('\n');

    return `    const result = ${awaitPrefix}${funcCall};\n${assertionLines}`;
  }

  protected renderThrowsTest(scenario: EvalScenario, throwsAssertion: Assertion, isAsync: boolean): string {
    const funcCall = this.renderFunctionCall(scenario);
    return `    ${renderThrowsExpectation(funcCall, throwsAssertion, isAsync)}`;
  }

  protected renderFunctionCall(scenario: EvalScenario): string {
    const func = scenario.target.function;
    const args = formatTSArgs(scenario.input.args);
    return `${func}(${args})`;
  }

  protected renderMocks(scenario: EvalScenario): string | null {
    if (!scenario.setup?.mocks?.length) return null;
    
    return scenario.setup.mocks
      .map(m => {
        if (m.returnValue !== undefined) {
          return `    vi.mock('${m.target}', () => (${JSON.stringify(m.returnValue)}));`;
        }
        if (m.sideEffect) {
          return `    vi.mock('${m.target}', () => { throw new Error('${m.sideEffect}'); });`;
        }
        return `    vi.mock('${m.target}');`;
      })
      .join('\n');
  }

  protected renderAssertion(assertion: Assertion, resultVar: string): string {
    return renderTSAssertion(assertion, resultVar, 'vitest');
  }
}

export class JestRenderer extends VitestRenderer {
  protected generateImports(module: string, scenarios: EvalScenario[]): string {
    const imports: string[] = [];

    const hasMocks = scenarios.some(s => s.setup?.mocks?.length);
    if (hasMocks || this.options.generateMocks) {
      imports.push(`import { jest } from '@jest/globals';`);
    }

    const functions = [...new Set(scenarios.map(s => s.target.function))];
    const modulePath = module.replace(/\.(ts|tsx|js|jsx)$/, '');
    imports.push(`import { ${functions.join(', ')} } from '${modulePath}';`);

    return imports.join('\n');
  }

  protected renderMocks(scenario: EvalScenario): string | null {
    if (!scenario.setup?.mocks?.length) return null;
    
    return scenario.setup.mocks
      .map(m => {
        if (m.returnValue !== undefined) {
          return `    jest.mock('${m.target}', () => (${JSON.stringify(m.returnValue)}));`;
        }
        if (m.sideEffect) {
          return `    jest.mock('${m.target}', () => { throw new Error('${m.sideEffect}'); });`;
        }
        return `    jest.mock('${m.target}');`;
      })
      .join('\n');
  }

  protected renderAssertion(assertion: Assertion, resultVar: string): string {
    return renderTSAssertion(assertion, resultVar, 'jest');
  }
}
