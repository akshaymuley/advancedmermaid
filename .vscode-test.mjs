import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/test/suite.test.js',
  // The repository itself: a real git repo with samples/pipeline.mmd committed, so the tests
  // exercise the built-in vscode.git API rather than a stand-in.
  workspaceFolder: '.',
  // Workspace trust would otherwise gate the built-in Git extension behind a modal the tests
  // can't answer. Other extensions are deliberately left enabled — vscode.git is under test.
  launchArgs: ['--disable-workspace-trust'],
  mocha: {
    ui: 'bdd',
    timeout: 30000,
  },
});
