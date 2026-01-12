import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { analyze } from '../../introspector/index.js';
import { generateEvalSpec, generateEvalSpecInteractive } from '../../analyzer/index.js';
import { renderSpec, detectFramework as detectRenderFramework } from '../../renderers/index.js';
import { runTests, formatResults, DEFAULT_SANDBOX_CONFIG } from '../../runners/index.js';
import { createTracer, saveTrace } from '../../observability/index.js';
import { generatePromptfooConfig, generateTestProvider } from '../../promptfoo/index.js';
import type { EvalSpec } from '../../analyzer/types.js';
import { 
  style, 
  icons, 
  header, 
  step, 
  keyValue, 
  resultBox, 
  nextSteps, 
  Spinner,
  formatError,
  BANNER,
  box 
} from '../theme.js';

const EVALUCLAUDE_DIR = '.evaluclaude';

interface PipelineOptions {
  output?: string;
  interactive?: boolean;
  focus?: string;
  maxScenarios: string;
  testDir: string;
  framework?: string;
  skipAnalyze?: boolean;
  skipRender?: boolean;
  skipRun?: boolean;
  promptfoo?: boolean;
  quiet?: boolean;
}

export const pipelineCommand = new Command('pipeline')
  .description('Run the complete eval pipeline: introspect → analyze → render → run')
  .argument('[path]', 'Path to the repository to analyze', '.')
  .option('-o, --output <dir>', 'Output directory for artifacts', '.evaluclaude')
  .option('-i, --interactive', 'Enable interactive mode with clarifying questions')
  .option('--focus <modules>', 'Comma-separated list of modules/functions to focus on')
  .option('--max-scenarios <n>', 'Maximum number of test scenarios', '10')
  .option('--test-dir <dir>', 'Directory for generated tests', './tests/generated')
  .option('-f, --framework <framework>', 'Test framework (pytest, vitest, jest)')
  .option('--skip-analyze', 'Skip analysis, use existing spec')
  .option('--skip-render', 'Skip rendering, use existing tests')
  .option('--skip-run', 'Skip test execution')
  .option('--promptfoo', 'Generate Promptfoo configuration')
  .option('--quiet', 'Suppress progress messages')
  .addHelpText('after', `
${style.bold('Examples:')}

  ${style.dim('# Analyze current directory')}
  $ evaluclaude pipeline .

  ${style.dim('# Interactive mode with focus on specific modules')}
  $ evaluclaude pipeline ./my-project -i --focus auth,payments

  ${style.dim('# Generate tests without running them')}
  $ evaluclaude pipeline . --skip-run

  ${style.dim('# Use existing spec and run tests')}
  $ evaluclaude pipeline . --skip-analyze
`)
  .action(async (repoPath: string, options: PipelineOptions) => {
    const absolutePath = resolve(repoPath);
    const quiet = options.quiet;
    const outputDir = options.output || EVALUCLAUDE_DIR;

    // Print header
    console.log(BANNER);
    console.log(style.primary(box.dHorizontal.repeat(55)));
    console.log(`  ${icons.folder} ${style.bold('Repository:')} ${style.path(absolutePath)}`);
    console.log(`  ${icons.file} ${style.bold('Output:')}     ${style.path(outputDir)}`);
    if (options.interactive) {
      console.log(`  ${icons.brain} ${style.bold('Mode:')}       ${style.highlight('Interactive')}`);
    }
    console.log(style.primary(box.dHorizontal.repeat(55)));
    console.log('');

    // Ensure output directories exist
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(options.testDir, { recursive: true });

    const specPath = join(outputDir, 'spec.json');
    const tracesDir = join(outputDir, 'traces');
    const resultsDir = join(outputDir, 'results');

    mkdirSync(tracesDir, { recursive: true });
    mkdirSync(resultsDir, { recursive: true });

    let spec: EvalSpec;

    // Step 1: Introspection + Analysis
    if (options.skipAnalyze && existsSync(specPath)) {
      console.log(step(1, 'Using existing EvalSpec', 'done'));
      spec = JSON.parse(readFileSync(specPath, 'utf-8'));
      console.log(`   ${style.dim('└─')} Loaded ${style.number(String(spec.scenarios.length))} scenarios from ${style.path(specPath)}`);
      console.log('');
    } else {
      console.log(step(1, 'Introspecting codebase...', 'running'));
      
      let spinner: Spinner | null = null;
      if (!quiet) {
        spinner = new Spinner('Parsing files with tree-sitter...');
        spinner.start();
      }

      try {
        const repoSummary = await analyze({
          root: absolutePath,
          onProgress: quiet ? undefined : (msg) => spinner?.update(msg),
        });

        spinner?.succeed(`Analyzed ${style.number(String(repoSummary.files.length))} files`);
        console.log(`   ${style.dim('└─')} Languages: ${repoSummary.languages.map(l => style.info(l)).join(', ')}`);
        console.log('');

        console.log(step(2, 'Generating EvalSpec with Claude...', 'running'));

        const focus = options.focus?.split(',').map(s => s.trim());
        const maxScenarios = parseInt(options.maxScenarios, 10);

        let result;
        if (options.interactive) {
          const { default: inquirer } = await import('inquirer');
          
          result = await generateEvalSpecInteractive(
            repoSummary,
            async (question: string) => {
              console.log('');
              const { answer } = await inquirer.prompt([{
                type: 'input',
                name: 'answer',
                message: `${icons.brain} ${style.highlight('Claude asks:')} ${question}`,
                prefix: '',
              }]);
              return answer;
            },
            { focus, maxScenarios }
          );
        } else {
          if (!quiet) {
            spinner = new Spinner('Claude is analyzing the codebase...');
            spinner.start();
          }
          
          result = await generateEvalSpec(repoSummary, {
            interactive: false,
            focus,
            maxScenarios,
          });
          
          spinner?.succeed('EvalSpec generated');
        }

        spec = result.spec;

        // Save the spec
        writeFileSync(specPath, JSON.stringify(spec, null, 2));

        console.log(`   ${style.dim('├─')} Scenarios: ${style.number(String(spec.scenarios.length))}`);
        console.log(`   ${style.dim('├─')} Tokens: ${style.number(String(result.tokensUsed))}`);
        console.log(`   ${style.dim('└─')} Saved: ${style.path(specPath)}`);
        console.log('');
      } catch (error) {
        spinner?.fail('Analysis failed');
        console.error(formatError(
          error instanceof Error ? error.message : String(error),
          ['Check that ANTHROPIC_API_KEY is set', 'Verify the path exists and contains source files']
        ));
        process.exit(1);
      }
    }

    // Step 2: Render tests
    if (!options.skipRender) {
      console.log(step(3, 'Rendering test files...', 'running'));

      let spinner: Spinner | null = null;
      if (!quiet) {
        spinner = new Spinner('Generating test code...');
        spinner.start();
      }

      try {
        const framework = (options.framework as 'pytest' | 'vitest' | 'jest') || detectRenderFramework(spec);
        
        const renderResult = await renderSpec(spec, {
          outputDir: options.testDir,
          framework,
          includeFixtures: true,
          generateMocks: true,
          dryRun: false,
        });

        spinner?.succeed(`Generated ${style.number(String(renderResult.stats.fileCount))} test files`);
        console.log(`   ${style.dim('├─')} Framework: ${style.info(framework)}`);
        console.log(`   ${style.dim('├─')} Scenarios: ${style.number(String(renderResult.stats.scenarioCount))}`);
        console.log(`   ${style.dim('├─')} Assertions: ${style.number(String(renderResult.stats.assertionCount))}`);
        console.log(`   ${style.dim('└─')} Output: ${style.path(options.testDir)}`);
        console.log('');
      } catch (error) {
        spinner?.fail('Rendering failed');
        console.error(formatError(
          error instanceof Error ? error.message : String(error),
          ['Verify the EvalSpec is valid JSON', 'Check the output directory is writable']
        ));
        process.exit(1);
      }
    }

    // Step 3: Run tests
    if (!options.skipRun) {
      console.log(step(4, 'Running tests...', 'running'));

      let spinner: Spinner | null = null;
      if (!quiet) {
        spinner = new Spinner('Executing test suite...');
        spinner.start();
      }

      try {
        const framework = (options.framework as 'pytest' | 'vitest' | 'jest') || detectRenderFramework(spec);
        const tracer = createTracer(spec.repo.name);

        tracer.recordIntrospection({
          filesAnalyzed: spec.scenarios.map(s => s.target.module),
          totalFunctions: spec.scenarios.length,
          duration: 0,
        });

        tracer.recordGeneration({
          scenariosGenerated: spec.scenarios.length,
          filesWritten: [options.testDir],
        });

        const result = await runTests(
          options.testDir,
          {
            framework,
            sandbox: true,
            timeout: 300000,
            parallel: false,
            cwd: process.cwd(),
          },
          DEFAULT_SANDBOX_CONFIG
        );

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

        const trace = tracer.finalize();
        const tracePath = await saveTrace(trace);

        spinner?.stop();
        
        // Show results box
        console.log('');
        console.log(resultBox({
          passed: result.summary.passed,
          failed: result.summary.failed,
          skipped: result.summary.skipped,
          duration: result.summary.duration,
        }));
        console.log('');
        console.log(`   ${icons.trace} Trace: ${style.path(tracePath)}`);
        console.log(`   ${style.dim('└─')} View: ${style.command(`evaluclaude view ${trace.id}`)}`);
        console.log('');

        // Save results
        const resultsPath = join(resultsDir, `run-${Date.now()}.json`);
        writeFileSync(resultsPath, JSON.stringify(result, null, 2));

      } catch (error) {
        spinner?.fail('Test execution failed');
        console.error(formatError(
          error instanceof Error ? error.message : String(error),
          ['Check the test framework is installed', 'Verify the test directory exists']
        ));
        process.exit(1);
      }
    }

    // Step 4: Generate Promptfoo config
    if (options.promptfoo) {
      console.log(step(5, 'Generating Promptfoo configuration...', 'running'));

      const spinner = new Spinner('Creating Promptfoo config...');
      spinner.start();

      try {
        const configPath = join(outputDir, 'promptfooconfig.yaml');
        const providerPath = join(outputDir, 'providers', 'test-runner.py');
        const framework = (options.framework as 'pytest' | 'vitest' | 'jest') || detectRenderFramework(spec);

        await generatePromptfooConfig(spec, {
          testDir: options.testDir,
          outputPath: configPath,
          framework,
          includeTraceLinks: true,
          providerPath,
        });

        await generateTestProvider(providerPath);

        spinner.succeed('Promptfoo config created');
        console.log(`   ${style.dim('├─')} Config: ${style.path(configPath)}`);
        console.log(`   ${style.dim('└─')} Provider: ${style.path(providerPath)}`);
        console.log('');
      } catch (error) {
        spinner.fail('Promptfoo config generation failed');
        console.error(formatError(error instanceof Error ? error.message : String(error)));
      }
    }

    // Final summary
    console.log(style.success(box.dHorizontal.repeat(55)));
    console.log(`  ${icons.sparkle} ${style.success(style.bold('Pipeline complete!'))}`);
    console.log(style.success(box.dHorizontal.repeat(55)));

    console.log(nextSteps([
      { command: 'evaluclaude view --last', description: 'View the latest trace' },
      { command: 'evaluclaude traces', description: 'List all traces' },
      ...(options.promptfoo ? [
        { command: 'evaluclaude ui', description: 'Launch the dashboard UI' },
        { command: `evaluclaude eval --spec ${specPath}`, description: 'Run Promptfoo evaluations' },
      ] : []),
    ]));
  });
