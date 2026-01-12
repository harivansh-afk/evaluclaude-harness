import { Command } from 'commander';
import * as path from 'node:path';
import { analyze, treeToString } from '../../introspector/index.js';
import { style, icons, header, subheader, keyValue, Spinner, formatError, nextSteps, box } from '../theme.js';

export const introCommand = new Command('intro')
  .description('Introspect a codebase and output its structure (tree-sitter analysis)')
  .argument('[path]', 'Path to the repository to analyze', '.')
  .option('-o, --output <file>', 'Output file for the RepoSummary JSON')
  .option('--json', 'Output as JSON (default)')
  .option('--summary', 'Output a human-readable summary instead of JSON')
  .option('--tree', 'Show file tree structure')
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude intro')}                ${style.dim('Analyze current directory')}
  ${style.command('evaluclaude intro ./my-project')}   ${style.dim('Analyze specific path')}
  ${style.command('evaluclaude intro . --summary')}    ${style.dim('Human-readable summary')}
  ${style.command('evaluclaude intro . --tree')}       ${style.dim('Show file tree')}
  ${style.command('evaluclaude intro . -o out.json')}  ${style.dim('Save to file')}
`)
  .action(async (repoPath: string, options: { output?: string; json?: boolean; summary?: boolean; tree?: boolean }) => {
    const absolutePath = path.resolve(repoPath);
    
    console.log(header('Introspecting Codebase'));
    console.log(keyValue('Path', style.path(absolutePath)));
    console.log('');

    const spinner = new Spinner('Analyzing codebase with tree-sitter...');
    spinner.start();

    try {
      const summary = await analyze({
        root: absolutePath,
        onProgress: (msg) => spinner.update(msg),
      });

      spinner.succeed('Analysis complete');
      console.log('');

      if (options.tree && summary.tree) {
        console.log(subheader(`${icons.folder} File Tree`));
        console.log(treeToString(summary.tree));
        console.log('');
      } else if (options.summary) {
        printHumanSummary(summary);
      } else {
        const json = JSON.stringify(summary, null, 2);
        
        if (options.output) {
          const fs = await import('node:fs/promises');
          await fs.writeFile(options.output, json);
          console.log(`${style.success(icons.success)} Written to: ${style.path(options.output)}`);
        } else {
          console.log(json);
        }
      }

      console.log(nextSteps([
        { command: 'evaluclaude analyze .', description: 'Generate EvalSpec with Claude' },
        { command: 'evaluclaude intro . --summary', description: 'View human-readable summary' },
      ]));
    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(formatError(
        error instanceof Error ? error.message : 'Unknown error analyzing repository',
        [
          'Check that the path exists and is accessible',
          'Ensure the directory contains source files',
          'Try running with --tree to see the file structure',
        ]
      ));
      process.exit(1);
    }
  });

function printHumanSummary(summary: import('../../introspector/types.js').RepoSummary): void {
  console.log(subheader(`${icons.trace} Repository Summary`));
  console.log(keyValue('Root', style.path(summary.root)));
  console.log(keyValue('Analyzed', summary.analyzedAt));
  console.log(keyValue('Languages', summary.languages.join(', ') || style.muted('none detected')));
  
  console.log(subheader(`${icons.folder} Files`));
  console.log(keyValue('Total', style.number(String(summary.files.length)), 1));
  console.log(keyValue('Source', style.number(String(summary.files.filter(f => f.role === 'source').length)), 1));
  console.log(keyValue('Test', style.number(String(summary.files.filter(f => f.role === 'test').length)), 1));
  console.log(keyValue('Config', style.number(String(summary.files.filter(f => f.role === 'config').length)), 1));

  console.log(subheader(`${icons.code} Modules`));
  console.log(keyValue('Total', style.number(String(summary.modules.length)), 1));
  
  const totalExports = summary.modules.reduce((sum, m) => sum + m.exports.length, 0);
  const functions = summary.modules.flatMap(m => m.exports.filter(e => e.kind === 'function'));
  const classes = summary.modules.flatMap(m => m.exports.filter(e => e.kind === 'class'));
  
  console.log(keyValue('Functions', style.number(String(functions.length)), 1));
  console.log(keyValue('Classes', style.number(String(classes.length)), 1));
  console.log(keyValue('Total exports', style.number(String(totalExports)), 1));

  if (summary.config.python) {
    console.log(subheader(`${icons.python} Python`));
    console.log(keyValue('Test framework', summary.config.python.testFramework, 1));
    console.log(keyValue('pyproject.toml', summary.config.python.pyprojectToml ? style.success(icons.success) : style.error(icons.error), 1));
    console.log(keyValue('setup.py', summary.config.python.setupPy ? style.success(icons.success) : style.error(icons.error), 1));
  }

  if (summary.config.typescript) {
    console.log(subheader(`${icons.typescript} TypeScript`));
    console.log(keyValue('Test framework', summary.config.typescript.testFramework, 1));
    console.log(keyValue('package.json', summary.config.typescript.packageJson ? style.success(icons.success) : style.error(icons.error), 1));
    console.log(keyValue('tsconfig.json', summary.config.typescript.tsconfig ? style.success(icons.success) : style.error(icons.error), 1));
  }

  if (summary.git) {
    console.log(subheader(`${icons.gear} Git`));
    console.log(keyValue('Branch', summary.git.branch, 1));
    console.log(keyValue('Commit', style.muted(summary.git.currentCommit.slice(0, 8)), 1));
    
    if (summary.git.recentCommits && summary.git.recentCommits.length > 0) {
      console.log(subheader(`${icons.file} Recent Commits`));
      for (const commit of summary.git.recentCommits.slice(0, 5)) {
        const date = new Date(commit.date).toLocaleDateString();
        console.log(`  ${style.muted(commit.shortHash)} ${style.dim(date)} ${box.horizontal} ${commit.message.slice(0, 50)}${commit.message.length > 50 ? '...' : ''}`);
      }
    }
    
    if (summary.git.fileHistory && summary.git.fileHistory.length > 0) {
      console.log(subheader(`${icons.lightning} Most Active Files`));
      for (const file of summary.git.fileHistory.slice(0, 5)) {
        console.log(`  ${style.path(file.path)} ${style.dim(`(${style.number(String(file.commitCount))} commits)`)}`);
      }
    }
  }

  const topModules = [...summary.modules]
    .sort((a, b) => b.exports.length - a.exports.length)
    .slice(0, 5);

  if (topModules.length > 0) {
    console.log(subheader(`${icons.sparkle} Top Modules by Exports`));
    for (const mod of topModules) {
      console.log(`  ${style.path(mod.path)}: ${style.number(String(mod.exports.length))} exports`);
    }
  }
}
