/**
 * 8단계 E2E 실행기 (구현 계획 8단계 "증명하는 방법" 전부):
 *   1. 임시 콘텐츠 뿌리 생성 — 발행 1권 + 초안 1권
 *   2. 미리보기 모드로 빌드 → 정적 산출물(out/)이 아예 생기지 않는다 (구조적 차단)
 *   3. 공개 모드로 빌드 → 산출물에 발행 교재만 있고 초안은 없다
 *   4. Playwright — 단순 파일 서버로 띄운 산출물에 대해 화면·키보드·404·사이트맵 검증
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeRoot } from "./make-root.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(repo, "apps", "site", "out");
const root = join(tmpdir(), `oc-e2e-root-${process.pid}`);

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: repo,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    console.error(`실패: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function fail(msg) {
  console.error(`E2E 실패: ${msg}`);
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
}

console.log("1) 임시 콘텐츠 뿌리 생성");
makeRoot(root);

console.log("2) 미리보기 모드 빌드 — 정적 산출물이 생기지 않아야 한다");
rmSync(outDir, { recursive: true, force: true });
run("pnpm", ["--filter", "@opencourse/site", "build"], {
  OPENCOURSE_ROOT: root,
  OPENCOURSE_PREVIEW: "1",
});
if (existsSync(outDir)) fail("미리보기 모드인데 out/이 생겼다 — 초안이 산출물에 들어갈 수 있다");
console.log("   확인: 미리보기 모드에서는 out/ 없음");

console.log("3) 공개 모드 빌드 — 발행 교재만 산출물에 있어야 한다");
run("pnpm", ["--filter", "@opencourse/site", "build"], {
  OPENCOURSE_ROOT: root,
  OPENCOURSE_PREVIEW: "",
});
if (!existsSync(join(outDir, "fixture-course", "index.html"))) fail("발행 교재 페이지가 없다");
if (!existsSync(join(outDir, "fixture-course", "01-intro", "index.html")))
  fail("발행 교재의 챕터 페이지가 없다");
if (existsSync(join(outDir, "draft-course"))) fail("초안 교재가 산출물에 들어갔다");
if (existsSync(join(outDir, "context", "draft-course"))) fail("초안 교재가 문맥 번들에 들어갔다");
console.log("   확인: 발행 교재만 산출물에 있음");

console.log("4) Playwright 검증");
const r = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", "--config", "e2e/playwright.config.ts"],
  { cwd: repo, stdio: "inherit", env: process.env },
);
rmSync(root, { recursive: true, force: true });
process.exit(r.status ?? 1);
