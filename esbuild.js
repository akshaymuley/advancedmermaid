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

  if (watch) {
    await Promise.all([extension.watch(), webview.watch()]);
    console.log('watching...');
  } else {
    await extension.rebuild();
    await webview.rebuild();
    await extension.dispose();
    await webview.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
