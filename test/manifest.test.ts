import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';

const manifestSchema = z.object({
  permissions: z.array(z.string()),
  host_permissions: z.optional(z.array(z.string())),
  background: z.object({ service_worker: z.string() }),
  content_scripts: z.array(
    z.object({ matches: z.array(z.string()), js: z.array(z.string()), run_at: z.optional(z.string()), world: z.optional(z.string()) }),
  ),
  content_security_policy: z.object({ extension_pages: z.string() }),
});
const manifest = manifestSchema.parse(JSON.parse(readFileSync('static/manifest.json', 'utf8')));
const buildScript = readFileSync('scripts/build.mjs', 'utf8');

describe('manifest', () => {
  it('asks only for storage, and no host access beyond its content scripts', () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.permissions).toEqual(['storage']);
  });

  it('only runs the page-world script on Autotrader', () => {
    const pageWorldScripts = manifest.content_scripts.filter((script) => script.world === 'MAIN');
    expect(pageWorldScripts).toEqual([
      { matches: ['https://www.autotrader.co.uk/*'], js: ['pageHook.js'], run_at: 'document_start', world: 'MAIN' },
    ]);
  });

  it('names only scripts the build produces', () => {
    const scripts = [...manifest.content_scripts.flatMap((script) => script.js), manifest.background.service_worker];
    for (const script of scripts) expect(buildScript).toContain(`${script.replace(/\.js$/, '')}: 'src/`);
  });

  it('keeps a strict policy for its own pages', () => {
    expect(manifest.content_security_policy.extension_pages).toMatch(/^script-src 'self'; object-src 'none'/);
  });
});
