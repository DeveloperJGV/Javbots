const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Extension version read from package.json at build time, inlined via esbuild `define`. */
const pkgVersion = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'),
).version;
const versionDefine = {
  'process.env.PIXEL_AGENTS_VERSION': JSON.stringify(pkgVersion),
};

/**
 * Copy assets folder to dist/assets
 */
function copyAssets() {
  const srcDir = path.join(__dirname, 'webview-ui', 'public', 'assets');
  const dstDir = path.join(__dirname, 'dist', 'assets');

  if (fs.existsSync(srcDir)) {
    // Remove existing dist/assets if present
    if (fs.existsSync(dstDir)) {
      fs.rmSync(dstDir, { recursive: true });
    }

    // Copy recursively
    fs.cpSync(srcDir, dstDir, { recursive: true });
    console.log('✓ Copied assets/ → dist/assets/');
  } else {
    console.log('ℹ️  assets/ folder not found (optional)');
  }
  copyFeatureFiles();
  copyPackFiles();
}

/**
 * Private packs (privado/<pack>/ with a pack.json, never committed): pack.json, planos/ and assets/ go to
 * dist/packs/<pack>/ (server/src/packLoader.ts reads them), and the furniture of its features joins
 * dist/assets/furniture like a public feature's. Without privado/ (the public build) nothing happens.
 */
function copyPackFiles() {
  const privado = path.join(__dirname, 'privado');
  const out = path.join(__dirname, 'dist', 'packs');
  fs.rmSync(out, { recursive: true, force: true });
  if (!fs.existsSync(privado)) return;
  for (const pack of fs.readdirSync(privado)) {
    const packDir = path.join(privado, pack);
    if (!fs.existsSync(path.join(packDir, 'pack.json'))) continue;
    const dst = path.join(out, pack);
    fs.mkdirSync(dst, { recursive: true });
    fs.copyFileSync(path.join(packDir, 'pack.json'), path.join(dst, 'pack.json'));
    for (const sub of ['planos', 'assets']) {
      const src = path.join(packDir, sub);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(dst, sub), { recursive: true });
    }
    const features = path.join(packDir, 'features');
    if (fs.existsSync(features)) {
      for (const name of fs.readdirSync(features)) {
        const furniture = path.join(features, name, 'assets', 'furniture');
        if (fs.existsSync(furniture)) {
          fs.cpSync(furniture, path.join(__dirname, 'dist', 'assets', 'furniture'), {
            recursive: true,
          });
        }
      }
    }
    console.log(`✓ Copied privado/${pack}/ → dist/packs/${pack}/`);
  }
}

/**
 * Optional features (features/<name>/) bring their own furniture and support
 * files: furniture joins dist/assets/furniture (the server loads it like any
 * other), support files go to dist/<name>/.
 */
function copyFeatureFiles() {
  const featuresDir = path.join(__dirname, 'features');
  if (!fs.existsSync(featuresDir)) return;
  for (const name of fs.readdirSync(featuresDir)) {
    const furniture = path.join(featuresDir, name, 'assets', 'furniture');
    if (fs.existsSync(furniture)) {
      fs.cpSync(furniture, path.join(__dirname, 'dist', 'assets', 'furniture'), {
        recursive: true,
      });
    }
    const spicetify = path.join(featuresDir, name, 'spicetify');
    if (fs.existsSync(spicetify)) {
      fs.cpSync(spicetify, path.join(__dirname, 'dist', name, 'spicetify'), { recursive: true });
    }
    console.log(`✓ Copied features/${name}/ → dist/`);
  }
}

/**
 * Bundle hook scripts (TypeScript) to dist/hooks via esbuild.
 * Produces a self-contained CJS file with shebang for Claude Code to execute.
 */
function buildHooks() {
  const entry = path.join(
    __dirname,
    'server',
    'src',
    'providers',
    'hook',
    'claude',
    'hooks',
    'claude-hook.ts',
  );
  if (!fs.existsSync(entry)) return;
  require('esbuild').buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outdir: path.join(__dirname, 'dist', 'hooks'),
    banner: { js: '#!/usr/bin/env node' },
  });
  console.log('✓ Built hooks/ → dist/hooks/');
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['adapters/vscode/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    define: versionDefine,
    logLevel: 'silent',
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    // Copy assets and hooks after build
    copyAssets();
    buildHooks();
    await buildCli();
    await buildUninstall();
  }
}

/** Bundle the vscode:uninstall hook — plain Node, runs after extension removal. */
async function buildUninstall() {
  await esbuild.build({
    entryPoints: ['adapters/vscode/uninstall.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: false,
    platform: 'node',
    outfile: 'dist/uninstall.js',
    define: versionDefine,
    logLevel: 'silent',
  });
}

/** Bundle the standalone CLI entry point. */
async function buildCli() {
  await esbuild.build({
    entryPoints: ['server/src/cli.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    platform: 'node',
    outfile: 'dist/cli.js',
    external: ['fastify', '@fastify/websocket', '@fastify/static', '@fastify/cors'],
    define: versionDefine,
    logLevel: 'silent',
  });
  if (!production) {
    console.log('[build] CLI bundled: dist/cli.mjs');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
