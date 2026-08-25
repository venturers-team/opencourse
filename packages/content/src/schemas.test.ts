import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFixtureCourse } from "./fixture.js";
import { CourseSchema } from "./schemas/course.js";
import { MediaManifestSchema, TimelineSchema } from "./schemas/media.js";
import { MachineCheckSchema } from "./schemas/machine-check.js";
import { SentenceReviewSchema } from "./schemas/sentence-review.js";
import { SectionReviewSchema } from "./schemas/section-review.js";
import { ManualReviewSchema } from "./schemas/manual-review.js";
import { ProgressSchema, RubricSchema, SourceMapSchema, ThresholdsSchema } from "./schemas/misc.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("고정 교재의 모든 계약 파일이 스키마를 통과한다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-fixture-"));
  try {
    const { courseDir, standardsDir } = writeFixtureCourse(root);
    CourseSchema.parse(loadJson(join(courseDir, "course.json")));
    MachineCheckSchema.parse(loadJson(join(courseDir, "review/machine-check.json")));
    SentenceReviewSchema.parse(loadJson(join(courseDir, "review/sentence-review.json")));
    SectionReviewSchema.parse(loadJson(join(courseDir, "review/section-review.json")));
    ManualReviewSchema.parse(loadJson(join(courseDir, "review/manual-review.json")));
    ProgressSchema.parse(loadJson(join(courseDir, "review/progress.json")));
    RubricSchema.parse(loadJson(join(courseDir, "review/rubric.json")));
    SourceMapSchema.parse(loadJson(join(courseDir, "review/source-map.json")));
    for (const ch of ["01-intro", "02-practice"]) {
      MediaManifestSchema.parse(loadJson(join(courseDir, "chapters", ch, "media.json")));
      TimelineSchema.parse(loadJson(join(courseDir, "chapters", ch, "timeline.json")));
    }
    ThresholdsSchema.parse(loadJson(join(standardsDir, "thresholds.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("course.json은 필수 필드가 하나라도 빠지면 거부된다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-required-"));
  try {
    const { courseDir } = writeFixtureCourse(root);
    const base = loadJson(join(courseDir, "course.json")) as Record<string, unknown>;
    assert.ok(CourseSchema.safeParse(base).success);
    for (const key of Object.keys(base)) {
      const mutated = { ...base };
      delete mutated[key];
      assert.equal(
        CourseSchema.safeParse(mutated).success,
        false,
        `필수 필드 ${key}를 지웠는데 통과했다`,
      );
    }
    // 계약에 없는 필드도 거부된다 (필드 발명 금지)
    assert.equal(CourseSchema.safeParse({ ...base, invented_field: 1 }).success, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("저장소의 실제 thresholds.json이 계약을 통과한다", () => {
  const real = loadJson(resolve(repoRoot, "content/standards/thresholds.json"));
  ThresholdsSchema.parse(real);
});

test("미디어 계약: 대체 설명 없는 인포그래픽은 거부된다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-media-"));
  try {
    const { courseDir } = writeFixtureCourse(root);
    const manifest = loadJson(join(courseDir, "chapters/01-intro/media.json")) as {
      items: { alt: string | null }[];
    };
    (manifest.items[0] as { alt: string | null }).alt = null;
    assert.equal(MediaManifestSchema.safeParse(manifest).success, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("수동 검토: 사유 없는 보류는 기록할 수 없다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-mr-"));
  try {
    const { courseDir } = writeFixtureCourse(root);
    const doc = loadJson(join(courseDir, "review/manual-review.json")) as {
      items: { status: string; waive_reason: string | null }[];
      waived_count_total: number;
    };
    const item = doc.items[0] as { status: string; waive_reason: string | null };
    item.status = "waived";
    item.waive_reason = null;
    doc.waived_count_total = 1;
    assert.equal(ManualReviewSchema.safeParse(doc).success, false);
    item.waive_reason = "대학 수업 자료라 비상업 조건을 충족한다";
    assert.equal(ManualReviewSchema.safeParse(doc).success, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
