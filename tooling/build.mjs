import { build } from 'esbuild';
const shared = { outdir: 'dist-electron', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], outExtension: { '.js': '.cjs' }, sourcemap: true };
await build({ ...shared, entryPoints: ['electron/preload.ts'] });
await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  banner: { js: 'var import_meta_url = require("url").pathToFileURL(__filename).href;' },
  define: { 'import.meta.url': 'import_meta_url' },
});
