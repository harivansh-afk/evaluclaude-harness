import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import type { SandboxConfig, DEFAULT_SANDBOX_CONFIG } from './types.js';

export interface SandboxedExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export async function sandboxedExec(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeout: number;
    env?: Record<string, string>;
    sandboxConfig?: SandboxConfig;
  }
): Promise<SandboxedExecResult> {
  const { cwd, timeout, env = {}, sandboxConfig } = options;

  const spawnEnv: Record<string, string> = {};
  
  if (sandboxConfig?.enabled) {
    for (const key of sandboxConfig.env.inherit) {
      if (process.env[key]) {
        spawnEnv[key] = process.env[key]!;
      }
    }
    Object.assign(spawnEnv, sandboxConfig.env.set);
  } else {
    Object.assign(spawnEnv, process.env);
  }
  
  Object.assign(spawnEnv, env);

  const spawnOptions: SpawnOptions = {
    cwd,
    env: spawnEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child: ChildProcess = spawn(command, args, spawnOptions);
    
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000);
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        timedOut,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + '\n' + err.message,
        timedOut: false,
      });
    });
  });
}

export function buildSandboxCommand(
  command: string,
  args: string[],
  config: SandboxConfig
): { command: string; args: string[] } {
  if (!config.enabled) {
    return { command, args };
  }

  if (process.platform === 'darwin') {
    const sandboxArgs: string[] = [];
    
    if (!config.network.allowOutbound) {
      sandboxArgs.push('--deny-network-outbound');
    }
    
    return {
      command: 'sandbox-exec',
      args: ['-p', buildSandboxProfile(config), command, ...args],
    };
  }

  return { command, args };
}

function buildSandboxProfile(config: SandboxConfig): string {
  const rules: string[] = ['(version 1)', '(allow default)'];

  if (!config.network.allowOutbound) {
    rules.push('(deny network-outbound (remote ip "*:*"))');
  }

  for (const path of config.filesystem.readOnly) {
    if (path !== '/') {
      rules.push(`(deny file-write* (subpath "${path}"))`);
    }
  }

  return rules.join('\n');
}
