import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { renderSpec, detectFramework, type Framework } from '../../renderers/index.js';
import type { EvalSpec } from '../../analyzer/types.js';
import { style, icons, Spinner, formatError, nextSteps, keyValue } from '../theme.js';

export const renderCommand = new Command('render')
  .description('Render EvalSpec JSON into runnable test files')
  .argument('<spec>', 'Path to EvalSpec JSON file')
  .option('-o, --output <dir>', 'Output directory for test files', './tests/generated')
  .option('-f, --framework <framework>', 'Test framework (pytest, vitest, jest)')
  .option('--fixtures', 'Generate fixture stubs', false)
  .option('--mocks', 'Generate mock stubs', false)
  .option('--dry-run', 'Preview without writing files', false)
  .addHelpText('after', `
${style.bold('Examples:')}
  ${style.command('evaluclaude render spec.json')}              ${style.dim('Render with auto-detected framework')}
  ${style.command('evaluclaude render spec.json -f vitest')}    ${style.dim('Use Vitest framework')}
  ${style.command('evaluclaude render spec.json --dry-run')}    ${style.dim('Preview output without writing')}
  ${style.command('evaluclaude render spec.json --fixtures')}   ${style.dim('Include fixture stubs')}
`)
  .action(async (specPath: string, options) => {
    try {
      if (!existsSync(specPath)) {
        console.error(formatError(`Spec file not found: ${style.path(specPath)}`, [
          'Check that the spec file exists',
          'Run `evaluclaude analyze` to generate a spec file first',
          'Verify the path is correct',
        ]));
        process.exit(1);
      }

      const specContent = readFileSync(specPath, 'utf-8');
      let spec: EvalSpec;
      
      try {
        spec = JSON.parse(specContent);
      } catch {
        console.error(formatError('Invalid JSON in spec file', [
          'Ensure the file contains valid JSON',
          'Check for syntax errors in the spec file',
        ]));
        process.exit(1);
      }

      const framework = (options.framework as Framework) || detectFramework(spec);
      
      const spinner = new Spinner(`Rendering ${style.number(String(spec.scenarios.length))} scenarios with ${style.highlight(framework)}...`);
      spinner.start();

      const result = await renderSpec(spec, {
        outputDir: options.output,
        framework,
        includeFixtures: options.fixtures,
        generateMocks: options.mocks,
        dryRun: options.dryRun,
      });

      spinner.succeed(`Rendered ${style.number(String(spec.scenarios.length))} scenarios with ${style.highlight(framework)}`);

      if (options.dryRun) {
        console.log(`\n${style.warning('DRY RUN')} ${style.dim('─ Preview only, no files written')}\n`);
        for (const file of result.files) {
          console.log(`${icons.file} ${style.path(file.path)}`);
          console.log(style.dim('─'.repeat(50)));
          console.log(style.muted(file.content));
          console.log(style.dim('─'.repeat(50)) + '\n');
        }
      }

      console.log(`\n${style.success(icons.check)} ${style.bold('Render complete')}`);
      console.log(keyValue(`   ${icons.spec} Scenarios`, style.number(String(result.stats.scenarioCount)), 0));
      console.log(keyValue(`   ${icons.file} Test files`, style.number(String(result.stats.fileCount)), 0));
      console.log(keyValue(`   ${icons.magnify} Assertions`, style.number(String(result.stats.assertionCount)), 0));
      
      if (result.stats.skippedCount > 0) {
        console.log(keyValue(`   ${icons.skipped} Skipped`, `${style.number(String(result.stats.skippedCount))} ${style.dim('(LLM rubric assertions)')}`, 0));
      }

      if (!options.dryRun) {
        console.log(`\n${icons.folder} ${style.label('Output:')} ${style.path(options.output)}`);
        
        console.log(nextSteps([
          { command: `evaluclaude run ${options.output}`, description: 'Run the generated tests' },
          { command: `evaluclaude render ${specPath} --dry-run`, description: 'Preview changes before writing' },
        ]));
      }
    } catch (error) {
      console.error(formatError(
        error instanceof Error ? error.message : String(error),
        [
          'Check that the spec file is valid',
          'Ensure the output directory is writable',
          'Try running with --dry-run to debug',
        ]
      ));
      process.exit(1);
    }
  });
