import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    // Unit tests import the real source, which imports 'vscode' — a module that only
    // exists inside the VS Code host. Point it at our hand-rolled mock instead.
    alias: { vscode: path.resolve(__dirname, 'src/test/vscode-mock.ts') },
  },
});
