import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const desktop = { viewport: { width: 1280, height: 900 } };
const touch = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const localChrome = process.platform === "darwin" && existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || (localChrome ? "chrome" : undefined),
    trace: "retain-on-failure",
  },
  projects: [
    { name: "dev-desktop", use: desktop },
    { name: "build-desktop", use: desktop },
    { name: "dev-touch", use: touch },
    { name: "build-touch", use: touch },
  ],
});
