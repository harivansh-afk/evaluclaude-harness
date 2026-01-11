import { Command } from 'commander';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
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
        });

        await generateTestProvider(providerPath);

        console.log(`   Config: ${configPath}`);
        console.log(`   Provider: ${providerPath}`);
      }

      if (!existsSync(configPath)) {
        console.log('\n⚠️  No Promptfoo config found.');
        console.log('   Run with --spec <file> --generate to create one.\n');
        console.log('   Or create one manually:');
        console.log(`   ${configPath}\n`);
        
        await createDefaultConfig(configPath, providerPath);
        console.log(`   Created default config at ${configPath}`);
      }

      console.log(`\n🚀 Starting Promptfoo UI on port ${port}...`);
      console.log(`   Config: ${configPath}\n`);

      await launchPromptfooUI(port, configPath, options.open);
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
  .action(async (options) => {
    try {
      const configPath = options.config || join(EVALUCLAUDE_DIR, CONFIG_FILE);

      if (options.spec) {
        console.log('\n📄 Generating Promptfoo configuration from spec...');
        const spec: EvalSpec = JSON.parse(readFileSync(options.spec, 'utf-8'));
        
        await generatePromptfooConfig(spec, {
          testDir: './tests/generated',
          outputPath: configPath,
          framework: detectFramework(spec),
          includeTraceLinks: true,
        });

        const providerPath = join(EVALUCLAUDE_DIR, PROVIDERS_DIR, 'test-runner.py');
        await generateTestProvider(providerPath);
      }

      if (!existsSync(configPath)) {
        console.error(`Error: Config not found: ${configPath}`);
        console.log('Run with --spec <file> to generate from EvalSpec.');
        process.exit(1);
      }

      console.log('\n🧪 Running Promptfoo evaluations...\n');

      const outputFile = join(options.output, `eval-${Date.now()}.json`);
      mkdirSync(dirname(outputFile), { recursive: true });

      await runPromptfooEval(configPath, outputFile);

      console.log(`\n📁 Results saved: ${outputFile}`);

      if (options.view) {
        console.log(`\n🚀 Launching UI on port ${options.port}...`);
        await launchPromptfooUI(parseInt(options.port, 10), configPath, true);
      }
    } catch (error) {
      console.error('Error running eval:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

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

    const configDir = dirname(configPath);
    args.push(configDir);

    console.log(`   Running: npx ${args.join(' ')}\n`);

    const child = spawn('npx', args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error('\n❌ Promptfoo not found. Install with: npm install -g promptfoo');
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

    process.on('SIGINT', () => {
      child.kill('SIGINT');
      process.exit(0);
    });
  });
}

async function runPromptfooEval(configPath: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      'promptfoo', 
      'eval', 
      '-c', configPath,
      '-o', outputFile,
      '--no-cache',
    ];

    console.log(`   Running: npx ${args.join(' ')}\n`);

    const child = spawn('npx', args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Promptfoo eval exited with code ${code}`));
      }
    });
  });
}

async function createDefaultConfig(configPath: string, providerPath: string): Promise<void> {
  const defaultConfig = `# Evaluclaude Promptfoo Configuration
# Generated by evaluclaude

description: "Evaluclaude functional test evaluations"

providers:
  - id: file://${providerPath}
    label: functional-tests
    config:
      test_dir: ./tests/generated
      framework: pytest
      timeout: 300

prompts:
  - "{{scenario_id}}"

tests:
  - description: "Example test"
    vars:
      scenario_id: "test_example"
    assert:
      - type: python
        value: |
          import json
          result = json.loads(output)
          result.get('passed', 0) > 0

outputPath: .evaluclaude/results/promptfoo-results.json
`;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, defaultConfig);

  await generateTestProvider(providerPath);
}

function detectFramework(spec: EvalSpec): 'pytest' | 'vitest' | 'jest' {
  if (spec.repo.languages.includes('python')) {
    return 'pytest';
  }
  return 'vitest';
}
