import { defineConfig } from "@playwright/test";

/** 산출물(apps/site/out)을 단순 파일 서버로 띄워 검증한다 — 서버 의존 없음의 증명. */
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "node serve.mjs 4173",
    port: 4173,
    reuseExistingServer: true,
  },
});
