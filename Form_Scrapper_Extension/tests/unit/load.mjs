/** Loads the extension's pure (DOM-free) modules into this Node process. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
for (const file of [
  '../../content/safety_policy.js',
  '../../content/regex_sampler.js',
  '../../content/dummy_data_generator.js',
  '../../shared/export_builder.js',
]) require(file);
export const PM = globalThis.PracticeMode;
