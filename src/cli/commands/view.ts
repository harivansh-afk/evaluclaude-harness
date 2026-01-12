import { Command } from 'commander';
import { 
  loadTrace, 
  listTraces, 
  getLatestTrace,
  formatTrace, 
  formatTraceList 
} from '../../observability/index.js';
import { style, icons, formatError, nextSteps } from '../theme.js';

export const viewCommand = new Command('view')
  .description('View evaluation traces')
  .argument('[trace-id]', 'Specific trace ID to view')
  .option('--last', 'View the most recent trace')
  .option('--list', 'List all traces')
  .option('--json', 'Output as raw JSON')
  .option('-v, --verbose', 'Show verbose output including tool calls')
  .option('--tools', 'Show tool call details')
  .option('--questions', 'Show questions asked', true)
  .option('--decisions', 'Show decisions made', true)
  .option('-n, --limit <count>', 'Limit number of traces listed', '20')
  .option('--eval <eval-id>', 'Filter traces by eval ID')
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude view')}              ${style.dim('View the most recent trace')}
  ${style.command('evaluclaude view --list')}       ${style.dim('List all available traces')}
  ${style.command('evaluclaude view abc123')}       ${style.dim('View a specific trace by ID')}
  ${style.command('evaluclaude view --json')}       ${style.dim('Output trace as raw JSON')}
  ${style.command('evaluclaude view -v')}           ${style.dim('Verbose output with tool calls')}
`)
  .action(async (traceId: string | undefined, options) => {
    try {
      if (options.list) {
        const traces = await listTraces(options.eval);
        const limited = traces.slice(0, parseInt(options.limit, 10));
        
        if (traces.length === 0) {
          console.log(`\n${style.warning(`${icons.warning} No traces found.`)}`);
          console.log(nextSteps([
            { command: 'evaluclaude run', description: 'Run evals to generate traces' },
            { command: 'evaluclaude pipeline .', description: 'Run full pipeline from scratch' },
          ]));
          return;
        }
        
        console.log(formatTraceList(limited));
        
        if (traces.length > limited.length) {
          console.log(style.muted(`Showing ${limited.length} of ${traces.length} traces.`));
          console.log(style.muted(`Use ${style.command('--limit')} to see more.\n`));
        }
        return;
      }

      let trace;

      if (options.last || !traceId) {
        trace = await getLatestTrace();
        if (!trace) {
          console.log(`\n${style.warning(`${icons.warning} No traces found.`)}`);
          console.log(nextSteps([
            { command: 'evaluclaude run', description: 'Run evals to generate traces' },
            { command: 'evaluclaude pipeline .', description: 'Run full pipeline from scratch' },
          ]));
          return;
        }
      } else {
        trace = await loadTrace(traceId);
        if (!trace) {
          console.log(formatError(`Trace not found: ${style.path(traceId)}`, [
            `Run ${style.command('evaluclaude view --list')} to see available traces`,
            `Check that the trace ID is correct`,
          ]));
          process.exit(1);
        }
      }

      const output = formatTrace(trace, {
        json: options.json,
        verbose: options.verbose,
        showToolCalls: options.tools || options.verbose,
        showQuestions: options.questions,
        showDecisions: options.decisions,
      });

      console.log(output);
    } catch (error) {
      console.log(formatError(
        error instanceof Error ? error.message : String(error),
        ['Run evaluclaude run first to generate traces']
      ));
      process.exit(1);
    }
  });

export const tracesCommand = new Command('traces')
  .description('List all evaluation traces (alias for view --list)')
  .option('-n, --limit <count>', 'Limit number of traces', '20')
  .option('--eval <eval-id>', 'Filter by eval ID')
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude traces')}            ${style.dim('List all traces')}
  ${style.command('evaluclaude traces -n 50')}      ${style.dim('Show up to 50 traces')}
  ${style.command('evaluclaude traces --eval X')}   ${style.dim('Filter by eval ID')}
`)
  .action(async (options) => {
    try {
      const traces = await listTraces(options.eval);
      const limited = traces.slice(0, parseInt(options.limit, 10));
      
      if (traces.length === 0) {
        console.log(`\n${style.warning(`${icons.warning} No traces found.`)}`);
        console.log(nextSteps([
          { command: 'evaluclaude run', description: 'Run evals to generate traces' },
        ]));
        return;
      }
      
      console.log(formatTraceList(limited));
      
      if (traces.length > limited.length) {
        console.log(style.muted(`Showing ${limited.length} of ${traces.length} traces.`));
        console.log(style.muted(`Use ${style.command('--limit')} to see more.\n`));
      }
    } catch (error) {
      console.log(formatError(
        error instanceof Error ? error.message : String(error),
        ['Run evaluclaude run first to generate traces']
      ));
      process.exit(1);
    }
  });
