/**
 * Bridge between our test runners and Promptfoo's provider interface.
 * 
 * This module provides a unified way to run tests that works both:
 * 1. Standalone via our `run` command
 * 2. As a Promptfoo provider via the generated test-runner.py
 * 
 * Results are stored in a format compatible with Promptfoo's expectations.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { runTests, type ExecutionResult, type ExecutionOptions, DEFAULT_SANDBOX_CONFIG } from '../runners/index.js';
import { createTracer, saveTrace, type EvalTrace } from '../observability/index.js';

export interface PromptfooProviderResult {
  output: string;
  error: string | null;
  tokenUsage?: {
    total: number;
    prompt: number;
    completion: number;
  };
}

export interface RunTestsForPromptfooOptions {
  scenarioId: string;
  testDir: string;
  framework: 'pytest' | 'vitest' | 'jest';
  timeout?: number;
  sandbox?: boolean;
  evalId?: string;
  recordTrace?: boolean;
}

/**
 * Run tests for a specific scenario and format results for Promptfoo.
 */
export async function runTestsForPromptfoo(
  options: RunTestsForPromptfooOptions
): Promise<PromptfooProviderResult> {
  const {
    scenarioId,
    testDir,
    framework,
    timeout = 300000,
    sandbox = true,
    evalId = `eval-${Date.now()}`,
    recordTrace = true,
  } = options;

  const tracer = recordTrace ? createTracer(evalId) : null;

  try {
    const execOptions: ExecutionOptions = {
      framework,
      sandbox,
      timeout,
      parallel: false,
      filter: scenarioId ? [scenarioId] : undefined,
      cwd: process.cwd(),
    };

    tracer?.recordIntrospection({
      filesAnalyzed: [testDir],
      duration: 0,
    });

    const result = await runTests(
      testDir,
      execOptions,
      sandbox ? DEFAULT_SANDBOX_CONFIG : undefined
    );

    // Record execution results in trace
    if (tracer) {
      tracer.recordExecution({
        testsPassed: result.summary.passed,
        testsFailed: result.summary.failed,
        testsSkipped: result.summary.skipped,
      });

      for (const test of result.tests) {
        if (test.status === 'failed' || test.status === 'error') {
          tracer.recordTestFailure({
            scenarioId: test.id,
            testName: test.name,
            error: test.error?.message || 'Unknown error',
            stack: test.error?.stack,
          });
        }
      }
    }

    // Build Promptfoo-compatible output
    const promptfooOutput = buildPromptfooOutput(result, scenarioId);

    // Save trace if enabled
    if (tracer) {
      const trace = tracer.finalize();
      await saveTrace(trace);
    }

    return {
      output: JSON.stringify(promptfooOutput),
      error: null,
    };
  } catch (error) {
    if (tracer) {
      tracer.recordError(error instanceof Error ? error : new Error(String(error)));
      const trace = tracer.finalize();
      await saveTrace(trace);
    }

    return {
      output: JSON.stringify({
        passed: 0,
        failed: 1,
        error: error instanceof Error ? error.message : String(error),
      }),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build Promptfoo-compatible output from ExecutionResult.
 */
function buildPromptfooOutput(
  result: ExecutionResult,
  scenarioId?: string
): Record<string, unknown> {
  const matchingTests = scenarioId
    ? result.tests.filter(t => t.id === scenarioId || t.name.includes(scenarioId))
    : result.tests;

  return {
    passed: matchingTests.filter(t => t.status === 'passed').length,
    failed: matchingTests.filter(t => t.status === 'failed' || t.status === 'error').length,
    skipped: matchingTests.filter(t => t.status === 'skipped').length,
    total: matchingTests.length,
    tests: matchingTests.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      duration: t.duration,
      error: t.error?.message,
    })),
    summary: {
      ...result.summary,
      matchedScenario: scenarioId,
    },
    errors: result.errors,
  };
}

/**
 * Generate a Promptfoo-compatible results file from our execution results.
 */
export async function savePromptfooResults(
  result: ExecutionResult,
  evalId: string,
  outputDir: string = '.evaluclaude/results'
): Promise<string> {
  const promptfooResult = {
    version: 1,
    timestamp: new Date().toISOString(),
    evalId,
    results: result.tests.map(t => ({
      prompt: { raw: t.id, label: t.name },
      vars: { scenario_id: t.id },
      response: {
        output: t.status === 'passed' ? 'PASS' : t.error?.message || 'FAIL',
      },
      gradingResult: {
        pass: t.status === 'passed',
        score: t.status === 'passed' ? 1 : 0,
        reason: t.error?.message || (t.status === 'passed' ? 'Test passed' : 'Test failed'),
      },
      success: t.status === 'passed',
      error: t.error?.message,
    })),
    stats: {
      successes: result.summary.passed,
      failures: result.summary.failed,
    },
  };

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `promptfoo-${evalId}.json`);
  await writeFile(outputPath, JSON.stringify(promptfooResult, null, 2));

  return outputPath;
}
