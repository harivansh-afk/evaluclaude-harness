import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Rubric } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, '../../../prompts');

let promptCache: Map<string, string> = new Map();

function loadPrompt(name: string): string {
  if (promptCache.has(name)) {
    return promptCache.get(name)!;
  }
  
  const filePath = join(PROMPTS_DIR, `${name}.md`);
  const content = readFileSync(filePath, 'utf-8');
  promptCache.set(name, content);
  return content;
}

export function buildGraderSystemPrompt(): string {
  return loadPrompt('grader-system');
}

export function buildGraderUserPrompt(output: string, rubric: Rubric): string {
  const template = loadPrompt('grader-user');
  
  const criteriaList = rubric.criteria.map(c => {
    let entry = `#### ${c.name} (weight: ${(c.weight * 100).toFixed(0)}%)\n\n${c.description}`;
    
    if (c.examples) {
      entry += `\n\n**Good example:** ${c.examples.good}`;
      entry += `\n**Bad example:** ${c.examples.bad}`;
    }
    
    return entry;
  }).join('\n\n');
  
  return template
    .replace('{{RUBRIC_NAME}}', rubric.name)
    .replace('{{RUBRIC_DESCRIPTION}}', rubric.description)
    .replace('{{PASSING_THRESHOLD}}', String(Math.round(rubric.passingThreshold * 100)))
    .replace('{{CRITERIA_LIST}}', criteriaList)
    .replace('{{OUTPUT}}', output);
}

export function clearPromptCache(): void {
  promptCache.clear();
}
