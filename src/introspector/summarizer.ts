import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { scanDirectory, detectConfig } from './scanner.js';
import { PythonParser } from './parsers/python.js';
import { TypeScriptParser } from './parsers/typescript.js';
import { getGitInfo, getChangedFiles } from './git.js';
import { buildFileTree } from './tree.js';
import type { RepoSummary, ModuleInfo, FileInfo, Language } from './types.js';

export interface AnalyzeOptions {
  root: string;
  incremental?: boolean;
  lastCommit?: string;
  onlyFiles?: string[];
  onProgress?: (message: string) => void;
}

export async function analyze(options: AnalyzeOptions): Promise<RepoSummary> {
  const { root, incremental, lastCommit, onlyFiles, onProgress } = options;

  onProgress?.('Scanning directory...');
  let files = await scanDirectory(root);

  // Filter for incremental analysis
  if (onlyFiles && onlyFiles.length > 0) {
    files = files.filter(f => onlyFiles.includes(f.path));
    onProgress?.(`Filtered to ${files.length} changed files`);
  }

  onProgress?.(`Found ${files.length} source files`);

  // Initialize parsers
  const pythonParser = new PythonParser();
  const tsParser = new TypeScriptParser();

  const modules: ModuleInfo[] = [];
  const sourceFiles = files.filter(f => f.role === 'source' && f.lang !== 'other');

  onProgress?.(`Parsing ${sourceFiles.length} modules...`);

  for (const file of sourceFiles) {
    const fullPath = path.join(root, file.path);
    
    try {
      const source = await fs.readFile(fullPath, 'utf-8');
      
      let moduleInfo: ModuleInfo;
      if (file.lang === 'python') {
        moduleInfo = pythonParser.parse(source, file.path);
      } else if (file.lang === 'typescript') {
        moduleInfo = tsParser.parse(source, file.path);
      } else {
        continue;
      }
      
      modules.push(moduleInfo);
    } catch (error) {
      // Skip files that can't be parsed
      onProgress?.(`Warning: Could not parse ${file.path}`);
    }
  }

  onProgress?.('Detecting project configuration...');
  const config = await detectConfig(root);

  onProgress?.('Getting git info...');
  const git = await getGitInfo(root, lastCommit);

  onProgress?.('Building file tree...');
  const tree = buildFileTree(files, path.basename(root));

  // Detect languages used
  const languages = detectLanguages(files);

  onProgress?.('Analysis complete');

  return {
    languages,
    root,
    analyzedAt: new Date().toISOString(),
    files,
    modules,
    config,
    git,
    tree,
  };
}

export async function analyzeIncremental(
  root: string,
  lastCommit: string,
  onProgress?: (message: string) => void
): Promise<RepoSummary> {
  onProgress?.('Getting changed files since last commit...');
  const changedFiles = await getChangedFiles(root, lastCommit);
  
  if (changedFiles.length === 0) {
    onProgress?.('No files changed');
    // Return minimal summary
    return {
      languages: [],
      root,
      analyzedAt: new Date().toISOString(),
      files: [],
      modules: [],
      config: {},
      git: await getGitInfo(root, lastCommit),
    };
  }

  onProgress?.(`Found ${changedFiles.length} changed files`);
  
  return analyze({
    root,
    incremental: true,
    lastCommit,
    onlyFiles: changedFiles,
    onProgress,
  });
}

function detectLanguages(files: FileInfo[]): Language[] {
  const languages = new Set<Language>();
  
  for (const file of files) {
    if (file.lang === 'python') {
      languages.add('python');
    } else if (file.lang === 'typescript') {
      languages.add('typescript');
    }
  }
  
  return [...languages];
}
