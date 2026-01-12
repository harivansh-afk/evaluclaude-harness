import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { analyze } from '../../introspector/index.js';
import { generateEvalSpec, generateEvalSpecInteractive } from '../../analyzer/index.js';
import {
  style,
  icons,
  header,
  step,
  keyValue,
  Spinner,
  formatError,
  nextSteps,
  box,
  BANNER_MINIMAL,
} from '../theme.js';

interface StructuredQuestion {
  questions: {
    question: string;
    header?: string;
    options?: {
      label: string;
      description?: string;
    }[];
    multiSelect?: boolean;
  }[];
}

async function handleQuestion(questionData: string): Promise<string> {
  const { default: inquirer } = await import('inquirer');
  
  let parsed: StructuredQuestion | null = null;
  try {
    parsed = JSON.parse(questionData);
  } catch {
    // Not JSON, treat as plain text
  }

  if (parsed?.questions && Array.isArray(parsed.questions)) {
    const answers: string[] = [];
    
    for (const q of parsed.questions) {
      console.log(`\n${style.highlight(icons.brain)} ${style.bold(q.header || 'Question')}:\n`);
      
      if (q.options && q.options.length > 0) {
        const choices = q.options.map(opt => ({
          name: opt.description ? `${style.bold(opt.label)} ${style.dim('─')} ${opt.description}` : opt.label,
          value: opt.label,
        }));

        const { selection } = await inquirer.prompt([{
          type: q.multiSelect ? 'checkbox' : 'list',
          name: 'selection',
          message: style.info(q.question),
          choices,
        }]);
        
        answers.push(Array.isArray(selection) ? selection.join(', ') : selection);
      } else {
        const { answer } = await inquirer.prompt([{
          type: 'input',
          name: 'answer',
          message: style.info(q.question),
        }]);
        answers.push(answer);
      }
    }
    
    return answers.join('\n');
  }
  
  // Fallback: plain text question
  const { answer } = await inquirer.prompt([{
    type: 'input',
    name: 'answer',
    message: `${style.highlight(icons.brain)} ${style.bold('Claude asks:')} ${questionData}`,
  }]);
  
  return answer;
}

export const analyzeCommand = new Command('analyze')
  .description('Analyze a codebase and generate EvalSpec using Claude')
  .argument('[path]', 'Path to the repository to analyze', '.')
  .option('-o, --output <file>', 'Output file for the EvalSpec JSON')
  .option('-i, --interactive', 'Enable interactive mode with clarifying questions')
  .option('--focus <modules>', 'Comma-separated list of modules/functions to focus on')
  .option('--max-scenarios <n>', 'Maximum number of test scenarios to generate', '10')
  .option('--quiet', 'Suppress progress messages')
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude analyze .')}                    ${style.dim('Analyze current directory')}
  ${style.command('evaluclaude analyze ./src -o spec.json')}   ${style.dim('Save output to file')}
  ${style.command('evaluclaude analyze . -i')}                 ${style.dim('Interactive mode with questions')}
  ${style.command('evaluclaude analyze . --focus auth,api')}   ${style.dim('Focus on specific modules')}
  ${style.command('evaluclaude analyze . --max-scenarios 20')} ${style.dim('Generate more scenarios')}
`)
  .action(async (repoPath: string, options: AnalyzeOptions) => {
    const absolutePath = path.resolve(repoPath);
    const quiet = options.quiet;

    if (!quiet) {
      console.log(`\n${BANNER_MINIMAL}\n`);
      console.log(header('Analyze Codebase'));
      console.log(keyValue('Path', style.path(absolutePath)));
      console.log();
    }

    try {
      // Step 1: Tree-sitter introspection
      const introSpinner = quiet ? null : new Spinner('Running tree-sitter introspection...');
      introSpinner?.start();

      const repoSummary = await analyze({
        root: absolutePath,
        onProgress: quiet ? undefined : (msg) => introSpinner?.update(`Introspecting: ${msg}`),
      });

      introSpinner?.succeed('Tree-sitter introspection complete');

      // Step 2: Claude analysis
      const claudeSpinner = quiet ? null : new Spinner('Generating EvalSpec with Claude...');
      claudeSpinner?.start();

      const focus = options.focus?.split(',').map(s => s.trim());
      const maxScenarios = parseInt(options.maxScenarios, 10);

      let result;

      if (options.interactive) {
        claudeSpinner?.stop();
        console.log(`\n${style.info(icons.info)} ${style.bold('Interactive mode enabled')}\n`);
        
        result = await generateEvalSpecInteractive(
          repoSummary,
          handleQuestion,
          { focus, maxScenarios }
        );
      } else {
        result = await generateEvalSpec(repoSummary, {
          interactive: false,
          focus,
          maxScenarios,
        });
        claudeSpinner?.succeed('EvalSpec generated with Claude');
      }

      const { spec, tokensUsed, questionsAsked } = result;

      // Results summary
      if (!quiet) {
        console.log();
        console.log(`${style.success(icons.success)} ${style.bold('EvalSpec generated successfully!')}`);
        console.log();
        console.log(`  ${style.primary(box.vertical)} ${keyValue('Scenarios', style.number(String(spec.scenarios.length)))}`);
        console.log(`  ${style.primary(box.vertical)} ${keyValue('Tokens used', style.number(String(tokensUsed)))}`);
        console.log(`  ${style.primary(box.vertical)} ${keyValue('Questions asked', style.number(String(questionsAsked)))}`);
        console.log(`  ${style.primary(box.vertical)} ${keyValue('Confidence', style.highlight(spec.metadata.confidence))}`);
      }

      const json = JSON.stringify(spec, null, 2);

      if (options.output) {
        await fs.writeFile(options.output, json);
        if (!quiet) {
          console.log();
          console.log(`${style.success(icons.success)} Written to: ${style.path(options.output)}`);
          console.log(nextSteps([
            { command: `evaluclaude render ${options.output}`, description: 'Render tests from the spec' },
            { command: `evaluclaude pipeline . -o ./tests`, description: 'Run the full pipeline' },
          ]));
        }
      } else {
        console.log('\n' + json);
        if (!quiet) {
          console.log(nextSteps([
            { command: 'evaluclaude analyze . -o spec.json', description: 'Save the spec to a file' },
            { command: 'evaluclaude render spec.json', description: 'Then render tests from it' },
          ]));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(formatError(message, [
        'Check that the path exists and contains source files',
        'Ensure ANTHROPIC_API_KEY is set in your environment',
        'Try running with --quiet to see raw errors',
        'Use evaluclaude intro <path> to verify introspection works',
      ]));
      process.exit(1);
    }
  });

interface AnalyzeOptions {
  output?: string;
  interactive?: boolean;
  focus?: string;
  maxScenarios: string;
  quiet?: boolean;
}
