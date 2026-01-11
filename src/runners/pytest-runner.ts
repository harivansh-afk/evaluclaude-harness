import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { Runner, RunnerConfig, ExecutionResult, TestResult, ExecutionSummary } from './types.js';
import { sandboxedExec } from './sandbox.js';

interface PytestJsonReport {
  created: number;
  duration: number;
  exitcode: number;
  root: string;
  environment: Record<string, string>;
  summary: {
    passed: number;
    failed: number;
    error: number;
    skipped: number;
    total: number;
    collected: number;
  };
  tests: PytestTestResult[];
}

interface PytestTestResult {
  nodeid: string;
  outcome: 'passed' | 'failed' | 'skipped' | 'error';
  keywords: string[];
  setup?: { duration: number; outcome: string };
  call?: { 
    duration: number; 
    outcome: string;
    crash?: { message: string; path: string; lineno: number };
    traceback?: Array<{ path: string; lineno: number; message: string }>;
    longrepr?: string;
  };
  teardown?: { duration: number; outcome: string };
}

export class PytestRunner implements Runner {
  name = 'pytest' as const;

  async run(config: RunnerConfig): Promise<ExecutionResult> {
    const { testDir, outputFile, options, sandboxConfig } = config;
    
    const reportFile = join(testDir, '.pytest_report.json');
    
    const args = [
      '-v',
      '--tb=short',
      '--json-report',
      `--json-report-file=${reportFile}`,
    ];

    if (options.parallel) {
      args.push('-n', 'auto');
    }

    if (options.filter && options.filter.length > 0) {
      args.push('-k', options.filter.join(' or '));
    }

    args.push(testDir);

    const result = await sandboxedExec('python', ['-m', 'pytest', ...args], {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout,
      env: options.env,
      sandboxConfig: sandboxConfig,
    });

    let report: PytestJsonReport | undefined;
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
    const report = jsonReport as PytestJsonReport | undefined;

    if (!report) {
      return this.parseFromStdout(rawOutput);
    }

    const summary: ExecutionSummary = {
      total: report.summary.total,
      passed: report.summary.passed,
      failed: report.summary.failed,
      skipped: report.summary.skipped,
      duration: report.duration * 1000,
    };

    const tests: TestResult[] = report.tests.map((t) => ({
      id: this.extractScenarioId(t.nodeid),
      name: t.nodeid,
      status: t.outcome === 'error' ? 'error' : t.outcome,
      duration: (t.call?.duration || 0) * 1000,
      assertions: {
        passed: t.outcome === 'passed' ? 1 : 0,
        failed: t.outcome === 'failed' ? 1 : 0,
        details: [],
      },
      error: t.call?.crash
        ? { message: t.call.crash.message, stack: t.call.longrepr }
        : undefined,
    }));

    return {
      summary,
      tests,
      errors: report.summary.error > 0 ? [`${report.summary.error} tests had errors`] : [],
    };
  }

  private parseFromStdout(stdout: string): ExecutionResult {
    const lines = stdout.split('\n');
    const summaryMatch = stdout.match(/(\d+) passed|(\d+) failed|(\d+) skipped|(\d+) error/g);
    
    let passed = 0, failed = 0, skipped = 0;
    
    if (summaryMatch) {
      for (const match of summaryMatch) {
        const [num, type] = match.split(' ');
        const count = parseInt(num, 10);
        if (type === 'passed') passed = count;
        if (type === 'failed') failed = count;
        if (type === 'skipped') skipped = count;
      }
    }

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

  private extractScenarioId(nodeid: string): string {
    const match = nodeid.match(/test_([a-zA-Z0-9_-]+)/);
    return match ? match[1] : nodeid;
  }
}
