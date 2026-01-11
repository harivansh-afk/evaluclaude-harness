import type { EvalSpec, EvalScenario } from '../analyzer/types.js';
import type { RenderOptions, RenderResult, GeneratedFile, ScenarioGroup, RenderStats } from './types.js';

export abstract class BaseRenderer {
  protected options: RenderOptions;

  constructor(options: RenderOptions) {
    this.options = options;
  }

  abstract get language(): 'python' | 'typescript';
  abstract get fileExtension(): string;

  async render(spec: EvalSpec): Promise<RenderResult> {
    const groups = this.groupByModule(spec.scenarios);
    const files: GeneratedFile[] = [];
    let assertionCount = 0;
    let skippedCount = 0;

    for (const group of groups) {
      const validScenarios = group.scenarios.filter(s => this.canRender(s));
      skippedCount += group.scenarios.length - validScenarios.length;

      if (validScenarios.length === 0) continue;

      const content = this.renderTestFile(group.module, validScenarios);
      const path = this.getOutputPath(group.module);
      
      assertionCount += validScenarios.reduce((sum, s) => sum + s.assertions.length, 0);

      files.push({
        path,
        content,
        scenarios: validScenarios.map(s => s.id),
        language: this.language,
      });
    }

    const stats: RenderStats = {
      scenarioCount: spec.scenarios.length - skippedCount,
      fileCount: files.length,
      assertionCount,
      skippedCount,
    };

    return { files, stats };
  }

  protected groupByModule(scenarios: EvalScenario[]): ScenarioGroup[] {
    const groups = new Map<string, EvalScenario[]>();
    
    for (const scenario of scenarios) {
      const module = scenario.target.module;
      if (!groups.has(module)) {
        groups.set(module, []);
      }
      groups.get(module)!.push(scenario);
    }

    return Array.from(groups.entries()).map(([module, scenarios]) => ({
      module,
      scenarios,
    }));
  }

  protected canRender(scenario: EvalScenario): boolean {
    return scenario.assertions.every(a => a.type !== 'llm-rubric');
  }

  protected getOutputPath(modulePath: string): string {
    const baseName = modulePath
      .replace(/\.(py|ts|tsx|js|jsx)$/, '')
      .replace(/\//g, '_');
    return `${this.options.outputDir}/test_${baseName}${this.fileExtension}`;
  }

  protected abstract renderTestFile(module: string, scenarios: EvalScenario[]): string;
  
  protected abstract renderAssertion(assertion: EvalScenario['assertions'][0], resultVar: string): string;

  protected toSnakeCase(str: string): string {
    return str.replace(/-/g, '_').replace(/([A-Z])/g, '_$1').toLowerCase();
  }

  protected toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  protected formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }
}
