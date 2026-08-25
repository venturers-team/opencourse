import { defineConfig } from "@playwright/test";

/**
 * 백엔드 통합 시험 (구현 계획 10단계 "증명하는 방법"의 로컬판).
 * 전제: `supabase start`로 로컬 스택이 떠 있다 (클라우드 프로젝트·과금 없음).
 * 실행: pnpm e2e:backend
 */
export default defineConfig({
  testDir: ".",
  testMatch: /backend\.spec\.ts/,
  timeout: 60_000,
  workers: 1, // 카운터를 다루므로 순차 실행
  reporter: [["list"]],
});
