import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { gradeWithRubric, loadAllRubrics, analyzeCalibration, calibrate } from '../../graders/index.js';
import type { CalibrationExample } from '../../graders/types.js';

export const gradeCommand = new Command('grade')
  .description('Grade output using LLM rubric')
  .argument('<input>', 'Path to input file or string to grade')
  .option('-r, --rubric <name>', 'Rubric name or path', 'code-quality')
  .option('--rubrics-dir <dir>', 'Directory containing rubric YAML files', 'rubrics')
  .option('--json', 'Output result as JSON', false)
  .action(async (input: string, options) => {
    try {
      let content: string;
      
      if (existsSync(input)) {
        content = readFileSync(input, 'utf-8');
      } else {
        content = input;
      }

      console.log(`Grading with rubric: ${options.rubric}`);
      
      const result = await gradeWithRubric(content, options.rubric, {
        rubricsDir: options.rubricsDir,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\n${result.pass ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`Score: ${(result.score * 100).toFixed(1)}%`);
      console.log(`\nSummary: ${result.reason}`);
      
      console.log('\nCriterion Scores:');
      for (const cs of result.criterionScores) {
        const bar = '█'.repeat(Math.round(cs.score * 10)) + '░'.repeat(10 - Math.round(cs.score * 10));
        console.log(`  ${cs.name}: ${bar} ${(cs.score * 100).toFixed(0)}%`);
        console.log(`    ${cs.feedback}`);
      }
    } catch (error) {
      console.error('Error grading:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export const listRubricsCommand = new Command('rubrics')
  .description('List available rubrics')
  .option('--rubrics-dir <dir>', 'Directory containing rubric YAML files', 'rubrics')
  .action(async (options) => {
    try {
      const rubrics = loadAllRubrics(options.rubricsDir);
      
      if (rubrics.size === 0) {
        console.log(`No rubrics found in ${options.rubricsDir}`);
        return;
      }

      console.log(`Available rubrics (${rubrics.size}):\n`);
      
      for (const [name, rubric] of rubrics) {
        console.log(`📋 ${name}`);
        console.log(`   ${rubric.description}`);
        console.log(`   Threshold: ${(rubric.passingThreshold * 100).toFixed(0)}%`);
        console.log(`   Criteria: ${rubric.criteria.map(c => c.name).join(', ')}`);
        console.log('');
      }
    } catch (error) {
      console.error('Error listing rubrics:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export const calibrateCommand = new Command('calibrate')
  .description('Calibrate a rubric against known examples')
  .argument('<rubric>', 'Rubric name or path')
  .argument('<examples>', 'Path to calibration examples JSON')
  .option('--rubrics-dir <dir>', 'Directory containing rubric YAML files', 'rubrics')
  .action(async (rubricName: string, examplesPath: string, options) => {
    try {
      if (!existsSync(examplesPath)) {
        console.error(`Examples file not found: ${examplesPath}`);
        process.exit(1);
      }

      const examples: CalibrationExample[] = JSON.parse(readFileSync(examplesPath, 'utf-8'));
      
      console.log(`Calibrating rubric '${rubricName}' with ${examples.length} examples...`);
      
      const result = await calibrate(rubricName, examples, {
        rubricsDir: options.rubricsDir,
      });

      console.log('\n' + analyzeCalibration(result));
    } catch (error) {
      console.error('Error calibrating:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
