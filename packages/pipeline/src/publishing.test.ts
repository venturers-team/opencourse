import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFixtureCourse, type Sabotage } from "@opencourse/content";
import { collectPublishable, deleteCourse } from "./publishing.js";
import { setStatus, repoPaths } from "./lifecycle.js";

/**
 * 우회 시도 테스트 일습 (구현 계획 5단계).
 * 성공 기준 "검수 미통과 교재 발행 0건"의 상시 증거다 — CI에서 언제나 돈다.
 */
function makeRepoWithCourse(sabotage: Sabotage = {}): { root: string; slug: string } {
  const root = mkdtempSync(join(tmpdir(), "oc-pub-"));
  const fixtureRoot = join(root, "fixture");
  const { courseDir, standardsDir } = writeFixtureCourse(fixtureRoot, sabotage);
  // 저장소 배치로 옮긴다: content/courses/<슬러그>, content/standards
  mkdirSync(join(root, "content", "courses"), { recursive: true });
  renameSync(courseDir, join(root, "content", "courses", "fixture-course"));
  renameSync(standardsDir, join(root, "content", "standards"));
  return { root, slug: "fixture-course" };
}

test("우회 시도 (a): 검수 없이 상태만 발행으로 직접 고치면 빌드 산출물에 없다", () => {
  const { root, slug } = makeRepoWithCourse({
    statusOverride: "published",
    dropFile: "review/sentence-review.json",
  });
  try {
    const { published, excluded } = collectPublishable(root);
    assert.deepEqual(published, []);
    const entry = excluded.find((e) => e.slug === slug);
    assert.ok(entry);
    assert.ok(entry.reasons.some((r) => r.includes("문장 검수")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("우회 시도 (b): 검수 통과 뒤 본문을 한 글자 고치면(지문 드리프트) 산출물에 없다", () => {
  const { root, slug } = makeRepoWithCourse({ statusOverride: "published" });
  try {
    appendFileSync(
      join(root, "content", "courses", slug, "chapters/01-intro/01.mdx"),
      "\n검수 뒤에 몰래 고친 문장.\n",
    );
    const { published, excluded } = collectPublishable(root);
    assert.deepEqual(published, []);
    assert.ok(
      excluded[0]?.reasons.some((r) => r.includes("지문")),
      "지문 드리프트가 이유로 나와야 한다",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("우회 시도 (c): 기계 검사 차단은 어떤 예외로도 넘길 수 없다", () => {
  const { root } = makeRepoWithCourse({ statusOverride: "published", machineFail: true });
  try {
    const { published, excluded } = collectPublishable(root);
    assert.deepEqual(published, []);
    assert.ok(excluded[0]?.reasons.some((r) => r.includes("기계 검사 미통과")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("정상 경로 (d): 세 검수 통과 + 발행 상태면 산출물에 담긴다", () => {
  const { root, slug } = makeRepoWithCourse(); // draft 상태, 증거 완비
  try {
    // 발행 명령 경로 — 게이트 선확인 뒤 상태 전환
    const publish = setStatus(repoPaths(root), slug, "published");
    assert.equal(publish.ok, true);
    const { published, excluded } = collectPublishable(root);
    assert.equal(published.length, 1);
    assert.equal(published[0]?.slug, slug);
    assert.deepEqual(excluded, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("우회 시도 (e): 숨김 교재는 산출물에서 사라지고 published_at은 남는다", () => {
  const { root, slug } = makeRepoWithCourse();
  try {
    const paths = repoPaths(root);
    assert.equal(setStatus(paths, slug, "published").ok, true);
    assert.equal(setStatus(paths, slug, "hidden").ok, true);
    const { published, excluded } = collectPublishable(root);
    assert.deepEqual(published, []);
    assert.equal(excluded[0]?.status, "hidden");

    // 발행 이력이 있으므로 삭제는 거부된다 — 숨김만 가능하다
    const del = deleteCourse(root, slug);
    assert.equal(del.ok, false);
    assert.ok(del.reason?.includes("숨김"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("삭제 규칙: 한 번도 발행된 적 없는 교재만 지울 수 있다", () => {
  const { root, slug } = makeRepoWithCourse(); // draft, published_at null
  try {
    const del = deleteCourse(root, slug);
    assert.equal(del.ok, true);
    assert.deepEqual(collectPublishable(root), { published: [], excluded: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("초안 상태는 증거가 완비되어도 산출물에 담기지 않는다 (상태 AND 게이트)", () => {
  const { root } = makeRepoWithCourse(); // draft + 완비된 증거
  try {
    const { published, excluded } = collectPublishable(root);
    assert.deepEqual(published, []);
    assert.equal(excluded[0]?.status, "draft");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
