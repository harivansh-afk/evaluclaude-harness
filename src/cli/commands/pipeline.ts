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
  .description('Run the full eval generation pipeline: introspect → analyze → render → run')
  .argument('[path]', 'Path to the repository to analyze', '.')
  .option('-o, --output <dir>', 'Output directory for all artifacts', '.evaluclaude')
  .option('-i, --interactive', 'Enable interactive mode with clarifying questions')
  .option('--focus <modules>', 'Comma-separated list of modules/functions to focus on')
  .option('--max-scenarios <n>', 'Maximum number of test scenarios to generate', '10')
  .option('--test-dir <dir>', 'Directory for generated tests', './tests/generated')
  .option('-f, --framework <framework>', 'Test framework (pytest, vitest, jest)')
  .option('--skip-analyze', 'Skip analysis, use existing spec')
  .option('--skip-render', 'Skip rendering, use existing tests')
  .option('--skip-run', 'Skip test execution')
  .option('--promptfoo', 'Generate Promptfoo configuration for UI viewing')
  .option('--quiet', 'Suppress progress messages')
  .action(async (repoPath: string, options: PipelineOptions) => {
    const absolutePath = resolve(repoPath);
    const log = options.quiet ? () => {} : console.log;
    const outputDir = options.output || EVALUCLAUDE_DIR;

    console.log('\n🚀 Evaluclaude Pipeline');
    console.log('═'.repeat(50));
    console.log(`   Repository: ${absolutePath}`);
    console.log(`   Output: ${outputDir}`);
    console.log('═'.repeat(50) + '\n');

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
      log('📋 Using existing EvalSpec...');
      spec = JSON.parse(readFileSync(specPath, 'utf-8'));
      log(`   Loaded: ${specPath} (${spec.scenarios.length} scenarios)\n`);
    } else {
      log('🔬 Step 1: Introspecting codebase...');
      
      try {
        const repoSummary = await analyze({
          root: absolutePath,
          onProgress: options.quiet ? undefined : (msg) => log(`   ${msg}`),
        });

        log(`   Files: ${repoSummary.files.length}`);
        log(`   Languages: ${repoSummary.languages.join(', ')}`);
        log('');

        log('🤖 Step 2: Generating EvalSpec with Claude...\n');

        const focus = options.focus?.split(',').map(s => s.trim());
        const maxScenarios = parseInt(options.maxScenarios, 10);

        let result;
        if (options.interactive) {
          const { default: inquirer } = await import('inquirer');
          
          result = await generateEvalSpecInteractive(
            repoSummary,
            async (question: string) => {
              const { answer } = await inquirer.prompt([{
                type: 'input',
                name: 'answer',
                message: `🤖 Claude asks: ${question}`,
              }]);
              return answer;
            },
            { focus, maxScenarios }
          );
        } else {
          result = await generateEvalSpec(repoSummary, {
            interactive: false,
            focus,
            maxScenarios,
          });
        }

        spec = result.spec;

        // Save the spec
        writeFileSync(specPath, JSON.stringify(spec, null, 2));

        log(`\n✅ EvalSpec generated!`);
        log(`   Scenarios: ${spec.scenarios.length}`);
        log(`   Tokens: ${result.tokensUsed}`);
        log(`   Saved: ${specPath}\n`);
      } catch (error) {
        console.error('\n❌ Analysis failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }

    // Step 2: Render tests
    if (!options.skipRender) {
      log('📝 Step 3: Rendering test files...');

      try {
        const framework = (options.framework as 'pytest' | 'vitest' | 'jest') || detectRenderFramework(spec);
        
        const renderResult = await renderSpec(spec, {
          outputDir: options.testDir,
          framework,
          includeFixtures: true,
          generateMocks: true,
          dryRun: false,
        });

        log(`   Framework: ${framework}`);
        log(`   Files: ${renderResult.stats.fileCount}`);
        log(`   Scenarios: ${renderResult.stats.scenarioCount}`);
        log(`   Assertions: ${renderResult.stats.assertionCount}`);
        log(`   Output: ${options.testDir}\n`);
      } catch (error) {
        console.error('\n❌ Rendering failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }

    // Step 3: Run tests
    if (!options.skipRun) {
      log('🧪 Step 4: Running tests...\n');

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

        log(formatResults(result));
        log(`📊 Trace saved: ${tracePath}`);
        log(`   View with: evaluclaude view ${trace.id}\n`);

        // Save results
        const resultsPath = join(resultsDir, `run-${Date.now()}.json`);
        writeFileSync(resultsPath, JSON.stringify(result, null, 2));

      } catch (error) {
        console.error('\n❌ Test execution failed:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }

    // Step 4: Generate Promptfoo config
    if (options.promptfoo) {
      log('📦 Step 5: Generating Promptfoo configuration...');

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

        log(`   Config: ${configPath}`);
        log(`   Provider: ${providerPath}`);
        log(`\n   Launch UI with: evaluclaude ui\n`);
      } catch (error) {
        console.error('\n❌ Promptfoo config generation failed:', error instanceof Error ? error.message : error);
      }
    }

    console.log('═'.repeat(50));
    console.log('✅ Pipeline complete!');
    console.log('═'.repeat(50));
    console.log(`\nNext steps:`);
    console.log(`   View traces:     evaluclaude view --last`);
    console.log(`   List all traces: evaluclaude traces`);
    if (options.promptfoo) {
      console.log(`   Launch UI:       evaluclaude ui`);
      console.log(`   Run Promptfoo:   evaluclaude eval --spec ${specPath}`);
    }
    console.log('');
  });
