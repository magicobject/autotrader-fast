// Zips dist/ into autotrader-fast-<version>.zip, for passing to someone or keeping a copy.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const zipName = `autotrader-fast-${version}.zip`;
execFileSync('zip', ['-qr', `../${zipName}`, '.'], { cwd: 'dist', stdio: 'inherit' });
console.log(`Wrote ${zipName}`);
