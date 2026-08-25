import { defineConfig } from "@playwright/test";

/**
 * 두 표적:
 *  - public: 정적 산출물(apps/site/out)을 단순 파일 서버로 — 서버 의존 없음의 증명
 *  - preview: 미리보기 빌드(.next-preview)를 next start로 — 스타일 가이드 상태 전수 검사
 */
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  projects: [
    {
      name: "public",
      testMatch: /site\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4173" },
    },
    {
      name: "preview",
      testMatch: /styleguide\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4174" },
    },
  ],
  webServer: [
    {
      command: "node serve.mjs 4173",
      port: 4173,
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter @opencourse/site exec next start --port 4174",
      port: 4174,
      reuseExistingServer: true,
      timeout: 60_000,
      env: { OPENCOURSE_PREVIEW: "1" },
    },
  ],
});
