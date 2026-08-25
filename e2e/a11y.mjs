/**
 * 접근성 자동 검사 (구현 계획 11단계 QA — 세 공개 화면 Lighthouse ≥ 95).
 * 전제: apps/site/out에 고정 교재가 발행된 산출물이 있다 (pnpm e2e가 만든다).
 * CI에서 e2e 다음에 돈다. 크롬은 Playwright가 설치한 것을 그대로 쓴다.
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(repo, "apps", "site", "out");
const THRESHOLD = 95;
const PAGES = ["/", "/fixture-course/", "/fixture-course/01-intro/"];

if (!existsSync(join(outDir, "fixture-course", "index.html"))) {
  console.error("고정 교재 산출물이 없습니다 — 먼저 pnpm e2e를 실행하십시오");
  process.exit(1);
}

const server = spawn("node", [join(repo, "e2e", "serve.mjs"), "4179"], { stdio: "ignore" });
const tmp = mkdtempSync(join(tmpdir(), "oc-a11y-"));
let failed = false;

try {
  await new Promise((r) => setTimeout(r, 800));
  for (const page of PAGES) {
    const report = join(tmp, `${page.replaceAll("/", "_")}.json`);
    execFileSync(
      "npx",
      [
        "--yes",
        "lighthouse",
        `http://127.0.0.1:4179${page}`,
        "--only-categories=accessibility",
        "--chrome-flags=--headless --no-sandbox",
        "--output=json",
        `--output-path=${report}`,
        "--quiet",
      ],
      { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, stdio: "pipe" },
    );
    const result = JSON.parse(readFileSync(report, "utf8"));
    const score = Math.round(result.categories.accessibility.score * 100);
    const ok = score >= THRESHOLD;
    if (!ok) failed = true;
    console.log(`${ok ? "✓" : "✗"} ${page} 접근성 ${score} (기준 ${THRESHOLD})`);
    if (!ok) {
      for (const [id, audit] of Object.entries(result.audits)) {
        if (
          audit.score !== null &&
          audit.score < 1 &&
          result.categories.accessibility.auditRefs.some((r) => r.id === id)
        ) {
          console.log(`   - ${id}: ${audit.title}`);
        }
      }
    }
  }
} finally {
  server.kill();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
