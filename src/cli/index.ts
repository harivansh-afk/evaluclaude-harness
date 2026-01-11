#!/usr/bin/env node

import { Command } from 'commander';
import { introCommand } from './commands/intro.js';
import { analyzeCommand } from './commands/analyze.js';
import { renderCommand } from './commands/render.js';
import { gradeCommand, listRubricsCommand, calibrateCommand } from './commands/grade.js';
import { runCommand } from './commands/run.js';
import { viewCommand, tracesCommand } from './commands/view.js';
import { uiCommand, evalCommand } from './commands/ui.js';

const program = new Command();

program
  .name('evaluclaude')
  .description('Zero-to-evals in one command. Claude analyzes codebases and generates functional tests.')
  .version('0.1.0');

program.addCommand(introCommand);
program.addCommand(analyzeCommand);
program.addCommand(renderCommand);
program.addCommand(gradeCommand);
program.addCommand(listRubricsCommand);
program.addCommand(calibrateCommand);
program.addCommand(runCommand);
program.addCommand(viewCommand);
program.addCommand(tracesCommand);
program.addCommand(uiCommand);
program.addCommand(evalCommand);

program.parse(process.argv);
