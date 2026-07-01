const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const entries = [
  { in: 'src/webview/editor/main.ts', out: 'media/editor.js' },
  { in: 'src/webview/mapEditor/main.ts', out: 'media/map-editor.js' },
  { in: 'src/webview/animation/main.ts', out: 'media/animation.js' },
];

async function build() {
  const ctxs = await Promise.all(entries.map((e) => esbuild.context({
    entryPoints: [e.in],
    outfile: e.out,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
  })));

  if (watch) {
    await Promise.all(ctxs.map((c) => c.watch()));
  } else {
    await Promise.all(ctxs.map((c) => c.rebuild()));
    await Promise.all(ctxs.map((c) => c.dispose()));
  }
}

build().catch(() => process.exit(1));
