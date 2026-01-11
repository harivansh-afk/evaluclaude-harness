import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { 
  runTests, 
  formatResults, 
  detectTestFramework,
  type TestFramework,
  type ExecutionOptions,
  DEFAULT_SANDBOX_CONFIG 
} from '../../runners/index.js';
import { createTracer, saveTrace } from '../../observability/index.js';
import type { EvalSpec } from '../../analyzer/types.js';

export const runCommand = new Command('run')
  .description('Run generated tests and collect results')
  .argument('[test-dir]', 'Directory containing test files', './tests/generated')
  .option('-f, --framework <framework>', 'Test framework (pytest, vitest, jest)')
  .option('-s, --spec <spec>', 'Path to EvalSpec JSON for result mapping')
  .option('--sandbox', 'Run tests in sandbox mode', true)
  .option('--no-sandbox', 'Disable sandbox mode')
  .option('-t, --timeout <ms>', 'Test timeout in milliseconds', '300000')
  .option('-p, --parallel', 'Run tests in parallel', false)
  .option('--filter <patterns...>', 'Run only tests matching patterns')
  .option('-o, --output <file>', 'Output results to JSON file')
  .option('--trace', 'Record execution trace', true)
  .option('--no-trace', 'Disable execution tracing')
  .option('-w, --watch', 'Watch mode (rerun on changes)', false)
  .action(async (testDir: string, options) => {
    try {
      console.log(`\n🧪 Running tests from ${testDir}...\n`);

      if (!existsSync(testDir)) {
        console.error(`Error: Test directory not found: ${testDir}`);
        process.exit(1);
      }

      const framework: TestFramework = options.framework || detectTestFramework(testDir);
      console.log(`   Framework: ${framework}`);
      console.log(`   Sandbox: ${options.sandbox ? 'enabled' : 'disabled'}`);
      console.log(`   Timeout: ${options.timeout}ms`);

      let spec: EvalSpec | undefined;
      if (options.spec && existsSync(options.spec)) {
        spec = JSON.parse(readFileSync(options.spec, 'utf-8')) as EvalSpec;
        console.log(`   Spec: ${options.spec} (${spec.scenarios.length} scenarios)`);
      }

      const tracer = options.trace ? createTracer(spec?.repo.name || 'unknown') : null;

      const execOptions: ExecutionOptions = {
        framework,
        sandbox: options.sandbox,
        timeout: parseInt(options.timeout, 10),
        parallel: options.parallel,
        filter: options.filter,
        cwd: process.cwd(),
      };

      if (tracer) {
        tracer.recordIntrospection({
          filesAnalyzed: [testDir],
          duration: 0,
        });
      }

      console.log('\n   Running tests...\n');
      const startTime = Date.now();

      const result = await runTests(
        testDir,
        execOptions,
        options.sandbox ? DEFAULT_SANDBOX_CONFIG : undefined
      );

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

      console.log(formatResults(result));

      if (spec) {
        const mappedResults = mapResultsToScenarios(result, spec);
        console.log(`\n📊 Scenario Coverage:`);
        console.log(`   Covered:   ${mappedResults.covered}/${spec.scenarios.length}`);
        console.log(`   Unmapped:  ${mappedResults.unmapped}`);
      }

      if (options.output) {
        const { writeFileSync, mkdirSync } = await import('fs');
        const { dirname } = await import('path');
        mkdirSync(dirname(options.output), { recursive: true });
        writeFileSync(options.output, JSON.stringify(result, null, 2));
        console.log(`\n📁 Results saved to: ${options.output}`);
      }

      if (tracer) {
        const trace = tracer.finalize();
        const tracePath = await saveTrace(trace);
        console.log(`\n📊 Trace saved: ${tracePath}`);
        console.log(`   View with: evaluclaude view ${trace.id}`);
      }

      if (result.summary.failed > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error running tests:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

function mapResultsToScenarios(
  result: Awaited<ReturnType<typeof runTests>>,
  spec: EvalSpec
): { covered: number; unmapped: number } {
  const scenarioIds = new Set(spec.scenarios.map(s => s.id));
  let covered = 0;
  let unmapped = 0;

  for (const test of result.tests) {
    if (scenarioIds.has(test.id)) {
      covered++;
    } else {
      unmapped++;
    }
  }

  return { covered, unmapped };
}
