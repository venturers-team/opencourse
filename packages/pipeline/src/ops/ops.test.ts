import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMachineCheck, writeFixtureCourse } from "@opencourse/content";
import { computeMetrics } from "./metrics.js";
import { checkStatusBoard, renderStatusBoard, writeStatusBoard } from "./board.js";
import { initManualReview, recordManualReview } from "./manual.js";
import { canPurge, listAssets, markCleanup } from "./assets.js";
import { activateStyle, canDeleteStyle, listStyles } from "./styles.js";
import { repoPaths, setStatus } from "../lifecycle.js";

const NOW = "2026-08-25T16:00:00+09:00";

/** 저장소 배치(content/courses·standards)를 갖춘 임시 작업 복사본. */
function makeRepo(): { root: string; slug: string } {
  const root = mkdtempSync(join(tmpdir(), "oc-ops-"));
  const fixtureRoot = join(root, "fixture");
  const { courseDir, standardsDir } = writeFixtureCourse(fixtureRoot);
  mkdirSync(join(root, "content", "courses"), { recursive: true });
  renameSync(courseDir, join(root, "content", "courses", "fixture-course"));
  renameSync(standardsDir, join(root, "content", "standards"));
  return { root, slug: "fixture-course" };
}

function writeRun(dir: string, id: string, kind: string, status: string, minutes: number | null) {
  const started = "2026-08-25T10:00:00+09:00";
  const ended =
    minutes === null
      ? null
      : new Date(Date.parse(started) + minutes * 60000).toISOString().replace(/\.\d+Z$/u, "Z");
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify({
      schema_version: 1,
      run_id: id,
      course_id: "01J0000000000000000000000A",
      kind,
      started_at: started,
      ended_at: ended,
      status: ended ? status : "aborted",
      failed_stage: status === "failed" ? "S6" : null,
      stages: [],
      metrics: { model_calls: null, tts_seconds: null, uploaded_bytes: null },
    }),
  );
}

test("지표: 완료율·오류율·중앙값이 ops/runs 집계에서 나온다", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-metrics-"));
  try {
    writeRun(dir, "gen-a-202608251000", "generate", "success", 10);
    writeRun(dir, "gen-b-202608251001", "generate", "success", 20);
    writeRun(dir, "gen-c-202608251002", "generate", "failed", 5);
    writeRun(dir, "machine-check-d-202608251003", "machine-check", "success", 1);
    const m = computeMetrics(dir);
    assert.equal(m.generateCount, 3);
    assert.equal(m.completionRate, 2 / 3);
    assert.equal(m.errorRate, 1 / 4);
    assert.equal(m.medianDraftMinutes, 20);
    assert.equal(m.recent.length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("보드: 재생성은 결정적이고, 실제 상태가 바뀌면 낡은 보드가 잡힌다", () => {
  const { root, slug } = makeRepo();
  try {
    const first = writeStatusBoard(root);
    assert.ok(first.includes(slug));
    assert.ok(first.includes("직접 수정 금지"));
    assert.equal(renderStatusBoard(root), first); // 결정적 재생성

    assert.equal(checkStatusBoard(root).fresh, true);

    // 상태를 바꾸면 커밋된 보드는 낡은 것이 된다
    setStatus(repoPaths(root), slug, "published", NOW);
    const stale = checkStatusBoard(root);
    assert.equal(stale.fresh, false);
    assert.ok(stale.message.includes("갱신"));

    writeStatusBoard(root);
    assert.equal(checkStatusBoard(root).fresh, true);
    assert.ok(renderStatusBoard(root).includes("published"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("수동 검토: 사유 없는 보류는 거부되고, 보류는 누적으로 남는다", () => {
  const { root, slug } = makeRepo();
  const courseDir = join(root, "content", "courses", slug);
  try {
    initManualReview(courseDir, "01J0000000000000000000000A", NOW);
    assert.throws(
      () =>
        recordManualReview(courseDir, {
          code: "MR05",
          action: "waive",
          actor: "관리자",
          now: NOW,
        }),
      /사유 없는 보류/u,
    );
    recordManualReview(courseDir, {
      code: "MR05",
      action: "waive",
      actor: "관리자",
      waiveReason: "대학 수업은 비상업 조건을 충족한다고 판단",
      now: NOW,
    });
    recordManualReview(courseDir, { code: "MR01", action: "done", actor: "관리자", now: NOW });
    // 보류를 풀어도 누적은 줄지 않는다 — 늘어나는 것이 보여야 손을 쓸 수 있다
    const doc = recordManualReview(courseDir, {
      code: "MR05",
      action: "reopen",
      actor: "관리자",
      now: NOW,
    });
    assert.equal(doc.waived_count_total, 1);
    assert.equal(doc.items.find((i) => i.code === "MR01")?.actor, "관리자");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("자산: 발행 이력 교재의 자산은 지울 수 없고, 정리 대상 표시만 지울 수 있다", () => {
  const { root, slug } = makeRepo();
  try {
    const { assets, totalBytes } = listAssets(root);
    assert.equal(assets.length, 4); // 챕터 2 × (fig + aud)
    assert.ok(totalBytes > 0);

    // 활성 자산은 즉시 삭제 불가
    assert.equal(canPurge(root, slug, "01-intro", "fig-01").ok, false);
    // 정리 대상 표시 후에는 (미발행 교재라면) 가능
    markCleanup(root, slug, "01-intro", "fig-01", NOW);
    const marked = listAssets(root).assets.find(
      (a) => a.id === "fig-01" && a.chapterId === "01-intro",
    );
    assert.equal(marked?.status, "cleanup");
    assert.ok(marked?.purgeEligibleAt?.startsWith("2026-11-23")); // 90일 뒤
    assert.equal(canPurge(root, slug, "01-intro", "fig-01").ok, true);

    // 발행되면 보호된다 — 표시가 media.json을 바꿨으므로 기계 검사를 다시 돌린 뒤 발행한다
    runMachineCheck(join(root, "content", "courses", slug), join(root, "content", "standards"), {
      now: NOW,
    });
    assert.equal(setStatus(repoPaths(root), slug, "published", NOW).ok, true);
    const refused = canPurge(root, slug, "01-intro", "fig-01");
    assert.equal(refused.ok, false);
    assert.ok(refused.reason?.includes("발행"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("스타일: 활성·참조 표시와 삭제 규칙", () => {
  const { root } = makeRepo();
  try {
    const stylesDir = join(root, "content", "standards", "styles");
    mkdirSync(stylesDir, { recursive: true });
    const styleDoc = (version: string) => ({
      schema_version: 1,
      version,
      created_at: NOW,
      created_by: "관리자",
      prose: { voice: "해요체", tone: "차분", terminology: [] },
      graphics: { palette: ["#3b6ef5"], typography: "Pretendard", rules: [] },
      narration: { voice: "Sohee", pace: "보통", rules: [] },
    });
    writeFileSync(join(stylesDir, "v1.json"), JSON.stringify(styleDoc("v1")));
    writeFileSync(join(stylesDir, "v2.json"), JSON.stringify(styleDoc("v2")));
    activateStyle(root, "v1", "관리자", NOW);

    const styles = listStyles(root);
    assert.equal(styles.find((s) => s.version === "v1")?.active, true);
    assert.deepEqual(styles.find((s) => s.version === "v1")?.referencedBy, ["fixture-course"]);

    assert.equal(canDeleteStyle(root, "v1").ok, false); // 활성 + 참조
    assert.equal(canDeleteStyle(root, "v2").ok, true); // 비활성 + 무참조

    activateStyle(root, "v2", "관리자", NOW);
    assert.equal(listStyles(root).find((s) => s.version === "v2")?.active, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("보드: 교재가 없어도 렌더되고 빈 상태를 말한다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-empty-"));
  try {
    mkdirSync(join(root, "content", "standards"), { recursive: true });
    const board = renderStatusBoard(root);
    assert.ok(board.includes("아직 교재가 없다"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("보드: 본문 수정(지문 드리프트)도 낡은 보드로 드러난다", () => {
  const { root, slug } = makeRepo();
  try {
    writeStatusBoard(root);
    appendFileSync(
      join(root, "content", "courses", slug, "chapters/01-intro/01.mdx"),
      "\n몰래 고친 문장.\n",
    );
    assert.equal(checkStatusBoard(root).fresh, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
