import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DefectCode } from "../schemas/machine-check.js";
import type { ReviewUnit } from "../units.js";

/**
 * 정적 검사 ST01~ST11 (content/standards/scoring-rules.md).
 * 파일에 무엇이 있고 없는지를 본다. v1 course-static-check.mjs의 판정 로직 이식.
 * 원시 JSON 위에서 동작한다 — 스키마 거부 대신 구체적 결함을 보고하기 위해서다.
 */
export interface RawDefect {
  code: DefectCode;
  message: string;
  path: string;
  line?: number | null;
  detail?: string | null;
}

interface Raw {
  [k: string]: unknown;
}

function get(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Raw)[key] : undefined;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** 라이선스 문면이 저작자 표시를 요구하는가 (v1 ATTRIBUTION_REQUIRED 이식). */
const ATTRIBUTION_LICENSES = [
  /creative\s*commons|\bCC[ -]?BY\b/iu,
  /\bBSD\b/iu,
  /\bMIT\b/iu,
  /\bapache\b/iu,
];

/** 미확인 문구 — AI가 만든 글에서 가장 흔하게 남는 흔적 (ST07). */
const UNVERIFIED_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\(미확인\)|\[미확인\]|미확인이다|미확인 상태/u, label: "미확인 표시" },
  { pattern: /확인(?:이)? 필요|확인하지 못했/u, label: "확인하지 못했다는 문구" },
  { pattern: /추정값|추정치이다/u, label: "추정값 표시" },
  { pattern: /\bTODO\b|\bTBD\b/u, label: "작성 중 표시" },
];

export interface StaticInput {
  courseDir: string;
  courseRaw: unknown;
  chapterFiles: { chapterId: string; file: string; relPath: string; raw: string }[];
  mediaManifests: { chapterId: string; relPath: string; raw: unknown }[];
  sourceMapRaw: unknown | null;
  rubricRaw: unknown | null;
  manualReviewRaw: unknown | null;
  units: ReviewUnit[];
}

const REQUIRED_COURSE_FIELDS = [
  "title",
  "slug",
  "summary",
  "topic",
  "audience",
  "difficulty",
  "learning_outcomes",
  "estimated_minutes",
  "status",
  "style_version",
];

export function staticRules(input: StaticInput): RawDefect[] {
  const defects: RawDefect[] = [];
  const { courseRaw, sourceMapRaw, rubricRaw, manualReviewRaw } = input;

  // ST01 필수 항목 누락 — course.json과 소단원 머리말
  for (const field of REQUIRED_COURSE_FIELDS) {
    if (isEmpty(get(courseRaw, field))) {
      defects.push({
        code: "ST01",
        message: `course.json의 ${field}가 비어 있습니다`,
        path: "course.json",
      });
    }
  }
  for (const ch of input.chapterFiles) {
    const fm = ch.raw.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
    for (const key of ["title", "summary"]) {
      const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, "mu"));
      if (!m || !m[1]?.trim()) {
        defects.push({
          code: "ST01",
          message: `머리말에 ${key}가 비어 있습니다`,
          path: ch.relPath,
        });
      }
    }
  }

  // ST02·ST03·ST04 출처 3요소
  if (!sourceMapRaw) {
    defects.push({
      code: "ST02",
      message: "source-map.json이 없어 어떤 자료에서 왔는지 확인할 수 없습니다",
      path: "review/source-map.json",
    });
  } else {
    const sources = Array.isArray(get(sourceMapRaw, "sources"))
      ? (get(sourceMapRaw, "sources") as unknown[])
      : [];
    for (const source of sources) {
      const id = String(get(source, "id") ?? "(id 없음)");
      if (isEmpty(get(source, "url"))) {
        defects.push({
          code: "ST02",
          message: `출처 ${id}에 url이 없습니다`,
          path: "review/source-map.json",
        });
      }
      if (isEmpty(get(source, "fetched_at"))) {
        defects.push({
          code: "ST03",
          message: `출처 ${id}에 fetched_at이 없습니다 — 실제로 가져온 적이 없는 자료를 출처로 표기할 수 없습니다`,
          path: "review/source-map.json",
        });
      }
      if (isEmpty(get(source, "license"))) {
        defects.push({
          code: "ST04",
          message: `출처 ${id}의 사용 조건(license)이 기록되어 있지 않습니다`,
          path: "review/source-map.json",
        });
      }
      // ST05 표기 의무 — 라이선스 문면상 표기가 필요한데 attribution_required가 아니라고 기록
      const license = String(get(source, "license") ?? "");
      const needsAttribution = ATTRIBUTION_LICENSES.some((p) => p.test(license));
      if (needsAttribution && get(source, "attribution_required") !== true) {
        defects.push({
          code: "ST05",
          message: `출처 ${id}의 라이선스(${license})는 저작자 표시를 요구하는데 attribution_required가 참이 아닙니다 — 화면 표기가 누락됩니다`,
          path: "review/source-map.json",
        });
      }
    }
  }

  // ST06 미디어 사용 사유 (경고) · ST10 대체 설명
  for (const manifest of input.mediaManifests) {
    const items = Array.isArray(get(manifest.raw, "items"))
      ? (get(manifest.raw, "items") as unknown[])
      : [];
    for (const item of items) {
      const id = String(get(item, "id") ?? "(id 없음)");
      if (isEmpty(get(item, "purpose"))) {
        defects.push({
          code: "ST06",
          message: `${id}: 이 미디어를 왜 붙였는지(purpose) 적혀 있지 않습니다`,
          path: manifest.relPath,
        });
      }
      if (get(item, "kind") === "infographic" && isEmpty(get(item, "alt"))) {
        defects.push({
          code: "ST10",
          message: `${id}: 인포그래픽에 대체 설명(alt)이 없습니다`,
          path: manifest.relPath,
        });
      }
    }
    // ST11 자막·요약 — 자막 파일에 큐가 있거나 타임라인 나레이션이 있어야 한다
    const video = get(manifest.raw, "video");
    if (video) {
      const captionsFile = String(get(video, "captions_file") ?? "captions.vtt");
      const captionsPath = join(input.courseDir, "chapters", manifest.chapterId, captionsFile);
      const captionsText = existsSync(captionsPath) ? readFileSync(captionsPath, "utf8") : "";
      const hasCue = /-->/u.test(captionsText);
      const timelineFile = String(get(video, "timeline_file") ?? "timeline.json");
      const timelinePath = join(input.courseDir, "chapters", manifest.chapterId, timelineFile);
      let hasNarration = false;
      if (existsSync(timelinePath)) {
        try {
          const timeline = JSON.parse(readFileSync(timelinePath, "utf8")) as Raw;
          hasNarration =
            Array.isArray(timeline.scenes) &&
            (timeline.scenes as Raw[]).some(
              (s) => typeof s.narration === "string" && s.narration.trim(),
            );
        } catch {
          hasNarration = false;
        }
      }
      if (!hasCue && !hasNarration) {
        defects.push({
          code: "ST11",
          message: `${manifest.chapterId}: 개요 영상에 자막도 텍스트 요약(나레이션)도 없습니다`,
          path: manifest.relPath,
        });
      }
    }
  }

  // ST07 미확인 문구 잔존 — 학습자가 보게 될 문장과 출처 기록
  for (const unit of input.units) {
    for (const { pattern, label } of UNVERIFIED_PATTERNS) {
      if (pattern.test(unit.text)) {
        defects.push({
          code: "ST07",
          message: `${label}가 본문에 남아 있습니다: "${unit.text.slice(0, 50)}"`,
          path: unit.path,
          line: unit.line,
        });
      }
    }
  }
  if (sourceMapRaw) {
    const serialized = JSON.stringify(sourceMapRaw);
    if (/미수행|아직 확인되지 않/u.test(serialized)) {
      defects.push({
        code: "ST07",
        message:
          "source-map.json에 확인을 미뤘다는 기록이 남아 있습니다 — 실제로 조회한 뒤 갱신하십시오",
        path: "review/source-map.json",
      });
    }
  }

  // ST08 채점 기준 미비 (경고)
  if (!rubricRaw) {
    defects.push({ code: "ST08", message: "rubric.json이 없습니다", path: "review/rubric.json" });
  } else {
    const criteria = Array.isArray(get(rubricRaw, "criteria"))
      ? (get(rubricRaw, "criteria") as unknown[])
      : [];
    if (criteria.length === 0) {
      defects.push({
        code: "ST08",
        message: "rubric.json에 criteria가 없습니다 — 학습 목표 나열은 채점 기준이 아닙니다",
        path: "review/rubric.json",
      });
    }
    criteria.forEach((criterion, index) => {
      const levels = get(criterion, "levels");
      const named = levels && typeof levels === "object" ? Object.keys(levels as Raw) : [];
      if (named.length < 2) {
        defects.push({
          code: "ST08",
          message: `criteria[${index}]에 수행 수준이 둘 이상 필요합니다`,
          path: "review/rubric.json",
        });
      }
    });
  }

  // ST09 수동 검토 미해결
  if (!manualReviewRaw) {
    defects.push({
      code: "ST09",
      message: "manual-review.json이 없습니다 — 수동 검토가 기록되지 않았습니다",
      path: "review/manual-review.json",
    });
  } else {
    const items = Array.isArray(get(manualReviewRaw, "items"))
      ? (get(manualReviewRaw, "items") as unknown[])
      : [];
    for (const item of items) {
      if (get(item, "grade") === "block" && get(item, "status") === "pending") {
        defects.push({
          code: "ST09",
          message: `수동 검토 ${String(get(item, "code"))}가 아직 처리되지 않았습니다`,
          path: "review/manual-review.json",
        });
      }
    }
  }

  return defects;
}
