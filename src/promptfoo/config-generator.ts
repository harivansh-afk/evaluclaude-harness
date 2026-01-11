import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import * as yaml from 'js-yaml';
import type { EvalSpec, EvalScenario } from '../analyzer/types.js';
import type { PromptfooConfig, PromptfooTest, PromptfooAssertion } from './types.js';

export interface ConfigOptions {
  testDir: string;
  outputPath: string;
  framework: 'pytest' | 'vitest' | 'jest';
  includeTraceLinks: boolean;
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

  return {
    description: `Evaluclaude functional tests for ${spec.repo.name}`,
    providers: [
      {
        id: `file://providers/test-runner.py`,
        label: 'functional-tests',
        config: {
          test_dir: options.testDir,
          framework: options.framework,
          timeout: 300,
        },
      },
    ],
    prompts: ['{{scenario_id}}'],
    tests,
    defaultTest: options.includeTraceLinks
      ? {
          metadata: {
            traceFile: '.evaluclaude/traces/{{evalId}}.json',
          },
        }
      : undefined,
    outputPath: '.evaluclaude/results/promptfoo-results.json',
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
"""Promptfoo provider that executes tests and returns structured results."""

import subprocess
import json
import sys
import os

def get_provider_response(prompt: str, options: dict, context: dict) -> dict:
    """Runs tests and returns structured results."""
    
    test_dir = options.get('config', {}).get('test_dir', './tests')
    framework = options.get('config', {}).get('framework', 'pytest')
    timeout = options.get('config', {}).get('timeout', 300)
    
    scenario_id = prompt.strip()
    
    try:
        if framework == 'pytest':
            result = subprocess.run(
                [
                    'python', '-m', 'pytest',
                    '--json-report',
                    '--json-report-file=/tmp/pytest_results.json',
                    '-k', scenario_id,
                    test_dir
                ],
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            try:
                with open('/tmp/pytest_results.json') as f:
                    report = json.load(f)
                    
                output = {
                    'passed': report.get('summary', {}).get('passed', 0),
                    'failed': report.get('summary', {}).get('failed', 0),
                    'skipped': report.get('summary', {}).get('skipped', 0),
                    'tests': report.get('tests', []),
                    'stdout': result.stdout,
                    'stderr': result.stderr,
                    'exit_code': result.returncode,
                }
            except FileNotFoundError:
                output = {
                    'passed': 0,
                    'failed': 1,
                    'error': 'Failed to generate pytest report',
                    'stdout': result.stdout,
                    'stderr': result.stderr,
                }
                
        elif framework in ('vitest', 'jest'):
            cmd = ['npx', framework, 'run', '--reporter=json']
            if scenario_id:
                cmd.extend(['--testNamePattern', scenario_id])
            cmd.append(test_dir)
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            try:
                report = json.loads(result.stdout)
                output = {
                    'passed': report.get('numPassedTests', 0),
                    'failed': report.get('numFailedTests', 0),
                    'skipped': report.get('numSkippedTests', 0),
                    'tests': report.get('testResults', []),
                    'exit_code': result.returncode,
                }
            except json.JSONDecodeError:
                output = {
                    'passed': 0,
                    'failed': 1,
                    'error': 'Failed to parse test output',
                    'stdout': result.stdout,
                    'stderr': result.stderr,
                }
        else:
            output = {'error': f'Unknown framework: {framework}'}
            
        return {
            'output': json.dumps(output),
            'error': None,
        }
        
    except subprocess.TimeoutExpired:
        return {
            'output': json.dumps({'error': 'Test execution timed out', 'passed': 0, 'failed': 1}),
            'error': None,
        }
    except Exception as e:
        return {
            'output': None,
            'error': str(e),
        }

if __name__ == '__main__':
    # For testing the provider directly
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--scenario', default='')
    parser.add_argument('--test-dir', default='./tests')
    parser.add_argument('--framework', default='pytest')
    args = parser.parse_args()
    
    result = get_provider_response(
        args.scenario,
        {'config': {'test_dir': args.test_dir, 'framework': args.framework}},
        {}
    )
    print(json.dumps(result, indent=2))
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, providerCode);
}
