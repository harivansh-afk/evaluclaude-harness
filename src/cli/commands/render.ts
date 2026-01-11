import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { renderSpec, detectFramework, type Framework } from '../../renderers/index.js';
import type { EvalSpec } from '../../analyzer/types.js';

export const renderCommand = new Command('render')
  .description('Render EvalSpec JSON into runnable test files')
  .argument('<spec>', 'Path to EvalSpec JSON file')
  .option('-o, --output <dir>', 'Output directory for test files', './tests/generated')
  .option('-f, --framework <framework>', 'Test framework (pytest, vitest, jest)')
  .option('--fixtures', 'Generate fixture stubs', false)
  .option('--mocks', 'Generate mock stubs', false)
  .option('--dry-run', 'Preview without writing files', false)
  .action(async (specPath: string, options) => {
    try {
      if (!existsSync(specPath)) {
        console.error(`Error: Spec file not found: ${specPath}`);
        process.exit(1);
      }

      const specContent = readFileSync(specPath, 'utf-8');
      const spec: EvalSpec = JSON.parse(specContent);

      const framework = (options.framework as Framework) || detectFramework(spec);
      
      console.log(`Rendering ${spec.scenarios.length} scenarios with ${framework}...`);

      const result = await renderSpec(spec, {
        outputDir: options.output,
        framework,
        includeFixtures: options.fixtures,
        generateMocks: options.mocks,
        dryRun: options.dryRun,
      });

      if (options.dryRun) {
        console.log('\n--- DRY RUN ---\n');
        for (const file of result.files) {
          console.log(`📄 ${file.path}`);
          console.log('---');
          console.log(file.content);
          console.log('---\n');
        }
      }

      console.log(`\n✅ Rendered ${result.stats.scenarioCount} scenarios`);
      console.log(`   📁 ${result.stats.fileCount} test files`);
      console.log(`   🔍 ${result.stats.assertionCount} assertions`);
      
      if (result.stats.skippedCount > 0) {
        console.log(`   ⏭️  ${result.stats.skippedCount} scenarios skipped (LLM rubric assertions)`);
      }

      if (!options.dryRun) {
        console.log(`\n📂 Output: ${options.output}`);
      }
    } catch (error) {
      console.error('Error rendering spec:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
