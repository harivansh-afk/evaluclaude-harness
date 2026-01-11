import type { EvalSpec } from '../analyzer/types.js';
import type { RenderOptions, RenderResult, Framework, GeneratedFile } from './types.js';
import { BaseRenderer } from './base.js';
import { PytestRenderer } from './python/pytest-renderer.js';
import { VitestRenderer, JestRenderer } from './typescript/vitest-renderer.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export type { RenderOptions, RenderResult, GeneratedFile, Framework } from './types.js';
export { BaseRenderer } from './base.js';
export { PytestRenderer } from './python/pytest-renderer.js';
export { VitestRenderer, JestRenderer } from './typescript/vitest-renderer.js';

const rendererRegistry: Record<Framework, new (options: RenderOptions) => BaseRenderer> = {
  pytest: PytestRenderer,
  vitest: VitestRenderer,
  jest: JestRenderer,
};

export function createRenderer(options: RenderOptions): BaseRenderer {
  const RendererClass = rendererRegistry[options.framework];
  if (!RendererClass) {
    throw new Error(`Unknown framework: ${options.framework}`);
  }
  return new RendererClass(options);
}

export async function renderSpec(spec: EvalSpec, options: RenderOptions): Promise<RenderResult> {
  const renderer = createRenderer(options);
  const result = await renderer.render(spec);
  
  if (!options.dryRun) {
    for (const file of result.files) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.content, 'utf-8');
    }
  }
  
  return result;
}

export async function renderIncremental(
  spec: EvalSpec,
  options: RenderOptions,
  changedFiles: string[]
): Promise<RenderResult> {
  const filteredSpec: EvalSpec = {
    ...spec,
    scenarios: spec.scenarios.filter(s =>
      changedFiles.some(f => s.target.module.includes(f))
    ),
  };
  return renderSpec(filteredSpec, options);
}

export function detectFramework(spec: EvalSpec): Framework {
  const languages = spec.repo.languages;
  
  if (languages.includes('python')) {
    return 'pytest';
  }
  if (languages.includes('typescript') || languages.includes('javascript')) {
    return 'vitest';
  }
  
  return 'vitest';
}
