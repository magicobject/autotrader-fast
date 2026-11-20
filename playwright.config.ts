import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (dist/) into Chrome and serve made-up Autotrader and
// GOV.UK pages from test/fixtures, so nothing touches the real sites. Run `npm run build` first
// (`npm run test:e2e` does). Uses Playwright's own Chromium (`npx playwright install chromium` once);
// set CHROME_PATH to use a different Chromium-based browser that still allows --load-extension.
export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
});
