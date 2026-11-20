import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (dist/) into Chrome and serve made-up Autotrader and
// GOV.UK pages from test/fixtures, so nothing touches the real sites. Run `npm run build` first
// (`npm run test:e2e` does). Needs a Chrome that allows --load-extension, such as Chrome for Testing;
// set CHROME_PATH if it isn't at the default location.
export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
});
