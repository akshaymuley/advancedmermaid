const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const extension = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: ['vscode'],
    outfile: 'dist/extension.js',
    sourcemap: !production,
    minify: production,
  });

  const webview = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'dist/webview.js',
    sourcemap: !production,
    minify: production,
  });

  const contexts = [extension, webview];

  // The Playwright harness (harness/index.html) is a development tool; keep it out of the .vsix.
  if (!production) {
    contexts.push(
      await esbuild.context({
        entryPoints: ['src/test/harness/main.ts'],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        outfile: 'dist/harness.js',
        sourcemap: true,
      })
    );
  }

  if (watch) {
    await Promise.all(contexts.map((c) => c.watch()));
    console.log('watching...');
  } else {
    for (const context of contexts) {
      await context.rebuild();
      await context.dispose();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
