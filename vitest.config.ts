import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // The integration suite is mocha running inside a real VS Code, not Vitest — see
    // .vscode-test.mjs and `npm run test:integration`.
    exclude: ['src/test/integration/**'],
  },
  resolve: {
    // Unit tests import the real source, which imports 'vscode' — a module that only
    // exists inside the VS Code host. Point it at our hand-rolled mock instead.
    alias: { vscode: path.resolve(__dirname, 'src/test/vscode-mock.ts') },
  },
});
