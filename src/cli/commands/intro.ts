import { Command } from 'commander';
import * as path from 'node:path';
import { analyze, treeToString } from '../../introspector/index.js';

export const introCommand = new Command('intro')
  .description('Introspect a codebase and output its structure (tree-sitter analysis)')
  .argument('[path]', 'Path to the repository to analyze', '.')
  .option('-o, --output <file>', 'Output file for the RepoSummary JSON')
  .option('--json', 'Output as JSON (default)')
  .option('--summary', 'Output a human-readable summary instead of JSON')
  .option('--tree', 'Show file tree structure')
  .action(async (repoPath: string, options: { output?: string; json?: boolean; summary?: boolean; tree?: boolean }) => {
    const absolutePath = path.resolve(repoPath);
    
    console.log(`\n🔍 Analyzing: ${absolutePath}\n`);

    try {
      const summary = await analyze({
        root: absolutePath,
        onProgress: (msg) => console.log(`  ${msg}`),
      });

      console.log('');

      if (options.tree && summary.tree) {
        console.log('📁 File Tree:\n');
        console.log(treeToString(summary.tree));
        console.log('');
      } else if (options.summary) {
        printHumanSummary(summary);
      } else {
        const json = JSON.stringify(summary, null, 2);
        
        if (options.output) {
          const fs = await import('node:fs/promises');
          await fs.writeFile(options.output, json);
          console.log(`📄 Written to: ${options.output}`);
        } else {
          console.log(json);
        }
      }
    } catch (error) {
      console.error('❌ Error analyzing repository:', error);
      process.exit(1);
    }
  });

function printHumanSummary(summary: import('../../introspector/types.js').RepoSummary): void {
  console.log('📊 Repository Summary');
  console.log('─'.repeat(50));
  console.log(`📁 Root: ${summary.root}`);
  console.log(`🗓️  Analyzed: ${summary.analyzedAt}`);
  console.log(`🔤 Languages: ${summary.languages.join(', ') || 'none detected'}`);
  
  console.log('\n📂 Files:');
  console.log(`  Total: ${summary.files.length}`);
  console.log(`  Source: ${summary.files.filter(f => f.role === 'source').length}`);
  console.log(`  Test: ${summary.files.filter(f => f.role === 'test').length}`);
  console.log(`  Config: ${summary.files.filter(f => f.role === 'config').length}`);

  console.log('\n📦 Modules:');
  console.log(`  Total: ${summary.modules.length}`);
  
  const totalExports = summary.modules.reduce((sum, m) => sum + m.exports.length, 0);
  const functions = summary.modules.flatMap(m => m.exports.filter(e => e.kind === 'function'));
  const classes = summary.modules.flatMap(m => m.exports.filter(e => e.kind === 'class'));
  
  console.log(`  Functions: ${functions.length}`);
  console.log(`  Classes: ${classes.length}`);
  console.log(`  Total exports: ${totalExports}`);

  if (summary.config.python) {
    console.log('\n🐍 Python:');
    console.log(`  Test framework: ${summary.config.python.testFramework}`);
    console.log(`  pyproject.toml: ${summary.config.python.pyprojectToml ? '✓' : '✗'}`);
    console.log(`  setup.py: ${summary.config.python.setupPy ? '✓' : '✗'}`);
  }

  if (summary.config.typescript) {
    console.log('\n📘 TypeScript:');
    console.log(`  Test framework: ${summary.config.typescript.testFramework}`);
    console.log(`  package.json: ${summary.config.typescript.packageJson ? '✓' : '✗'}`);
    console.log(`  tsconfig.json: ${summary.config.typescript.tsconfig ? '✓' : '✗'}`);
  }

  if (summary.git) {
    console.log('\n📌 Git:');
    console.log(`  Branch: ${summary.git.branch}`);
    console.log(`  Commit: ${summary.git.currentCommit.slice(0, 8)}`);
    
    if (summary.git.recentCommits && summary.git.recentCommits.length > 0) {
      console.log('\n📜 Recent Commits:');
      for (const commit of summary.git.recentCommits.slice(0, 5)) {
        const date = new Date(commit.date).toLocaleDateString();
        console.log(`  ${commit.shortHash} ${date} - ${commit.message.slice(0, 50)}${commit.message.length > 50 ? '...' : ''}`);
      }
    }
    
    if (summary.git.fileHistory && summary.git.fileHistory.length > 0) {
      console.log('\n🔥 Most Active Files (by commit count):');
      for (const file of summary.git.fileHistory.slice(0, 5)) {
        console.log(`  ${file.path} (${file.commitCount} commits)`);
      }
    }
  }

  // Show top modules by export count
  const topModules = [...summary.modules]
    .sort((a, b) => b.exports.length - a.exports.length)
    .slice(0, 5);

  if (topModules.length > 0) {
    console.log('\n🏆 Top modules by exports:');
    for (const mod of topModules) {
      console.log(`  ${mod.path}: ${mod.exports.length} exports`);
    }
  }
}
