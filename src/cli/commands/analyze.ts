import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { analyze } from '../../introspector/index.js';
import { generateEvalSpec, generateEvalSpecInteractive } from '../../analyzer/index.js';

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
  
  // Try to parse as structured question
  let parsed: StructuredQuestion | null = null;
  try {
    parsed = JSON.parse(questionData);
  } catch {
    // Not JSON, treat as plain text
  }

  if (parsed?.questions && Array.isArray(parsed.questions)) {
    const answers: string[] = [];
    
    for (const q of parsed.questions) {
      console.log(`\n🤖 ${q.header || 'Question'}:\n`);
      
      if (q.options && q.options.length > 0) {
        // Render as selection
        const choices = q.options.map(opt => ({
          name: opt.description ? `${opt.label} - ${opt.description}` : opt.label,
          value: opt.label,
        }));

        const { selection } = await inquirer.prompt([{
          type: q.multiSelect ? 'checkbox' : 'list',
          name: 'selection',
          message: q.question,
          choices,
        }]);
        
        answers.push(Array.isArray(selection) ? selection.join(', ') : selection);
      } else {
        // Plain text input
        const { answer } = await inquirer.prompt([{
          type: 'input',
          name: 'answer',
          message: q.question,
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
    message: `🤖 Claude asks: ${questionData}`,
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
  .action(async (repoPath: string, options: AnalyzeOptions) => {
    const absolutePath = path.resolve(repoPath);
    const log = options.quiet ? () => {} : console.log;

    log(`\n🔬 Analyzing codebase: ${absolutePath}\n`);

    try {
      log('Step 1: Running tree-sitter introspection...');
      const repoSummary = await analyze({
        root: absolutePath,
        onProgress: options.quiet ? undefined : (msg) => log(`  ${msg}`),
      });

      log(`\nStep 2: Generating EvalSpec with Claude...\n`);

      const focus = options.focus?.split(',').map(s => s.trim());
      const maxScenarios = parseInt(options.maxScenarios, 10);

      let result;

      if (options.interactive) {
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
      }

      const { spec, tokensUsed, questionsAsked } = result;

      log('\n✅ EvalSpec generated successfully!');
      log(`   Scenarios: ${spec.scenarios.length}`);
      log(`   Tokens used: ${tokensUsed}`);
      log(`   Questions asked: ${questionsAsked}`);
      log(`   Confidence: ${spec.metadata.confidence}`);

      const json = JSON.stringify(spec, null, 2);

      if (options.output) {
        await fs.writeFile(options.output, json);
        log(`\n📄 Written to: ${options.output}`);
      } else {
        console.log('\n' + json);
      }
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
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
