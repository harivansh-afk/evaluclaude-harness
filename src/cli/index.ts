#!/usr/bin/env node

import { Command } from 'commander';
import { introCommand } from './commands/intro.js';
import { analyzeCommand } from './commands/analyze.js';

const program = new Command();

program
  .name('evaluclaude')
  .description('Zero-to-evals in one command. Claude analyzes codebases and generates functional tests.')
  .version('0.1.0');

program.addCommand(introCommand);
program.addCommand(analyzeCommand);

program.parse(process.argv);
