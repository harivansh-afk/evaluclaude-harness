import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { 
  runTests, 
  formatResults, 
  detectTestFramework,
  type TestFramework,
  type ExecutionOptions,
  DEFAULT_SANDBOX_CONFIG 
} from '../../runners/index.js';
import { createTracer, saveTrace } from '../../observability/index.js';
import { exportToPromptfooFormat } from '../../promptfoo/results-exporter.js';
import type { EvalSpec } from '../../analyzer/types.js';
import { 
  style, 
  icons, 
  Spinner, 
  formatError, 
  nextSteps, 
  keyValue, 
  resultBox,
  section,
  formatDuration
} from '../theme.js';

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
  .option('--export-promptfoo', 'Export results in Promptfoo format', false)
  .option('-w, --watch', 'Watch mode (rerun on changes)', false)
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude run')}                        ${style.dim('Run tests from ./tests/generated')}
  ${style.command('evaluclaude run ./my-tests')}             ${style.dim('Run tests from custom directory')}
  ${style.command('evaluclaude run -f pytest')}              ${style.dim('Use pytest framework')}
  ${style.command('evaluclaude run --spec eval-spec.json')}  ${style.dim('Map results to EvalSpec')}
  ${style.command('evaluclaude run --export-promptfoo')}     ${style.dim('Export for Promptfoo UI')}
  ${style.command('evaluclaude run --no-sandbox')}           ${style.dim('Disable sandboxing')}
`)
  .action(async (testDir: string, options) => {
    try {
      console.log(`\n${icons.test} ${style.bold('Running tests from')} ${style.path(testDir)}\n`);

      if (!existsSync(testDir)) {
        console.log(formatError(`Test directory not found: ${testDir}`, [
          `Create the directory: ${style.command(`mkdir -p ${testDir}`)}`,
          `Generate tests first: ${style.command('evaluclaude render <spec>')}`,
          'Check the path is correct'
        ]));
        process.exit(1);
      }

      const framework: TestFramework = options.framework || detectTestFramework(testDir);
      console.log(keyValue('Framework', style.info(framework), 1));
      console.log(keyValue('Sandbox', options.sandbox ? style.success('enabled') : style.warning('disabled'), 1));
      console.log(keyValue('Timeout', style.number(`${options.timeout}ms`), 1));

      let spec: EvalSpec | undefined;
      if (options.spec && existsSync(options.spec)) {
        spec = JSON.parse(readFileSync(options.spec, 'utf-8')) as EvalSpec;
        console.log(keyValue('Spec', `${style.path(options.spec)} ${style.muted(`(${spec.scenarios.length} scenarios)`)}`, 1));
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

      const spinner = new Spinner('Running tests...');
      spinner.start();
      const startTime = Date.now();

      const result = await runTests(
        testDir,
        execOptions,
        options.sandbox ? DEFAULT_SANDBOX_CONFIG : undefined
      );

      const duration = Date.now() - startTime;

      if (result.summary.failed > 0) {
        spinner.fail(`Tests completed with ${style.error(`${result.summary.failed} failures`)}`);
      } else {
        spinner.succeed(`Tests completed in ${style.number(formatDuration(duration))}`);
      }

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

      console.log('\n' + resultBox({
        passed: result.summary.passed,
        failed: result.summary.failed,
        skipped: result.summary.skipped,
        duration,
      }));

      if (spec) {
        const mappedResults = mapResultsToScenarios(result, spec);
        console.log(section('Scenario Coverage'));
        console.log(keyValue('Covered', `${style.success(String(mappedResults.covered))}/${style.number(String(spec.scenarios.length))}`, 1));
        if (mappedResults.unmapped > 0) {
          console.log(keyValue('Unmapped', style.warning(String(mappedResults.unmapped)), 1));
        }
      }

      if (options.output) {
        const { writeFileSync, mkdirSync } = await import('fs');
        const { dirname } = await import('path');
        mkdirSync(dirname(options.output), { recursive: true });
        writeFileSync(options.output, JSON.stringify(result, null, 2));
        console.log(`\n${icons.folder} Results saved to: ${style.path(options.output)}`);
      }

      if (options.exportPromptfoo) {
        const exportPath = await exportToPromptfooFormat(result, spec, {
          outputDir: '.evaluclaude/results',
          evalId: `eval-${Date.now()}`,
        });
        console.log(`\n${icons.spec} Promptfoo results exported: ${style.path(exportPath)}`);
      }

      if (tracer) {
        const trace = tracer.finalize();
        const tracePath = await saveTrace(trace);
        console.log(`\n${icons.trace} Trace saved: ${style.path(tracePath)}`);
      }

      console.log(nextSteps([
        { command: 'evaluclaude view <trace-id>', description: 'View execution trace' },
        { command: 'evaluclaude ui', description: 'Launch interactive results viewer' },
      ]));

      if (result.summary.failed > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.log(formatError(
        error instanceof Error ? error.message : String(error),
        [
          'Check that the test directory exists and contains valid tests',
          'Ensure the test framework is installed',
          `Run with ${style.command('--no-sandbox')} if sandbox is causing issues`
        ]
      ));
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
