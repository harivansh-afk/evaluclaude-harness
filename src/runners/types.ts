export type TestFramework = 'pytest' | 'vitest' | 'jest';

export interface ExecutionOptions {
  framework: TestFramework;
  sandbox: boolean;
  timeout: number;
  parallel: boolean;
  filter?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecutionResult {
  summary: ExecutionSummary;
  tests: TestResult[];
  errors: string[];
  traceId?: string;
}

export interface ExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export interface TestResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  assertions: {
    passed: number;
    failed: number;
    details: AssertionResult[];
  };
  error?: { message: string; stack?: string };
  stdout?: string;
  stderr?: string;
}

export interface AssertionResult {
  description: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
}

export interface SandboxConfig {
  enabled: boolean;
  autoAllowBashIfSandboxed: boolean;
  network: {
    allowLocalBinding: boolean;
    allowOutbound: boolean;
  };
  filesystem: {
    readOnly: string[];
    writable: string[];
  };
  env: {
    inherit: string[];
    set: Record<string, string>;
  };
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: true,
  autoAllowBashIfSandboxed: true,
  network: {
    allowLocalBinding: true,
    allowOutbound: false,
  },
  filesystem: {
    readOnly: ['/'],
    writable: ['/tmp', './test-output'],
  },
  env: {
    inherit: ['PATH', 'HOME', 'USER'],
    set: { CI: 'true', NODE_ENV: 'test' },
  },
};

export interface RunnerConfig {
  testDir: string;
  outputFile: string;
  options: ExecutionOptions;
  sandboxConfig?: SandboxConfig;
}

export interface Runner {
  name: TestFramework;
  run(config: RunnerConfig): Promise<ExecutionResult>;
  parseResults(rawOutput: string, jsonReport?: unknown): ExecutionResult;
}
