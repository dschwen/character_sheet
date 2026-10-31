import { defineConfig } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${String(port)}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 720 } },
    },
    {
      name: "narrow",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: `node scripts/serve-out.mjs out ${String(port)}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
