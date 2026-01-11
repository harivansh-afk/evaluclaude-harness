import { Command } from 'commander';
import { 
  loadTrace, 
  listTraces, 
  getLatestTrace,
  formatTrace, 
  formatTraceList 
} from '../../observability/index.js';

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
  .action(async (traceId: string | undefined, options) => {
    try {
      if (options.list) {
        const traces = await listTraces(options.eval);
        const limited = traces.slice(0, parseInt(options.limit, 10));
        
        if (traces.length === 0) {
          console.log('\nNo traces found.');
          console.log('Run `evaluclaude run` to generate traces.\n');
          return;
        }
        
        console.log(formatTraceList(limited));
        
        if (traces.length > limited.length) {
          console.log(`Showing ${limited.length} of ${traces.length} traces.`);
          console.log(`Use --limit to see more.\n`);
        }
        return;
      }

      let trace;

      if (options.last || !traceId) {
        trace = await getLatestTrace();
        if (!trace) {
          console.log('\nNo traces found.');
          console.log('Run `evaluclaude run` to generate traces.\n');
          return;
        }
      } else {
        trace = await loadTrace(traceId);
        if (!trace) {
          console.error(`\nTrace not found: ${traceId}`);
          console.log('Use `evaluclaude view --list` to see available traces.\n');
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
      console.error('Error viewing trace:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export const tracesCommand = new Command('traces')
  .description('List all evaluation traces (alias for view --list)')
  .option('-n, --limit <count>', 'Limit number of traces', '20')
  .option('--eval <eval-id>', 'Filter by eval ID')
  .action(async (options) => {
    const traces = await listTraces(options.eval);
    const limited = traces.slice(0, parseInt(options.limit, 10));
    
    if (traces.length === 0) {
      console.log('\nNo traces found.');
      return;
    }
    
    console.log(formatTraceList(limited));
  });
