/**
 * Export test execution results to Promptfoo format for viewing in the UI.
 * 
 * Instead of using Promptfoo to run tests (which requires a provider that
 * responds quickly), we run tests ourselves and export results to Promptfoo's
 * result format. This allows us to use Promptfoo's excellent visualization UI.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { ExecutionResult } from '../runners/types.js';
import type { EvalSpec } from '../analyzer/types.js';
import type { PromptfooResult, PromptfooTestResult } from './types.js';

export interface ExportOptions {
  outputDir: string;
  evalId?: string;
  includeSpec?: boolean;
}

/**
 * Export ExecutionResult to Promptfoo result format.
 */
export async function exportToPromptfooFormat(
  result: ExecutionResult,
  spec: EvalSpec | undefined,
  options: ExportOptions
): Promise<string> {
  const { outputDir, evalId = `eval-${Date.now()}` } = options;

  const promptfooResult = buildPromptfooResult(result, spec, evalId);

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${evalId}.json`);
  await writeFile(outputPath, JSON.stringify(promptfooResult, null, 2));

  // Also write the latest.json symlink equivalent
  const latestPath = join(outputDir, 'latest.json');
  await writeFile(latestPath, JSON.stringify(promptfooResult, null, 2));

  return outputPath;
}

function buildPromptfooResult(
  result: ExecutionResult,
  spec: EvalSpec | undefined,
  evalId: string
): PromptfooResult {
  const testResults: PromptfooTestResult[] = result.tests.map(test => {
    // Try to find matching scenario from spec
    const scenario = spec?.scenarios.find(s => 
      s.id === test.id || test.name.includes(s.id)
    );

    return {
      prompt: {
        raw: scenario?.id || test.id,
        label: scenario?.name || test.name,
      },
      vars: {
        scenario_id: scenario?.id || test.id,
        target_module: scenario?.target.module || '',
        target_function: scenario?.target.function || '',
        description: scenario?.description || test.name,
      },
      response: {
        output: test.status === 'passed' 
          ? 'Test passed successfully'
          : test.error?.message || 'Test failed',
      },
      gradingResult: {
        pass: test.status === 'passed',
        score: test.status === 'passed' ? 1 : 0,
        reason: test.status === 'passed'
          ? 'All assertions passed'
          : test.error?.message || 'Test failed',
        componentResults: test.assertions.details.map(a => ({
          pass: a.passed,
          score: a.passed ? 1 : 0,
          reason: a.description,
          assertion: {
            type: 'custom',
            value: a.description,
          },
        })),
      },
      success: test.status === 'passed',
      error: test.error?.message,
    };
  });

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    results: testResults,
    stats: {
      successes: result.summary.passed,
      failures: result.summary.failed,
      tokenUsage: {
        total: 0,
        prompt: 0,
        completion: 0,
      },
    },
  };
}

/**
 * Generate a minimal Promptfoo config that just views results (no provider).
 */
export function generateViewOnlyConfig(spec: EvalSpec): string {
  return `# Evaluclaude Results Config
# This config is for viewing results only - tests are run via evaluclaude run

description: "Test results for ${spec.repo.name}"

# No providers needed - we pre-run tests and import results
providers: []

prompts: []

tests: []

# Results are stored here by evaluclaude run --export-promptfoo
outputPath: .evaluclaude/results/latest.json
`;
}
