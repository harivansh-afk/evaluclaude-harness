import { Command } from 'commander';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve as resolvePath } from 'path';
import type { EvalSpec } from '../../analyzer/types.js';
import { generatePromptfooConfig, generateTestProvider } from '../../promptfoo/index.js';

const EVALUCLAUDE_DIR = '.evaluclaude';
const CONFIG_FILE = 'promptfooconfig.yaml';
const PROVIDERS_DIR = 'providers';

export const uiCommand = new Command('ui')
  .description('Launch the evaluation dashboard UI')
  .option('-p, --port <port>', 'Port to run the UI on', '3000')
  .option('-s, --spec <spec>', 'Path to EvalSpec JSON file')
  .option('--generate', 'Regenerate Promptfoo config from spec')
  .option('--no-open', 'Do not auto-open browser')
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const configPath = join(EVALUCLAUDE_DIR, CONFIG_FILE);
      const providerPath = join(EVALUCLAUDE_DIR, PROVIDERS_DIR, 'test-runner.py');

      // If spec provided with --generate, create/update Promptfoo config
      if (options.spec && options.generate) {
        console.log('\n📄 Generating Promptfoo configuration...');
        
        if (!existsSync(options.spec)) {
          console.error(`Error: Spec file not found: ${options.spec}`);
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

        console.log(`   Config: ${configPath}`);
        console.log(`   Provider: ${providerPath}`);
      }

      // Check for existing config, create default if missing
      if (!existsSync(configPath)) {
        console.log('\n⚠️  No Promptfoo config found.');
        console.log('   Creating default configuration...\n');
        
        await createDefaultConfig(configPath, providerPath);
        console.log(`   Created: ${configPath}`);
      }

      // Check for results to display
      const resultsDir = join(EVALUCLAUDE_DIR, 'results');
      const latestResults = join(resultsDir, 'latest.json');
      
      if (!existsSync(latestResults)) {
        console.log('\n⚠️  No evaluation results found.');
        console.log('   Run `evaluclaude run --export-promptfoo` first to generate results.\n');
        console.log('   Or run the full pipeline:');
        console.log('   evaluclaude pipeline <path> --promptfoo\n');
      }

      console.log(`\n🚀 Starting Promptfoo UI on port ${port}...`);
      console.log(`   Results: ${latestResults}\n`);

      // Use promptfoo view with the results file
      await launchPromptfooView(port, latestResults, options.open);
    } catch (error) {
      console.error('Error launching UI:', error instanceof Error ? error.message : error);
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
  .action(async (options) => {
    try {
      const configPath = options.config || join(EVALUCLAUDE_DIR, CONFIG_FILE);
      const providerPath = join(EVALUCLAUDE_DIR, PROVIDERS_DIR, 'test-runner.py');

      // Generate config from spec if provided
      if (options.spec) {
        console.log('\n📄 Generating Promptfoo configuration from spec...');
        
        if (!existsSync(options.spec)) {
          console.error(`Error: Spec file not found: ${options.spec}`);
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
        
        console.log(`   Config: ${configPath}`);
        console.log(`   Provider: ${providerPath}`);
        console.log(`   Scenarios: ${spec.scenarios.length}`);
      }

      if (!existsSync(configPath)) {
        console.error(`\nError: Config not found: ${configPath}`);
        console.log('Run with --spec <file> to generate from EvalSpec, or create config manually.');
        process.exit(1);
      }

      // Ensure output directory exists
      mkdirSync(options.output, { recursive: true });

      console.log('\n🧪 Running Promptfoo evaluations...');
      console.log(`   Config: ${configPath}`);
      console.log(`   Output: ${options.output}\n`);

      const outputFile = join(options.output, `eval-${Date.now()}.json`);

      const exitCode = await runPromptfooEval(configPath, outputFile, !options.cache);

      if (exitCode === 0) {
        console.log(`\n✅ Evaluation complete!`);
        console.log(`📁 Results: ${outputFile}`);
      } else {
        console.log(`\n⚠️  Evaluation finished with exit code ${exitCode}`);
        console.log(`📁 Results: ${outputFile}`);
      }

      // List traces generated during evaluation
      const tracesDir = join(EVALUCLAUDE_DIR, 'traces');
      if (existsSync(tracesDir)) {
        const { readdirSync } = await import('fs');
        const traces = readdirSync(tracesDir).filter(f => f.endsWith('.json'));
        if (traces.length > 0) {
          console.log(`\n📊 Traces generated: ${traces.length}`);
          console.log(`   View with: evaluclaude view --last`);
        }
      }

      if (options.view) {
        console.log(`\n🚀 Launching UI on port ${options.port}...`);
        await launchPromptfooUI(parseInt(options.port, 10), configPath, true);
      } else {
        console.log(`\n   View results: evaluclaude ui`);
      }
    } catch (error) {
      console.error('Error running eval:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Launch Promptfoo view to display pre-computed results.
 */
async function launchPromptfooView(
  port: number,
  resultsFile: string,
  openBrowser: boolean
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

    console.log(`   Running: npx ${args.join(' ')}\n`);

    const child = spawn('npx', args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error('\n❌ Promptfoo not found.');
        console.error('   Install with: npm install -g promptfoo');
        console.error('   Or run: npx promptfoo --version\n');
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
  openBrowser: boolean
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

    console.log(`   Running: npx ${args.join(' ')}\n`);

    const child = spawn('npx', args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error('\n❌ Promptfoo not found.');
        console.error('   Install with: npm install -g promptfoo');
        console.error('   Or run: npx promptfoo --version\n');
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
  noCache: boolean
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

    console.log(`   Running: npx ${args.join(' ')}\n`);

    const child = spawn('npx', args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error('\n❌ Promptfoo not found.');
        console.error('   Install with: npm install -g promptfoo\n');
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
