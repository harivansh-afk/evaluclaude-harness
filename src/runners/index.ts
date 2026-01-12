import type { Runner, TestFramework, RunnerConfig, ExecutionResult, ExecutionOptions, SandboxConfig } from './types.js';
import { PytestRunner } from './pytest-runner.js';
import { VitestRunner, JestRunner } from './vitest-runner.js';
import { DEFAULT_SANDBOX_CONFIG } from './types.js';

export * from './types.js';
export { PytestRunner } from './pytest-runner.js';
export { VitestRunner, JestRunner } from './vitest-runner.js';
export { sandboxedExec } from './sandbox.js';

const runnerRegistry: Record<TestFramework, new () => Runner> = {
  pytest: PytestRunner,
  vitest: VitestRunner,
  jest: JestRunner,
};

export function createRunner(framework: TestFramework): Runner {
  const RunnerClass = runnerRegistry[framework];
  if (!RunnerClass) {
    throw new Error(`Unknown test framework: ${framework}`);
  }
  return new RunnerClass();
}

export async function runTests(
  testDir: string,
  options: ExecutionOptions,
  sandboxConfig: SandboxConfig = DEFAULT_SANDBOX_CONFIG
): Promise<ExecutionResult> {
  const runner = createRunner(options.framework);
  
  const config: RunnerConfig = {
    testDir,
    outputFile: `.evaluclaude/results/${options.framework}-${Date.now()}.json`,
    options,
    sandboxConfig: options.sandbox ? sandboxConfig : undefined,
  };

  return runner.run(config);
}

export function detectTestFramework(testDir: string): TestFramework {
  const fs = require('fs');
  const path = require('path');

  const pythonFiles = fs.readdirSync(testDir).filter((f: string) => f.endsWith('.py'));
  const tsFiles = fs.readdirSync(testDir).filter((f: string) => f.endsWith('.ts') || f.endsWith('.js'));

  if (pythonFiles.length > tsFiles.length) {
    return 'pytest';
  }

  const packageJsonPath = path.join(testDir, '..', 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
        return 'jest';
      }
    } catch (e) {
    }
  }

  return 'vitest';
}

export function formatResults(result: ExecutionResult): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('📊 Test Execution Results');
  lines.push('═'.repeat(40));
  lines.push(`   Total:   ${result.summary.total}`);
  lines.push(`   ✅ Passed:  ${result.summary.passed}`);
  lines.push(`   ❌ Failed:  ${result.summary.failed}`);
  lines.push(`   ⏭️  Skipped: ${result.summary.skipped ?? 0}`);
  lines.push(`   ⏱️  Duration: ${result.summary.duration || 0}ms`);
  
  if (result.errors.length > 0) {
    lines.push('');
    lines.push('⚠️  Errors:');
    for (const error of result.errors) {
      lines.push(`   • ${error}`);
    }
  }

  const failures = result.tests.filter(t => t.status === 'failed' || t.status === 'error');
  if (failures.length > 0) {
    lines.push('');
    lines.push('❌ Failed Tests:');
    for (const test of failures) {
      lines.push(`   • ${test.name}`);
      if (test.error) {
        lines.push(`     ${test.error.message}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
