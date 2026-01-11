import type { EvalSpec, EvalScenario } from '../analyzer/types.js';

export type Framework = 'pytest' | 'vitest' | 'jest';

export interface RenderOptions {
  outputDir: string;
  framework: Framework;
  includeFixtures: boolean;
  generateMocks: boolean;
  dryRun?: boolean;
}

export interface RenderResult {
  files: GeneratedFile[];
  stats: RenderStats;
}

export interface RenderStats {
  scenarioCount: number;
  fileCount: number;
  assertionCount: number;
  skippedCount: number;
}

export interface GeneratedFile {
  path: string;
  content: string;
  scenarios: string[];
  language: 'python' | 'typescript';
}

export interface RendererContext {
  spec: EvalSpec;
  options: RenderOptions;
}

export interface ScenarioGroup {
  module: string;
  scenarios: EvalScenario[];
}
