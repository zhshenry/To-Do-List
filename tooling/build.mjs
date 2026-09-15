import { build } from 'esbuild';
await build({ entryPoints: ['electron/main.ts', 'electron/preload.ts'], outdir: 'dist-electron', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], outExtension: { '.js': '.cjs' }, sourcemap: true });
