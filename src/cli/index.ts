#!/usr/bin/env node

import { Command } from 'commander';
import { introCommand } from './commands/intro.js';
import { analyzeCommand } from './commands/analyze.js';
import { renderCommand } from './commands/render.js';
import { gradeCommand, listRubricsCommand, calibrateCommand } from './commands/grade.js';
import { runCommand } from './commands/run.js';
import { viewCommand, tracesCommand } from './commands/view.js';
import { uiCommand, evalCommand } from './commands/ui.js';
import { pipelineCommand } from './commands/pipeline.js';
import { BANNER_MINIMAL, style, welcomeMessage, icons } from './theme.js';

const program = new Command();

program
  .name('evaluclaude')
  .description(`${BANNER_MINIMAL}\n\nClaude-powered functional test generation for any codebase.`)
  .version('0.1.0')
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => style.command(cmd.name()) + ' ' + style.dim(cmd.usage()),
  })
  .addHelpText('beforeAll', '')
  .addHelpText('afterAll', `
${style.bold('Examples:')}

  ${style.dim('# Run the full pipeline on current directory')}
  $ evaluclaude pipeline .

  ${style.dim('# Analyze a Python project interactively')}
  $ evaluclaude analyze ./my-project -i -o spec.json

  ${style.dim('# Generate and run tests')}
  $ evaluclaude render spec.json && evaluclaude run

  ${style.dim('# View results in browser')}
  $ evaluclaude run --export-promptfoo && evaluclaude ui

${style.muted('For more info, run any command with --help')}
`);

// Add welcome command for first-time users
const welcomeCmd = new Command('welcome')
  .description('Show welcome message and quick start guide')
  .action(() => {
    console.log(welcomeMessage());
  });

// Core pipeline command - the "zero to evals" experience
program.addCommand(pipelineCommand);

// Individual step commands
program.addCommand(introCommand);
program.addCommand(analyzeCommand);
program.addCommand(renderCommand);
program.addCommand(runCommand);

// Grading commands
program.addCommand(gradeCommand);
program.addCommand(listRubricsCommand);
program.addCommand(calibrateCommand);

// Observability commands
program.addCommand(viewCommand);
program.addCommand(tracesCommand);

// Promptfoo integration commands
program.addCommand(uiCommand);
program.addCommand(evalCommand);

// Utility commands
program.addCommand(welcomeCmd);

// Show welcome on no args if first time (check for .evaluclaude directory)
if (process.argv.length === 2) {
  const fs = await import('fs');
  if (!fs.existsSync('.evaluclaude')) {
    console.log(welcomeMessage());
    process.exit(0);
  }
}

program.parse(process.argv);
