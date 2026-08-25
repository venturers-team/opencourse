import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { courseContentSha256, sha256Hex, thresholdsContentSha256 } from "../fingerprint.js";
import { extractReviewUnits } from "../units.js";
import { DEFECT_CODES, MachineCheckSchema, type MachineCheck } from "../schemas/machine-check.js";
import { staticRules, type StaticInput } from "./static-rules.js";
import { structureRules, type ChapterUnits } from "./structure-rules.js";

/**
 * 기계 검사 실행기 (구현 계획 2단계, docs/05).
 * 정적 검사와 구조 검사를 항상 함께 실행하고 결과를 하나로 합쳐
 * review/machine-check.json에 쓴다 — 판정이 파일로 남지 않으면 게이트가 막을 근거가 없다.
 * 이전 판정을 재사용하지 않는다: 실행할 때마다 현재 파일 기준으로 처음부터 다시 본다.
 */
interface Raw {
  [k: string]: unknown;
}

function readJsonIfPresent(path: string): unknown | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export interface MachineCheckRunOptions {
  /** 결정적 테스트를 위한 시각 주입. 기본은 현재 시각. */
  now?: string;
  /** true면 review/machine-check.json에 쓰지 않고 결과만 돌려준다. */
  dryRun?: boolean;
}

export function runMachineCheck(
  courseDir: string,
  standardsDir: string,
  options: MachineCheckRunOptions = {},
): MachineCheck {
  const coursePath = join(courseDir, "course.json");
  const courseRaw = readJsonIfPresent(coursePath);
  if (!courseRaw) throw new Error(`course.json이 없습니다: ${coursePath}`);

  // 검사 대상 파일 수집 (course.json의 순서가 정본)
  const chapters = Array.isArray((courseRaw as Raw).chapters)
    ? ((courseRaw as Raw).chapters as Raw[])
    : [];
  const chapterFiles: StaticInput["chapterFiles"] = [];
  const chapterUnits: ChapterUnits[] = [];
  const mediaManifests: StaticInput["mediaManifests"] = [];
  chapters.forEach((chapter, index) => {
    const chapterId = String(chapter.id ?? "");
    const subs = Array.isArray(chapter.subchapters) ? (chapter.subchapters as Raw[]) : [];
    const units: ChapterUnits = { chapterId, chapterIndex: index + 1, units: [] };
    for (const sub of subs) {
      const file = String(sub.file ?? "");
      const relPath = `chapters/${chapterId}/${file}`;
      const full = join(courseDir, relPath);
      if (!existsSync(full)) continue; // ST01이 머리말 검사에서 잡지 못하는 결손은 아래 inputs 해시 단계 전에 드러난다
      const raw = readFileSync(full, "utf8");
      chapterFiles.push({ chapterId, file, relPath, raw });
      units.units.push(...extractReviewUnits(raw, `${chapterId}/${file}`));
    }
    chapterUnits.push(units);
    const manifestRel = `chapters/${chapterId}/media.json`;
    const manifestRaw = readJsonIfPresent(join(courseDir, manifestRel));
    if (manifestRaw) mediaManifests.push({ chapterId, relPath: manifestRel, raw: manifestRaw });
  });

  const input: StaticInput = {
    courseDir,
    courseRaw,
    chapterFiles,
    mediaManifests,
    sourceMapRaw: readJsonIfPresent(join(courseDir, "review", "source-map.json")),
    rubricRaw: readJsonIfPresent(join(courseDir, "review", "rubric.json")),
    manualReviewRaw: readJsonIfPresent(join(courseDir, "review", "manual-review.json")),
    units: chapterUnits.flatMap((c) => c.units),
  };

  // 정적과 구조를 항상 함께 — 따로 돌리면 한쪽만 통과시키고 배포하는 일이 생긴다
  const rawDefects = [...staticRules(input), ...structureRules(chapterUnits)];
  const defects = rawDefects.map((d) => ({
    code: d.code,
    kind: DEFECT_CODES[d.code].kind,
    grade: DEFECT_CODES[d.code].grade,
    message: d.message,
    path: d.path,
    line: d.line ?? null,
    detail: d.detail ?? null,
  }));

  // 검사 대상 파일의 지문 — 지문이 바뀌면 이 판정은 무효다
  const inputPaths = [
    "course.json",
    ...chapterFiles.map((c) => c.relPath),
    ...mediaManifests.map((m) => m.relPath),
  ];
  const inputs = inputPaths.map((p) => ({
    path: p,
    // course.json은 상태 전환(발행·숨김)이 검사를 무효화하지 않도록 내용 지문을 쓴다
    sha256:
      p === "course.json"
        ? courseContentSha256(JSON.parse(readFileSync(join(courseDir, p), "utf8")))
        : sha256Hex(readFileSync(join(courseDir, p))),
  }));

  const stdHash = (name: string) => {
    const p = join(standardsDir, name);
    if (!existsSync(p)) throw new Error(`검수 기준 문서가 없습니다: ${p}`);
    return sha256Hex(readFileSync(p));
  };

  const blockerCount = defects.filter((d) => d.grade === "block").length;
  const result: MachineCheck = MachineCheckSchema.parse({
    schema_version: 1,
    course_id: String((courseRaw as Raw).id ?? ""),
    checked_at: options.now ?? new Date().toISOString().replace(/\.\d+Z$/u, "Z"),
    pass: blockerCount === 0,
    blocker_count: blockerCount,
    warning_count: defects.length - blockerCount,
    inputs,
    standards: {
      scoring_rules_sha256: stdHash("scoring-rules.md"),
      manual_review_items_sha256: stdHash("manual-review-items.md"),
      thresholds_sha256: thresholdsContentSha256(
        JSON.parse(readFileSync(join(standardsDir, "thresholds.json"), "utf8")),
      ),
    },
    defects,
  });

  if (!options.dryRun) {
    mkdirSync(join(courseDir, "review"), { recursive: true });
    writeFileSync(
      join(courseDir, "review", "machine-check.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
  }
  return result;
}
