import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RepoSummary } from '../introspector/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, '../../prompts');

export interface PromptConfig {
  repoSummary: RepoSummary;
  focus?: string[];
  maxScenarios?: number;
}

export async function loadPrompt(name: string): Promise<string> {
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);
  return fs.readFile(filePath, 'utf-8');
}

export async function buildSystemPrompt(): Promise<string> {
  const system = await loadPrompt('analyzer-system');
  const developer = await loadPrompt('analyzer-developer');
  return `${system}\n\n${developer}`;
}

export async function buildUserPrompt(config: PromptConfig): Promise<string> {
  const template = await loadPrompt('analyzer-user');
  
  const optimizedSummary = optimizeForPrompt(config.repoSummary);
  const summaryJson = JSON.stringify(optimizedSummary, null, 2);
  
  const focusInstructions = config.focus?.length
    ? `Focus specifically on these modules/functions: ${config.focus.join(', ')}`
    : 'Analyze the entire codebase and identify the most important testable functions.';
  
  const maxScenarios = config.maxScenarios ?? 10;
  
  return template
    .replace('{{REPO_SUMMARY}}', summaryJson)
    .replace('{{FOCUS_INSTRUCTIONS}}', focusInstructions)
    .replace('{{MAX_SCENARIOS}}', String(maxScenarios));
}

export function optimizeForPrompt(summary: RepoSummary): OptimizedRepoSummary {
  return {
    name: path.basename(summary.root),
    languages: summary.languages,
    analyzedAt: summary.analyzedAt,
    
    modules: summary.modules.map(m => ({
      path: m.path,
      complexity: m.complexity,
      exports: m.exports.map(e => ({
        name: e.name,
        kind: e.kind,
        signature: e.signature,
        docstring: e.docstring,
        line: e.lineNumber,
        async: e.isAsync,
      })).filter(e => !e.name.startsWith('_')),
      imports: m.imports.slice(0, 10),
    })).filter(m => m.exports.length > 0),
    
    config: {
      python: summary.config.python ? {
        testFramework: summary.config.python.testFramework,
        hasTyping: summary.config.python.hasTyping,
      } : undefined,
      typescript: summary.config.typescript ? {
        testFramework: summary.config.typescript.testFramework,
        hasTypes: summary.config.typescript.hasTypes,
      } : undefined,
    },
    
    git: summary.git ? {
      branch: summary.git.branch,
      activeFiles: summary.git.fileHistory
        ?.sort((a, b) => b.commitCount - a.commitCount)
        .slice(0, 10)
        .map(f => ({ path: f.path, commits: f.commitCount })),
    } : undefined,
  };
}

export interface OptimizedRepoSummary {
  name: string;
  languages: string[];
  analyzedAt: string;
  modules: OptimizedModule[];
  config: {
    python?: { testFramework: string; hasTyping: boolean };
    typescript?: { testFramework: string; hasTypes: boolean };
  };
  git?: {
    branch: string;
    activeFiles?: { path: string; commits: number }[];
  };
}

interface OptimizedModule {
  path: string;
  complexity: string;
  exports: {
    name: string;
    kind: string;
    signature?: string;
    docstring?: string;
    line: number;
    async?: boolean;
  }[];
  imports: string[];
}
