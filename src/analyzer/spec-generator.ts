import { query, type SDKMessage, type Options, type CanUseTool, type PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { RepoSummary } from '../introspector/types.js';
import type { EvalSpec } from './types.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder.js';
import { EVAL_SPEC_JSON_SCHEMA } from './types.js';

export interface GenerateOptions {
  interactive?: boolean;
  onQuestion?: (question: string) => Promise<string>;
  focus?: string[];
  maxScenarios?: number;
}

export interface GenerateResult {
  spec: EvalSpec;
  tokensUsed: number;
  questionsAsked: number;
}

export async function generateEvalSpec(
  repoSummary: RepoSummary,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { interactive = false, onQuestion, focus, maxScenarios = 10 } = options;

  const systemPrompt = await buildSystemPrompt();
  const userPrompt = await buildUserPrompt({
    repoSummary,
    focus,
    maxScenarios,
  });

  let tokensUsed = 0;
  let questionsAsked = 0;
  let spec: EvalSpec | null = null;

  const canUseTool: CanUseTool = async (toolName, input): Promise<PermissionResult> => {
    if (toolName === 'AskUserQuestion' && interactive && onQuestion) {
      // Extract question from various possible field names
      const inputObj = input as Record<string, unknown>;
      const question = String(
        inputObj.question || 
        inputObj.text || 
        inputObj.message || 
        inputObj.prompt ||
        JSON.stringify(input)
      );
      
      const answer = await onQuestion(question);
      questionsAsked++;
      return {
        behavior: 'allow',
        updatedInput: { ...input, answer },
      };
    }
    // Allow all other tools in interactive mode
    return { behavior: 'allow' };
  };

  const queryOptions: Options = {
    // In interactive mode, allow all tools; in non-interactive, restrict to none
    tools: interactive 
      ? { type: 'preset', preset: 'claude_code' }
      : [],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    outputFormat: {
      type: 'json_schema',
      schema: EVAL_SPEC_JSON_SCHEMA,
    },
    canUseTool: interactive ? canUseTool : undefined,
  };

  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  for await (const message of query({ prompt: fullPrompt, options: queryOptions })) {
    handleMessage(message);
    
    if (message.type === 'result') {
      if (message.subtype === 'success') {
        // SDK returns parsed JSON in structured_output when outputFormat is set
        const structuredOutput = (message as { structured_output?: unknown }).structured_output;
        const resultData = structuredOutput ?? message.result;
        spec = parseResult(resultData);
        tokensUsed = (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0);
      } else {
        throw new Error(`Generation failed: ${message.subtype}`);
      }
    }
  }

  if (!spec) {
    throw new Error('Failed to generate EvalSpec: no result received');
  }

  spec.metadata = {
    ...spec.metadata,
    generatedBy: 'evaluclaude-harness',
    totalTokens: tokensUsed,
    questionsAsked,
  };

  return { spec, tokensUsed, questionsAsked };
}

function parseResult(result: unknown): EvalSpec {
  if (typeof result === 'string') {
    let jsonStr = result.trim();
    
    // Try to extract JSON from markdown code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    // Try to find JSON object in the string
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }
    
    try {
      return JSON.parse(jsonStr) as EvalSpec;
    } catch (e) {
      console.error('Raw result:', result);
      throw new Error(`Failed to parse result as JSON: ${e}`);
    }
  }
  
  if (result && typeof result === 'object') {
    return result as EvalSpec;
  }
  
  throw new Error(`Unexpected result type: ${typeof result}`);
}

function handleMessage(message: SDKMessage): void {
  switch (message.type) {
    case 'assistant':
      if (message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            process.stderr.write(`\n${block.text}\n`);
          }
        }
      }
      break;
    case 'result':
      if (message.subtype !== 'success') {
        console.error('Error:', message.subtype);
      }
      break;
  }
}

export async function generateEvalSpecNonInteractive(
  repoSummary: RepoSummary,
  options: Omit<GenerateOptions, 'interactive' | 'onQuestion'> = {}
): Promise<GenerateResult> {
  return generateEvalSpec(repoSummary, { ...options, interactive: false });
}

export async function generateEvalSpecInteractive(
  repoSummary: RepoSummary,
  questionHandler: (question: string) => Promise<string>,
  options: Omit<GenerateOptions, 'interactive' | 'onQuestion'> = {}
): Promise<GenerateResult> {
  return generateEvalSpec(repoSummary, {
    ...options,
    interactive: true,
    onQuestion: questionHandler,
  });
}
