import type { Rubric, CalibrationExample, CalibrationResult, GraderOptions } from '../types.js';
import { gradeWithRubric } from './grader.js';
import { loadRubric } from './rubric-loader.js';

const AGREEMENT_THRESHOLD = 0.1;
const MIN_AGREEMENT_RATE = 0.8;

export async function calibrate(
  rubricNameOrDef: string | Rubric,
  examples: CalibrationExample[],
  options?: GraderOptions
): Promise<CalibrationResult> {
  const rubric = typeof rubricNameOrDef === 'string'
    ? loadRubric(rubricNameOrDef, options?.rubricsDir)
    : rubricNameOrDef;

  const results = await Promise.all(
    examples.map(async (ex) => {
      const result = await gradeWithRubric(ex.input, rubric, options);
      return {
        example: ex,
        actualScore: result.score,
        difference: result.score - ex.expectedScore,
      };
    })
  );

  const withinThreshold = results.filter(r => 
    Math.abs(r.difference) < AGREEMENT_THRESHOLD
  );

  const agreement = withinThreshold.length / results.length;
  const drift = results.map(r => r.difference);

  return {
    agreement,
    drift,
    needsAdjustment: agreement < MIN_AGREEMENT_RATE,
    details: results,
  };
}

export function analyzeCalibration(result: CalibrationResult): string {
  const lines: string[] = [];
  
  lines.push(`Calibration Results`);
  lines.push(`==================`);
  lines.push(`Agreement Rate: ${(result.agreement * 100).toFixed(1)}%`);
  lines.push(`Status: ${result.needsAdjustment ? '⚠️ Needs Adjustment' : '✅ Calibrated'}`);
  lines.push('');
  
  if (result.drift.length > 0) {
    const avgDrift = result.drift.reduce((a, b) => a + b, 0) / result.drift.length;
    const maxDrift = Math.max(...result.drift.map(Math.abs));
    
    lines.push(`Average Drift: ${avgDrift > 0 ? '+' : ''}${avgDrift.toFixed(3)}`);
    lines.push(`Max Absolute Drift: ${maxDrift.toFixed(3)}`);
    lines.push('');
  }
  
  lines.push(`Individual Results:`);
  for (const detail of result.details) {
    const status = Math.abs(detail.difference) < AGREEMENT_THRESHOLD ? '✓' : '✗';
    lines.push(`  ${status} Expected: ${detail.example.expectedScore.toFixed(2)}, Actual: ${detail.actualScore.toFixed(2)}, Diff: ${detail.difference > 0 ? '+' : ''}${detail.difference.toFixed(3)}`);
  }
  
  return lines.join('\n');
}
