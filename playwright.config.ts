import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);
const unitOnly = process.argv.includes('--project=unit');

/**
 * Two projects:
 * - unit: pure TypeScript (geometry, parts list) — no browser.
 * - e2e:  drives the production build in headless Chromium, including
 *         WebGL for the 3D view (software-rendered via SwiftShader).
 *
 * Run `npm run build` first; the e2e web server serves the build.
 * Set PW_CHROMIUM_EXECUTABLE to use a preinstalled Chromium instead of
 * the one `npx playwright install chromium` downloads.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'unit', testDir: './tests/unit' },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1500, height: 900 },
        launchOptions: {
          executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined,
          args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: unitOnly ? undefined : {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
