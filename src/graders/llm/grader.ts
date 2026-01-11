import Anthropic from '@anthropic-ai/sdk';
import type { Rubric, RubricGradingResult, GraderOptions, CriterionScore } from '../types.js';
import { loadRubric } from './rubric-loader.js';
import { buildGraderSystemPrompt, buildGraderUserPrompt } from './prompt-builder.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 1024;

interface GradingResponse {
  scores: Record<string, { score: number; feedback: string }>;
  overall: number;
  summary: string;
}

export class LLMGrader {
  private client: Anthropic;
  private options: Required<GraderOptions>;

  constructor(options: GraderOptions = {}) {
    this.client = new Anthropic();
    this.options = {
      model: options.model || DEFAULT_MODEL,
      maxTokens: options.maxTokens || DEFAULT_MAX_TOKENS,
      rubricsDir: options.rubricsDir || 'rubrics',
    };
  }

  async grade(output: string, rubricNameOrDef: string | Rubric): Promise<RubricGradingResult> {
    const rubric = typeof rubricNameOrDef === 'string'
      ? loadRubric(rubricNameOrDef, this.options.rubricsDir)
      : rubricNameOrDef;

    const systemPrompt = buildGraderSystemPrompt();
    const userPrompt = buildGraderUserPrompt(output, rubric);

    const response = await this.client.messages.create({
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    const parsed = this.parseResponse(responseText);
    
    return this.buildResult(parsed, rubric);
  }

  private parseResponse(text: string): GradingResponse {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from grader response');
    }

    try {
      return JSON.parse(jsonMatch[0]) as GradingResponse;
    } catch (e) {
      throw new Error(`Failed to parse grader response as JSON: ${e}`);
    }
  }

  private buildResult(parsed: GradingResponse, rubric: Rubric): RubricGradingResult {
    const criterionScores: CriterionScore[] = rubric.criteria.map(c => {
      const score = parsed.scores[c.name];
      return {
        name: c.name,
        score: score?.score ?? 0,
        feedback: score?.feedback ?? 'No feedback provided',
      };
    });

    const weightedScore = rubric.criteria.reduce((sum, c) => {
      const criterionScore = parsed.scores[c.name]?.score ?? 0;
      return sum + criterionScore * c.weight;
    }, 0);

    const finalScore = parsed.overall ?? weightedScore;

    return {
      pass: finalScore >= rubric.passingThreshold,
      score: finalScore,
      reason: parsed.summary || 'No summary provided',
      criterionScores,
    };
  }
}

export async function gradeWithRubric(
  output: string,
  rubricNameOrDef: string | Rubric,
  options?: GraderOptions
): Promise<RubricGradingResult> {
  const grader = new LLMGrader(options);
  return grader.grade(output, rubricNameOrDef);
}
