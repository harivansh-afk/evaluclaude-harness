import { writeFile, mkdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import * as yaml from 'js-yaml';
import type { EvalSpec, EvalScenario } from '../analyzer/types.js';
import type { PromptfooConfig, PromptfooTest, PromptfooAssertion } from './types.js';

export interface ConfigOptions {
  testDir: string;
  outputPath: string;
  framework: 'pytest' | 'vitest' | 'jest';
  includeTraceLinks: boolean;
  providerPath?: string;
}

export async function generatePromptfooConfig(
  spec: EvalSpec,
  options: ConfigOptions
): Promise<string> {
  const config = buildConfig(spec, options);
  const yamlContent = yaml.dump(config, { 
    lineWidth: 120,
    quotingType: '"',
  });

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, yamlContent);

  return yamlContent;
}

function buildConfig(spec: EvalSpec, options: ConfigOptions): PromptfooConfig {
  const tests = spec.scenarios.map(scenario => buildTest(scenario, options));
  
  // Provider path should be relative to the config file location
  // Since config is at .evaluclaude/promptfooconfig.yaml, the provider is at ./providers/test-runner.py
  const providerRelativePath = options.providerPath 
    ? options.providerPath.replace('.evaluclaude/', './').replace(/^\.evaluclaude\//, './')
    : './providers/test-runner.py';

  return {
    description: `Evaluclaude functional tests for ${spec.repo.name}`,
    providers: [
      {
        id: `file://${providerRelativePath}`,
        label: 'functional-tests',
        config: {
          test_dir: resolve(options.testDir),
          framework: options.framework,
          timeout: 300,
          sandbox: true,
        },
      },
    ],
    prompts: ['{{scenario_id}}'],
    tests,
    defaultTest: options.includeTraceLinks
      ? {
          metadata: {
            evaluclaude: true,
            tracesDir: './traces',
          },
        }
      : undefined,
    outputPath: './results/promptfoo-results.json',
  };
}

function buildTest(scenario: EvalScenario, options: ConfigOptions): PromptfooTest {
  const assertions = scenario.assertions
    .filter(a => a.type !== 'llm-rubric')
    .map(a => buildAssertion(a));

  const llmRubrics = scenario.assertions
    .filter(a => a.type === 'llm-rubric')
    .map(a => ({
      type: 'llm-rubric' as const,
      value: (a as any).rubric,
      threshold: (a as any).passingThreshold ?? 0.7,
    }));

  return {
    description: scenario.description,
    vars: {
      scenario_id: scenario.id,
      target_module: scenario.target.module,
      target_function: scenario.target.function,
      input_args: scenario.input.args,
      input_kwargs: scenario.input.kwargs,
    },
    assert: [...assertions, ...llmRubrics],
    metadata: {
      category: scenario.category,
      priority: scenario.priority,
      tags: scenario.tags,
    },
  };
}

function buildAssertion(assertion: any): PromptfooAssertion {
  switch (assertion.type) {
    case 'equals':
      return {
        type: 'equals',
        value: assertion.expected,
      };

    case 'contains':
      return {
        type: 'contains',
        value: assertion.value,
      };

    case 'matches':
      return {
        type: 'regex',
        value: assertion.pattern,
      };

    case 'typeof':
      return {
        type: 'python',
        value: `type(output).__name__ == '${assertion.expected}'`,
      };

    case 'throws':
      return {
        type: 'python',
        value: `'${assertion.errorType || 'Error'}' in str(output.get('error', ''))`,
      };

    case 'truthy':
      return {
        type: 'python',
        value: 'bool(output)',
      };

    case 'falsy':
      return {
        type: 'python',
        value: 'not bool(output)',
      };

    case 'custom':
      return {
        type: 'python',
        value: assertion.check,
      };

    default:
      return {
        type: 'python',
        value: 'True',
      };
  }
}

export async function generateTestProvider(outputPath: string): Promise<void> {
  const providerCode = `#!/usr/bin/env python3
"""
Promptfoo provider that executes tests and returns structured results.

This provider integrates with evaluclaude-harness test runners to execute
functional tests in a sandboxed environment and return results compatible
with Promptfoo's assertion system.
"""

import subprocess
import json
import sys
import os
import tempfile
import uuid
from pathlib import Path


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Runs tests and returns structured results."""
    
    config = options.get('config', {})
    test_dir = config.get('test_dir', './tests/generated')
    framework = config.get('framework', 'pytest')
    timeout = config.get('timeout', 300)
    sandbox = config.get('sandbox', True)
    
    scenario_id = prompt.strip()
    eval_id = f"eval-{uuid.uuid4().hex[:8]}"
    
    # Ensure traces directory exists
    traces_dir = Path('.evaluclaude/traces')
    traces_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        if framework == 'pytest':
            output = run_pytest(test_dir, scenario_id, timeout, eval_id)
        elif framework in ('vitest', 'jest'):
            output = run_js_tests(test_dir, scenario_id, timeout, framework, eval_id)
        else:
            output = {'error': f'Unknown framework: {framework}', 'passed': 0, 'failed': 1}
            
        # Add trace reference
        output['eval_id'] = eval_id
        output['trace_file'] = str(traces_dir / f"{eval_id}.json")
        
        return {
            'output': json.dumps(output),
            'error': None,
        }
        
    except subprocess.TimeoutExpired:
        return {
            'output': json.dumps({
                'error': 'Test execution timed out',
                'passed': 0,
                'failed': 1,
                'eval_id': eval_id,
            }),
            'error': None,
        }
    except Exception as e:
        return {
            'output': json.dumps({
                'error': str(e),
                'passed': 0,
                'failed': 1,
                'eval_id': eval_id,
            }),
            'error': str(e),
        }


def run_pytest(test_dir: str, scenario_id: str, timeout: int, eval_id: str) -> dict:
    """Run pytest and return structured results."""
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
        report_file = f.name
    
    cmd = [
        sys.executable, '-m', 'pytest',
        '--json-report',
        f'--json-report-file={report_file}',
        '-v',
        '--tb=short',
    ]
    
    if scenario_id:
        cmd.extend(['-k', scenario_id])
    
    cmd.append(test_dir)
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=os.getcwd(),
    )
    
    try:
        with open(report_file) as f:
            report = json.load(f)
            
        summary = report.get('summary', {})
        tests = report.get('tests', [])
        
        output = {
            'passed': summary.get('passed', 0),
            'failed': summary.get('failed', 0),
            'skipped': summary.get('skipped', 0),
            'total': summary.get('total', 0),
            'duration': report.get('duration', 0) * 1000,  # Convert to ms
            'tests': [
                {
                    'id': extract_scenario_id(t.get('nodeid', '')),
                    'name': t.get('nodeid', ''),
                    'status': t.get('outcome', 'unknown'),
                    'duration': (t.get('call', {}).get('duration', 0) or 0) * 1000,
                    'error': t.get('call', {}).get('crash', {}).get('message') if t.get('call', {}).get('crash') else None,
                }
                for t in tests
            ],
            'exit_code': result.returncode,
        }
    except (FileNotFoundError, json.JSONDecodeError) as e:
        output = {
            'passed': 0,
            'failed': 1,
            'error': f'Failed to parse pytest report: {e}',
            'stdout': result.stdout[-2000:] if result.stdout else '',
            'stderr': result.stderr[-2000:] if result.stderr else '',
        }
    finally:
        try:
            os.unlink(report_file)
        except OSError:
            pass
    
    return output


def run_js_tests(test_dir: str, scenario_id: str, timeout: int, framework: str, eval_id: str) -> dict:
    """Run vitest/jest and return structured results."""
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
        report_file = f.name
    
    cmd = ['npx', framework, 'run', '--reporter=json', f'--outputFile={report_file}']
    
    if scenario_id:
        cmd.extend(['--testNamePattern', scenario_id])
    
    cmd.append(test_dir)
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=os.getcwd(),
    )
    
    try:
        with open(report_file) as f:
            report = json.load(f)
        
        output = {
            'passed': report.get('numPassedTests', 0),
            'failed': report.get('numFailedTests', 0),
            'skipped': report.get('numSkippedTests', 0),
            'total': report.get('numTotalTests', 0),
            'tests': [],
            'exit_code': result.returncode,
        }
        
        for test_file in report.get('testResults', []):
            for assertion in test_file.get('assertionResults', []):
                output['tests'].append({
                    'id': extract_scenario_id(assertion.get('fullName', '')),
                    'name': assertion.get('fullName', ''),
                    'status': assertion.get('status', 'unknown'),
                    'duration': assertion.get('duration', 0),
                    'error': assertion.get('failureMessages', [None])[0] if assertion.get('failureMessages') else None,
                })
                
    except (FileNotFoundError, json.JSONDecodeError) as e:
        output = {
            'passed': 0,
            'failed': 1,
            'error': f'Failed to parse {framework} report: {e}',
            'stdout': result.stdout[-2000:] if result.stdout else '',
            'stderr': result.stderr[-2000:] if result.stderr else '',
        }
    finally:
        try:
            os.unlink(report_file)
        except OSError:
            pass
    
    return output


def extract_scenario_id(nodeid: str) -> str:
    """Extract scenario ID from test name."""
    import re
    match = re.search(r'test[_\\s]([a-zA-Z0-9_-]+)', nodeid, re.IGNORECASE)
    return match.group(1) if match else nodeid.replace(' ', '_')


def get_provider_response(prompt: str, options: dict, context: dict) -> dict:
    """Alias for call_api for backwards compatibility."""
    return call_api(prompt, options, context)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run tests for Promptfoo')
    parser.add_argument('--scenario', default='', help='Scenario ID to filter')
    parser.add_argument('--test-dir', default='./tests/generated', help='Test directory')
    parser.add_argument('--framework', default='pytest', help='Test framework')
    parser.add_argument('--timeout', type=int, default=300, help='Timeout in seconds')
    args = parser.parse_args()
    
    result = call_api(
        args.scenario,
        {'config': {
            'test_dir': args.test_dir,
            'framework': args.framework,
            'timeout': args.timeout,
        }},
        {}
    )
    print(json.dumps(json.loads(result['output']), indent=2) if result['output'] else result['error'])
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, providerCode, { mode: 0o755 });
}
