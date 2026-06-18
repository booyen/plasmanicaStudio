import { defineConfig } from '@playwright/test';

// Visual goldens for the plasma engine. Pinned to the bundled Chromium with
// SwiftShader (software GL) so renders are reproducible across machines without a
// real GPU. Tolerances absorb the small residual variance of software rasterization.
export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  webServer: {
    command: 'pnpm --filter studio exec vite --port 5174 --strictPort',
    url: 'http://localhost:5174/golden.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:5174',
    deviceScaleFactor: 1,
    browserName: 'chromium',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle'],
    },
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.03, threshold: 0.25 },
  },
});
