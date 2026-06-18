import { defineConfig } from 'vite';

// Bundle <plasma-bg> + the core engine into one self-contained ESM file.
// Target budget: < 15 KB gzip (zod is tree-shaken out — the embed trusts its config).
export default defineConfig({
  build: {
    lib: {
      entry: 'src/plasma-bg.ts',
      formats: ['es'],
      fileName: () => 'plasma-bg.js',
    },
    rollupOptions: {
      // bundle @effects/core in (no externals) so the snippet is drop-in
      output: { inlineDynamicImports: true },
    },
    target: 'es2020',
    minify: 'esbuild',
  },
});
