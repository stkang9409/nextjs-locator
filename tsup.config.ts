import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');

const USE_CLIENT_BANNER = '"use client";\n';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  treeshake: true,
  external: ['react', 'next'],
  define: {
    __VERSION__: JSON.stringify(version),
  },
  onSuccess: async () => {
    // Prepend "use client" directive to client output files only (not server/api)
    const files = ['dist/index.js', 'dist/index.cjs'];
    for (const file of files) {
      const filePath = join(process.cwd(), file);
      const content = readFileSync(filePath, 'utf-8');
      writeFileSync(filePath, USE_CLIENT_BANNER + content);
    }
  },
});
