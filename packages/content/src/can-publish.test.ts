import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canPublish } from "./can-publish.js";
import { writeFixtureCourse, type Sabotage } from "./fixture.js";

function gate(sabotage: Sabotage = {}) {
  const root = mkdtempSync(join(tmpdir(), "oc-gate-"));
  try {
    const { courseDir, standardsDir } = writeFixtureCourse(root, sabotage);
    return canPublish(courseDir, standardsDir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function reasonMatches(reasons: string[], keyword: string) {
  return reasons.some((r) => r.includes(keyword));
}

test("진리표: 전부 정상이면 통과하고 이유가 없다", () => {
  const r = gate();
  assert.deepEqual(r, { ok: true, reasons: [] });
});

test("진리표: 기계 검사 기록이 없으면 막힌다", () => {
  const r = gate({ dropFile: "review/machine-check.json" });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "기계 검사 기록이 없습니다"));
});

test("진리표: 기계 검사에 차단이 있으면 막힌다", () => {
  const r = gate({ machineFail: true });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "기계 검사 미통과"));
});

test("진리표: 문장 검수 기록이 없으면 막힌다", () => {
  const r = gate({ dropFile: "review/sentence-review.json" });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "문장 검수 기록이 없습니다"));
});

test("진리표: 문장 검수가 무결점 완주가 아니면 막힌다", () => {
  const r = gate({ sentenceNotClean: true });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "문장 검수 미완료"));
});

test("진리표: 섹션 검수 기록이 없으면 막힌다", () => {
  const r = gate({ dropFile: "review/section-review.json" });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "섹션 검수 기록이 없습니다"));
});

test("진리표: 수동 검토 차단 항목이 남아 있으면 막힌다 (권리 검토 MR05)", () => {
  const r = gate({ pendingBlocker: true });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "MR05"));
});

test("진리표: 검수 뒤 본문을 고치면 지문 드리프트로 전부 무효가 된다", () => {
  const r = gate({ tamperChapterBody: true });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "기계 검사가 무효입니다"));
  assert.ok(reasonMatches(r.reasons, "문장 검수가 무효입니다: 본문 지문이 바뀌었습니다"));
  assert.ok(reasonMatches(r.reasons, "섹션 검수가 무효입니다"));
});

test("진리표: 검수 기준 문서를 고치면 판정이 무효가 된다", () => {
  const r = gate({ tamperStandards: true });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "검수 기준 문서의 지문이 바뀌었습니다"));
});

test("진리표: 업로드되지 않은 미디어가 있으면 막힌다", () => {
  const r = gate({ mediaMissingUrl: true });
  assert.equal(r.ok, false);
  assert.ok(reasonMatches(r.reasons, "미디어가 업로드되지 않았습니다"));
});

test("우회 시도: 상태 값을 발행으로 직접 고쳐도 게이트 판정은 변하지 않는다", () => {
  // canPublish는 상태 값을 읽지 않는다 — 증거만 본다. 증거가 깨진 교재는
  // 상태가 published여도 막힌다 (빌드는 status와 canPublish를 함께 요구한다).
  const broken = gate({ statusOverride: "published", tamperChapterBody: true });
  assert.equal(broken.ok, false);
  const withoutReview = gate({
    statusOverride: "published",
    dropFile: "review/sentence-review.json",
  });
  assert.equal(withoutReview.ok, false);
});
