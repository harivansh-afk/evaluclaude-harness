import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import yaml from 'js-yaml';
import type { Rubric } from '../types.js';

const DEFAULT_RUBRICS_DIR = 'rubrics';

let rubricCache: Map<string, Rubric> = new Map();

export function loadRubric(nameOrPath: string, rubricsDir: string = DEFAULT_RUBRICS_DIR): Rubric {
  if (rubricCache.has(nameOrPath)) {
    return rubricCache.get(nameOrPath)!;
  }

  let rubricPath: string;
  
  if (existsSync(nameOrPath)) {
    rubricPath = nameOrPath;
  } else {
    rubricPath = join(rubricsDir, `${nameOrPath}.yaml`);
    if (!existsSync(rubricPath)) {
      rubricPath = join(rubricsDir, `${nameOrPath}.yml`);
    }
  }

  if (!existsSync(rubricPath)) {
    throw new Error(`Rubric not found: ${nameOrPath} (searched in ${rubricsDir})`);
  }

  const content = readFileSync(rubricPath, 'utf-8');
  const rubric = yaml.load(content) as Rubric;

  validateRubric(rubric);
  rubricCache.set(nameOrPath, rubric);

  return rubric;
}

export function loadAllRubrics(rubricsDir: string = DEFAULT_RUBRICS_DIR): Map<string, Rubric> {
  if (!existsSync(rubricsDir)) {
    return new Map();
  }

  const files = readdirSync(rubricsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const rubrics = new Map<string, Rubric>();

  for (const file of files) {
    const name = basename(file).replace(/\.(yaml|yml)$/, '');
    try {
      const rubric = loadRubric(join(rubricsDir, file));
      rubrics.set(name, rubric);
    } catch (e) {
      console.warn(`Failed to load rubric ${file}:`, e);
    }
  }

  return rubrics;
}

function validateRubric(rubric: unknown): asserts rubric is Rubric {
  if (!rubric || typeof rubric !== 'object') {
    throw new Error('Rubric must be an object');
  }

  const r = rubric as Record<string, unknown>;
  
  if (typeof r.name !== 'string') {
    throw new Error('Rubric must have a name (string)');
  }
  if (typeof r.description !== 'string') {
    throw new Error('Rubric must have a description (string)');
  }
  if (typeof r.passingThreshold !== 'number' || r.passingThreshold < 0 || r.passingThreshold > 1) {
    throw new Error('Rubric must have a passingThreshold between 0 and 1');
  }
  if (!Array.isArray(r.criteria) || r.criteria.length === 0) {
    throw new Error('Rubric must have at least one criterion');
  }

  for (const criterion of r.criteria) {
    validateCriterion(criterion);
  }

  const totalWeight = (r.criteria as Array<{ weight: number }>).reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(totalWeight - 1) > 0.01) {
    console.warn(`Rubric '${r.name}' weights sum to ${totalWeight}, not 1.0`);
  }
}

function validateCriterion(criterion: unknown): void {
  if (!criterion || typeof criterion !== 'object') {
    throw new Error('Criterion must be an object');
  }

  const c = criterion as Record<string, unknown>;

  if (typeof c.name !== 'string') {
    throw new Error('Criterion must have a name');
  }
  if (typeof c.description !== 'string') {
    throw new Error('Criterion must have a description');
  }
  if (typeof c.weight !== 'number' || c.weight < 0 || c.weight > 1) {
    throw new Error('Criterion must have a weight between 0 and 1');
  }
}

export function clearRubricCache(): void {
  rubricCache.clear();
}

export function formatRubricForPrompt(rubric: Rubric): string {
  let prompt = `# ${rubric.name}\n\n${rubric.description}\n\nPassing threshold: ${rubric.passingThreshold * 100}%\n\n## Criteria\n\n`;

  for (const criterion of rubric.criteria) {
    prompt += `### ${criterion.name} (weight: ${criterion.weight * 100}%)\n`;
    prompt += `${criterion.description}\n`;
    
    if (criterion.examples) {
      prompt += `\n**Good example:** ${criterion.examples.good}\n`;
      prompt += `**Bad example:** ${criterion.examples.bad}\n`;
    }
    prompt += '\n';
  }

  return prompt;
}
