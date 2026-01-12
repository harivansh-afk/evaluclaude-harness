import { Command } from 'commander';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve as resolvePath } from 'path';
import type { EvalSpec } from '../../analyzer/types.js';
import { generatePromptfooConfig, generateTestProvider } from '../../promptfoo/index.js';
import { style, icons, Spinner, formatError, nextSteps, header, keyValue } from '../theme.js';

const EVALUCLAUDE_DIR = '.evaluclaude';
const CONFIG_FILE = 'promptfooconfig.yaml';
const PROVIDERS_DIR = 'providers';

export const uiCommand = new Command('ui')
  .description('Launch the evaluation dashboard UI')
  .option('-p, --port <port>', 'Port to run the UI on', '3000')
  .option('-s, --spec <spec>', 'Path to EvalSpec JSON file')
  .option('--generate', 'Regenerate Promptfoo config from spec')
  .option('--no-open', 'Do not auto-open browser')
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude ui')}                    Launch UI with existing results
  ${style.command('evaluclaude ui -p 8080')}            Use custom port
  ${style.command('evaluclaude ui -s spec.json --generate')}  Generate config and launch

${style.bold('Workflow:')}
  1. Run ${style.command('evaluclaude run --export-promptfoo')} to generate results
  2. Run ${style.command('evaluclaude ui')} to view them in the dashboard
`)
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const configPath = join(EVALUCLAUDE_DIR, CONFIG_FILE);
      const providerPath = join(EVALUCLAUDE_DIR, PROVIDERS_DIR, 'test-runner.py');

      // If spec provided with --generate, create/update Promptfoo config
      if (options.spec && options.generate) {
        const spinner = new Spinner('Generating Promptfoo configuration...');
        spinner.start();
        
        if (!existsSync(options.spec)) {
          spinner.fail('Spec file not found');
          console.log(formatError(`Spec file not found: ${style.path(options.spec)}`, [
            `Check the file path and try again`,
            `Generate a spec with: ${style.command('evaluclaude analyze <path>')}`,
          ]));
          process.exit(1);
        }

        const spec: EvalSpec = JSON.parse(readFileSync(options.spec, 'utf-8'));
        
        await generatePromptfooConfig(spec, {
          testDir: './tests/generated',
          outputPath: configPath,
          framework: detectFramework(spec),
          includeTraceLinks: true,
          providerPath: providerPath,
        });

        await generateTestProvider(providerPath);

        spinner.succeed('Promptfoo configuration generated');
        console.log(keyValue('Config', style.path(configPath), 1));
        console.log(keyValue('Provider', style.path(providerPath), 1));
      }

      // Check for existing config, create default if missing
      if (!existsSync(configPath)) {
        console.log(`\n${style.warning(icons.warning)} No Promptfoo config found.`);
        
        const spinner = new Spinner('Creating default configuration...');
        spinner.start();
        await createDefaultConfig(configPath, providerPath);
        spinner.succeed('Default configuration created');
        console.log(keyValue('Created', style.path(configPath), 1));
      }

      // Check for results to display
      const resultsDir = join(EVALUCLAUDE_DIR, 'results');
      const latestResults = join(resultsDir, 'latest.json');
      
      if (!existsSync(latestResults)) {
        console.log(formatError('No evaluation results found.', [
          `Run ${style.command('evaluclaude run --export-promptfoo')} first to generate results`,
          `Or run the full pipeline: ${style.command('evaluclaude pipeline <path> --promptfoo')}`,
        ]));
      }

      console.log(header('Launching Promptfoo UI'));
      console.log(keyValue('Port', style.number(String(port)), 1));
      console.log(keyValue('Results', style.path(latestResults), 1));
      console.log('');

      const spinner = new Spinner(`${icons.rocket} Starting Promptfoo UI...`);
      spinner.start();

      // Use promptfoo view with the results file
      await launchPromptfooView(port, latestResults, options.open, spinner);
    } catch (error) {
      console.log(formatError(
        error instanceof Error ? error.message : String(error),
        ['Check the console output for more details']
      ));
      process.exit(1);
    }
  });

export const evalCommand = new Command('eval')
  .description('Run evaluations with Promptfoo and optionally launch UI')
  .option('-s, --spec <spec>', 'Path to EvalSpec JSON file')
  .option('-c, --config <config>', 'Path to promptfooconfig.yaml')
  .option('-o, --output <output>', 'Output path for results', '.evaluclaude/results')
  .option('--view', 'Launch UI after evaluation', false)
  .option('-p, --port <port>', 'Port for UI', '3000')
  .option('--no-cache', 'Disable Promptfoo caching', false)
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude eval -s spec.json')}      Run evals from spec
  ${style.command('evaluclaude eval -c config.yaml')}    Run with custom config
  ${style.command('evaluclaude eval -s spec.json --view')}  Run and launch UI

${style.bold('Workflow:')}
  1. Generate spec: ${style.command('evaluclaude analyze <path> -o spec.json')}
  2. Run evals: ${style.command('evaluclaude eval -s spec.json')}
  3. View results: ${style.command('evaluclaude ui')}
`)
  .action(async (options) => {
    try {
      const configPath = options.config || join(EVALUCLAUDE_DIR, CONFIG_FILE);
      const providerPath = join(EVALUCLAUDE_DIR, PROVIDERS_DIR, 'test-runner.py');

      // Generate config from spec if provided
      if (options.spec) {
        const spinner = new Spinner('Generating Promptfoo configuration from spec...');
        spinner.start();
        
        if (!existsSync(options.spec)) {
          spinner.fail('Spec file not found');
          console.log(formatError(`Spec file not found: ${style.path(options.spec)}`, [
            `Check the file path and try again`,
            `Generate a spec with: ${style.command('evaluclaude analyze <path>')}`,
          ]));
          process.exit(1);
        }

        const spec: EvalSpec = JSON.parse(readFileSync(options.spec, 'utf-8'));
        
        await generatePromptfooConfig(spec, {
          testDir: './tests/generated',
          outputPath: configPath,
          framework: detectFramework(spec),
          includeTraceLinks: true,
          providerPath: providerPath,
        });

        await generateTestProvider(providerPath);
        
        spinner.succeed('Promptfoo configuration generated');
        console.log(keyValue('Config', style.path(configPath), 1));
        console.log(keyValue('Provider', style.path(providerPath), 1));
        console.log(keyValue('Scenarios', style.number(String(spec.scenarios.length)), 1));
      }

      if (!existsSync(configPath)) {
        console.log(formatError(`Config not found: ${style.path(configPath)}`, [
          `Run with ${style.command('--spec <file>')} to generate from EvalSpec`,
          `Or create a config manually`,
        ]));
        process.exit(1);
      }

      // Ensure output directory exists
      mkdirSync(options.output, { recursive: true });

      console.log(header('Running Promptfoo Evaluations'));
      console.log(keyValue('Config', style.path(configPath), 1));
      console.log(keyValue('Output', style.path(options.output), 1));
      console.log('');

      const outputFile = join(options.output, `eval-${Date.now()}.json`);

      const spinner = new Spinner(`${icons.test} Running evaluations...`);
      spinner.start();

      const exitCode = await runPromptfooEval(configPath, outputFile, !options.cache, spinner);

      if (exitCode === 0) {
        spinner.succeed('Evaluation complete!');
        console.log(keyValue('Results', style.path(outputFile), 1));
      } else {
        spinner.warn(`Evaluation finished with exit code ${exitCode}`);
        console.log(keyValue('Results', style.path(outputFile), 1));
      }

      // List traces generated during evaluation
      const tracesDir = join(EVALUCLAUDE_DIR, 'traces');
      if (existsSync(tracesDir)) {
        const { readdirSync } = await import('fs');
        const traces = readdirSync(tracesDir).filter(f => f.endsWith('.json'));
        if (traces.length > 0) {
          console.log(`\n${icons.trace} ${style.bold('Traces generated:')} ${style.number(String(traces.length))}`);
          console.log(style.dim(`   View with: ${style.command('evaluclaude view --last')}`));
        }
      }

      if (options.view) {
        console.log('');
        const uiSpinner = new Spinner(`${icons.rocket} Launching UI on port ${options.port}...`);
        uiSpinner.start();
        await launchPromptfooUI(parseInt(options.port, 10), configPath, true, uiSpinner);
      } else {
        console.log(nextSteps([
          { command: 'evaluclaude ui', description: 'View results in dashboard' },
          { command: 'evaluclaude view --last', description: 'View latest trace' },
        ]));
      }
    } catch (error) {
      console.log(formatError(
        error instanceof Error ? error.message : String(error),
        ['Check the console output for more details']
      ));
      process.exit(1);
    }
  });

/**
 * Launch Promptfoo view to display pre-computed results.
 */
async function launchPromptfooView(
  port: number,
  resultsFile: string,
  openBrowser: boolean,
  spinner?: Spinner
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use 'promptfoo view' which opens the web UI showing results from the output directory
    const resultsDir = dirname(resolvePath(resultsFile));
    const args = ['promptfoo', 'view', '--port', String(port)];
    
    if (openBrowser) {
      args.push('-y');
    } else {
      args.push('-n');
    }

    // Pass the directory containing results
    args.push(resultsDir);

    if (spinner) {
      spinner.succeed(`Promptfoo UI starting on port ${style.number(String(port))}`);
    }
    console.log(style.dim(`   Running: npx ${args.join(' ')}`));
    console.log('');

    const child = spawn('npx', args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(formatError('Promptfoo not found.', [
          `Install with: ${style.command('npm install -g promptfoo')}`,
          `Or run: ${style.command('npx promptfoo --version')}`,
        ]));
      } else {
        reject(error);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Promptfoo exited with code ${code}`));
      }
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      child.kill('SIGINT');
      process.exit(0);
    });
  });
}

/**
 * Launch Promptfoo with a config file (for running evals).
 */
async function launchPromptfooUI(
  port: number, 
  configPath: string, 
  openBrowser: boolean,
  spinner?: Spinner
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['promptfoo', 'view', '--port', String(port)];
    
    if (openBrowser) {
      args.push('-y');
    } else {
      args.push('-n');
    }

    // Pass the directory containing the config
    const configDir = dirname(resolvePath(configPath));
    args.push(configDir);

    if (spinner) {
      spinner.succeed(`Promptfoo UI starting on port ${style.number(String(port))}`);
    }
    console.log(style.dim(`   Running: npx ${args.join(' ')}`));
    console.log('');

    const child = spawn('npx', args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(formatError('Promptfoo not found.', [
          `Install with: ${style.command('npm install -g promptfoo')}`,
          `Or run: ${style.command('npx promptfoo --version')}`,
        ]));
      } else {
        reject(error);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Promptfoo exited with code ${code}`));
      }
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      child.kill('SIGINT');
      process.exit(0);
    });
  });
}

async function runPromptfooEval(
  configPath: string, 
  outputFile: string,
  noCache: boolean,
  spinner?: Spinner
): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      'promptfoo', 
      'eval', 
      '-c', configPath,
      '-o', outputFile,
    ];

    if (noCache) {
      args.push('--no-cache');
    }

    if (spinner) {
      spinner.stop();
    }
    console.log(style.dim(`   Running: npx ${args.join(' ')}`));
    console.log('');

    const child = spawn('npx', args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(formatError('Promptfoo not found.', [
          `Install with: ${style.command('npm install -g promptfoo')}`,
        ]));
        reject(error);
      } else {
        reject(error);
      }
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

async function createDefaultConfig(configPath: string, providerPath: string): Promise<void> {
  const defaultConfig = `# Evaluclaude Promptfoo Configuration
# Generated by evaluclaude
# 
# To populate this config from an EvalSpec:
#   evaluclaude eval --spec <evalspec.json>
#
# Or run the full pipeline:
#   evaluclaude analyze <path> -o spec.json
#   evaluclaude render spec.json -o tests/generated
#   evaluclaude eval --spec spec.json

description: "Evaluclaude functional test evaluations"

providers:
  - id: file://${providerPath}
    label: functional-tests
    config:
      test_dir: ./tests/generated
      framework: pytest
      timeout: 300
      sandbox: true

prompts:
  - "{{scenario_id}}"

tests:
  - description: "Example test - replace with real scenarios"
    vars:
      scenario_id: "test_example"
    assert:
      - type: python
        value: |
          import json
          result = json.loads(output)
          result.get('passed', 0) > 0

# Default test configuration
defaultTest:
  metadata:
    evaluclaude: true
    tracesDir: .evaluclaude/traces

outputPath: .evaluclaude/results/promptfoo-results.json
`;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, defaultConfig);

  // Also generate the provider
  await generateTestProvider(providerPath);
}

function detectFramework(spec: EvalSpec): 'pytest' | 'vitest' | 'jest' {
  if (spec.repo.languages.includes('python')) {
    return 'pytest';
  }
  if (spec.repo.languages.includes('typescript') || spec.repo.languages.includes('javascript')) {
    return 'vitest';
  }
  return 'vitest';
}
