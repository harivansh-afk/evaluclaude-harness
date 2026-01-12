import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { gradeWithRubric, loadAllRubrics, analyzeCalibration, calibrate } from '../../graders/index.js';
import type { CalibrationExample } from '../../graders/types.js';
import { style, icons, Spinner, formatError, progressBar, subheader, keyValue } from '../theme.js';

export const gradeCommand = new Command('grade')
  .description('Grade output using LLM rubric')
  .argument('<input>', 'Path to input file or string to grade')
  .option('-r, --rubric <name>', 'Rubric name or path', 'code-quality')
  .option('--rubrics-dir <dir>', 'Directory containing rubric YAML files', 'rubrics')
  .option('--json', 'Output result as JSON', false)
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude grade output.txt')}              ${style.dim('Grade file with default rubric')}
  ${style.command('evaluclaude grade output.txt -r safety')}    ${style.dim('Use specific rubric')}
  ${style.command('evaluclaude grade "inline text" --json')}    ${style.dim('Grade string, output JSON')}
`)
  .action(async (input: string, options) => {
    try {
      let content: string;
      
      if (existsSync(input)) {
        content = readFileSync(input, 'utf-8');
      } else {
        content = input;
      }

      const spinner = new Spinner(`Grading with rubric ${style.highlight(options.rubric)}...`);
      spinner.start();
      
      const result = await gradeWithRubric(content, options.rubric, {
        rubricsDir: options.rubricsDir,
      });

      if (options.json) {
        spinner.stop();
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.pass) {
        spinner.succeed(`Graded with rubric ${style.highlight(options.rubric)}`);
      } else {
        spinner.fail(`Graded with rubric ${style.highlight(options.rubric)}`);
      }

      console.log();
      console.log(result.pass 
        ? `${style.success(icons.passed)} ${style.bold(style.success('PASS'))}` 
        : `${style.error(icons.failed)} ${style.bold(style.error('FAIL'))}`);
      console.log(keyValue('Score', style.number(`${(result.score * 100).toFixed(1)}%`)));
      console.log();
      console.log(keyValue('Summary', result.reason));
      
      console.log(subheader('Criterion Scores'));
      for (const cs of result.criterionScores) {
        const bar = progressBar(cs.score, 1, 20);
        console.log(`  ${style.bold(cs.name)}: ${bar}`);
        console.log(`    ${style.dim(cs.feedback)}`);
      }
    } catch (error) {
      console.error(formatError(
        error instanceof Error ? error.message : String(error),
        [
          'Check that the rubric exists in the rubrics directory',
          'Ensure ANTHROPIC_API_KEY is set',
          `Run ${style.command('evaluclaude rubrics')} to list available rubrics`,
        ]
      ));
      process.exit(1);
    }
  });

export const listRubricsCommand = new Command('rubrics')
  .description('List available rubrics')
  .option('--rubrics-dir <dir>', 'Directory containing rubric YAML files', 'rubrics')
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude rubrics')}                       ${style.dim('List all rubrics')}
  ${style.command('evaluclaude rubrics --rubrics-dir ./my-rubrics')}  ${style.dim('Use custom directory')}
`)
  .action(async (options) => {
    try {
      const rubrics = loadAllRubrics(options.rubricsDir);
      
      if (rubrics.size === 0) {
        console.log(formatError(
          `No rubrics found in ${style.path(options.rubricsDir)}`,
          [
            'Create rubric YAML files in the rubrics directory',
            'Use --rubrics-dir to specify a different location',
          ]
        ));
        return;
      }

      console.log(subheader(`Available Rubrics (${style.number(String(rubrics.size))})`));
      console.log();
      
      for (const [name, rubric] of rubrics) {
        console.log(`${icons.spec} ${style.bold(style.primary(name))}`);
        console.log(keyValue('Description', rubric.description, 1));
        console.log(keyValue('Threshold', style.number(`${(rubric.passingThreshold * 100).toFixed(0)}%`), 1));
        console.log(keyValue('Criteria', rubric.criteria.map(c => style.highlight(c.name)).join(', '), 1));
        console.log();
      }
    } catch (error) {
      console.error(formatError(
        error instanceof Error ? error.message : String(error),
        [
          'Check that the rubrics directory exists',
          'Ensure rubric files are valid YAML',
        ]
      ));
      process.exit(1);
    }
  });

export const calibrateCommand = new Command('calibrate')
  .description('Calibrate a rubric against known examples')
  .argument('<rubric>', 'Rubric name or path')
  .argument('<examples>', 'Path to calibration examples JSON')
  .option('--rubrics-dir <dir>', 'Directory containing rubric YAML files', 'rubrics')
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude calibrate code-quality examples.json')}  ${style.dim('Calibrate with examples')}

${style.bold('Examples file format:')}
  ${style.dim('[')}
    ${style.dim('{ "content": "...", "expectedPass": true, "expectedScore": 0.8 },')}
    ${style.dim('{ "content": "...", "expectedPass": false }')}
  ${style.dim(']')}
`)
  .action(async (rubricName: string, examplesPath: string, options) => {
    try {
      if (!existsSync(examplesPath)) {
        console.error(formatError(
          `Examples file not found: ${style.path(examplesPath)}`,
          [
            'Check that the file path is correct',
            'Ensure the file exists and is readable',
          ]
        ));
        process.exit(1);
      }

      const examples: CalibrationExample[] = JSON.parse(readFileSync(examplesPath, 'utf-8'));
      
      const spinner = new Spinner(`Calibrating rubric ${style.highlight(rubricName)} with ${style.number(String(examples.length))} examples...`);
      spinner.start();
      
      const result = await calibrate(rubricName, examples, {
        rubricsDir: options.rubricsDir,
      });

      spinner.succeed(`Calibration complete for ${style.highlight(rubricName)}`);
      console.log('\n' + analyzeCalibration(result));
    } catch (error) {
      console.error(formatError(
        error instanceof Error ? error.message : String(error),
        [
          'Check that the rubric exists',
          'Ensure the examples file is valid JSON',
          'Ensure ANTHROPIC_API_KEY is set',
        ]
      ));
      process.exit(1);
    }
  });
