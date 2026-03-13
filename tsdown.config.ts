import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm'],
  target: 'node20',
  minify: false,
  sourcemap: true,
  dts: true,
  shims: true,  // 保留 shebang
  external: [
    'undici',
    'chokidar',
  ],
});