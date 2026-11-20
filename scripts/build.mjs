// Builds the extension into dist/ (load dist/ in chrome://extensions with "Load unpacked").
// Plain JavaScript on purpose: it is a build script with no types worth having.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const outputFolder = 'dist';
rmSync(outputFolder, { recursive: true, force: true });
mkdirSync(outputFolder);

await build({
  entryPoints: {
    pageHook: 'src/autotrader/pageHook.ts',
    contentScript: 'src/autotrader/contentScript.ts',
    motResultsPage: 'src/mot/motResultsPage.ts',
    serviceWorker: 'src/background/serviceWorker.ts',
  },
  outdir: outputFolder,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  legalComments: 'none',
  minify: true,
  sourcemap: 'linked',
  logLevel: 'warning',
});

cpSync('static', outputFolder, { recursive: true });

// Keep the manifest's version in step with package.json, so there is one source for it.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const manifestPath = `${outputFolder}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built version ${version} into ${outputFolder}/`);
