import { defineConfig } from "@playwright/test";
import fs from "node:fs";
const dataRoot = fs.mkdtempSync("/private/tmp/instaplanner-e2e-");
process.env.INSTAPLANNER_E2E_DATA_DIR = dataRoot;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3210",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3210/api/health",
    reuseExistingServer: false,
    timeout: 30000,
    env: { INSTAPLANNER_DATA_DIR: dataRoot, OPENAI_API_KEY: "" },
  },
});
