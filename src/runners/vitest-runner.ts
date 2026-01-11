import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { Runner, RunnerConfig, ExecutionResult, TestResult, ExecutionSummary } from './types.js';
import { sandboxedExec } from './sandbox.js';

interface VitestJsonReport {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numSkippedTests: number;
  startTime: number;
  endTime: number;
  testResults: VitestTestFile[];
}

interface VitestTestFile {
  name: string;
  status: 'passed' | 'failed';
  startTime: number;
  endTime: number;
  assertionResults: VitestAssertion[];
}

interface VitestAssertion {
  ancestorTitles: string[];
  fullName: string;
  status: 'passed' | 'failed' | 'skipped';
  title: string;
  duration: number;
  failureMessages: string[];
}

export class VitestRunner implements Runner {
  name = 'vitest' as const;

  async run(config: RunnerConfig): Promise<ExecutionResult> {
    const { testDir, outputFile, options, sandboxConfig } = config;
    
    const reportFile = join(testDir, '.vitest_report.json');
    
    const args = [
      'vitest',
      'run',
      '--reporter=json',
      `--outputFile=${reportFile}`,
    ];

    if (options.filter && options.filter.length > 0) {
      args.push('--testNamePattern', options.filter.join('|'));
    }

    args.push(testDir);

    const result = await sandboxedExec('npx', args, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout,
      env: options.env,
      sandboxConfig: sandboxConfig,
    });

    let report: VitestJsonReport | undefined;
    if (existsSync(reportFile)) {
      try {
        const content = await readFile(reportFile, 'utf-8');
        report = JSON.parse(content);
      } catch (e) {
      }
    }

    const executionResult = this.parseResults(result.stdout + result.stderr, report);

    if (result.timedOut) {
      executionResult.errors.push(`Test execution timed out after ${options.timeout}ms`);
    }

    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, JSON.stringify(executionResult, null, 2));
    }

    return executionResult;
  }

  parseResults(rawOutput: string, jsonReport?: unknown): ExecutionResult {
    const report = jsonReport as VitestJsonReport | undefined;

    if (!report) {
      return this.parseFromStdout(rawOutput);
    }

    const summary: ExecutionSummary = {
      total: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      skipped: report.numSkippedTests,
      duration: report.endTime - report.startTime,
    };

    const tests: TestResult[] = [];
    
    for (const file of report.testResults) {
      for (const assertion of file.assertionResults) {
        tests.push({
          id: this.extractScenarioId(assertion.fullName),
          name: assertion.fullName,
          status: assertion.status === 'skipped' ? 'skipped' : assertion.status,
          duration: assertion.duration,
          assertions: {
            passed: assertion.status === 'passed' ? 1 : 0,
            failed: assertion.status === 'failed' ? 1 : 0,
            details: [],
          },
          error: assertion.failureMessages.length > 0
            ? { message: assertion.failureMessages.join('\n') }
            : undefined,
        });
      }
    }

    return {
      summary,
      tests,
      errors: [],
    };
  }

  private parseFromStdout(stdout: string): ExecutionResult {
    const passMatch = stdout.match(/(\d+) passed/);
    const failMatch = stdout.match(/(\d+) failed/);
    const skipMatch = stdout.match(/(\d+) skipped/);

    const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
    const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;

    return {
      summary: {
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
        duration: 0,
      },
      tests: [],
      errors: [],
    };
  }

  private extractScenarioId(fullName: string): string {
    const match = fullName.match(/test[_\s]([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : fullName.replace(/\s+/g, '_');
  }
}

export class JestRunner implements Runner {
  name = 'jest' as const;

  async run(config: RunnerConfig): Promise<ExecutionResult> {
    const { testDir, outputFile, options, sandboxConfig } = config;
    
    const reportFile = join(testDir, '.jest_report.json');
    
    const args = [
      'jest',
      '--json',
      `--outputFile=${reportFile}`,
    ];

    if (options.filter && options.filter.length > 0) {
      args.push('--testNamePattern', options.filter.join('|'));
    }

    args.push(testDir);

    const result = await sandboxedExec('npx', args, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout,
      env: options.env,
      sandboxConfig: sandboxConfig,
    });

    let report: VitestJsonReport | undefined;
    if (existsSync(reportFile)) {
      try {
        const content = await readFile(reportFile, 'utf-8');
        report = JSON.parse(content);
      } catch (e) {
      }
    }

    const executionResult = this.parseResults(result.stdout + result.stderr, report);

    if (result.timedOut) {
      executionResult.errors.push(`Test execution timed out after ${options.timeout}ms`);
    }

    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, JSON.stringify(executionResult, null, 2));
    }

    return executionResult;
  }

  parseResults(rawOutput: string, jsonReport?: unknown): ExecutionResult {
    const vitestRunner = new VitestRunner();
    return vitestRunner.parseResults(rawOutput, jsonReport);
  }
}
