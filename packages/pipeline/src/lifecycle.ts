import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CourseSchema, canPublish, ulid, type Course } from "@opencourse/content";
import { slugify } from "./slug.js";

/**
 * 교재 수명주기 (docs/10 S1, docs/04 명령 흐름).
 * 매 단계에서 관리자에게 보여야 하는 것은 셋뿐이다:
 * 지금 어디인지, 다음에 무엇이 가능한지, 그중 무엇을 권하는지.
 */
export interface RepoPaths {
  root: string;
  coursesDir: string;
  standardsDir: string;
  opsRunsDir: string;
}

export function repoPaths(root: string): RepoPaths {
  return {
    root,
    coursesDir: join(root, "content", "courses"),
    standardsDir: join(root, "content", "standards"),
    opsRunsDir: join(root, "ops", "runs"),
  };
}

export interface CreateCourseInput {
  title: string;
  topic: string;
  audience: string;
  difficulty: Course["difficulty"];
  contentStyle: string;
  learningOutcomes: string[];
  prerequisites: string[];
  estimatedMinutes: number;
  styleVersion: string;
  runId: string;
  now?: string;
}

/** S1 프로젝트 생성 — course.json 뼈대 (상태: generating). */
export function createCourse(
  paths: RepoPaths,
  input: CreateCourseInput,
): { slug: string; dir: string } {
  const existing = new Set(
    existsSync(paths.coursesDir)
      ? readdirSync(paths.coursesDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [],
  );
  const slug = slugify(input.title, existing);
  const dir = join(paths.coursesDir, slug);
  const now = input.now ?? new Date().toISOString().replace(/\.\d+Z$/u, "Z");
  const course: Course = CourseSchema.parse({
    schema_version: 1,
    id: ulid(),
    title: input.title,
    slug,
    summary: input.topic,
    topic: input.topic,
    audience: input.audience,
    difficulty: input.difficulty,
    language: "ko",
    learning_outcomes: input.learningOutcomes,
    prerequisites: input.prerequisites.length > 0 ? input.prerequisites : ["없음"],
    content_style: input.contentStyle,
    status: "generating",
    created_at: now,
    updated_at: now,
    published_at: null,
    style_version: input.styleVersion,
    estimated_minutes: input.estimatedMinutes,
    edit_count: 0,
    rewrite_after_publish_count: 0,
    chapters: [
      {
        id: "01-overview",
        title: "임시 — 목차 승인 전",
        summary: "목차가 승인되면 교체된다",
        estimated_minutes: input.estimatedMinutes,
        outcomes: input.learningOutcomes,
        subchapters: [{ file: "01.mdx", title: "임시" }],
      },
    ],
    generated_by: { run_id: input.runId, style_version: input.styleVersion },
  });
  mkdirSync(join(dir, "review"), { recursive: true });
  mkdirSync(join(dir, "chapters"), { recursive: true });
  writeFileSync(join(dir, "course.json"), JSON.stringify(course, null, 2) + "\n");
  return { slug, dir };
}

/** 교재 하나의 현재 상태 요약 — 어디인지 · 다음에 가능한 일 · 권하는 일. */
export interface CourseStatus {
  slug: string;
  title: string;
  status: Course["status"];
  gate: { ok: boolean; reasons: string[] };
  nextActions: string[];
  recommended: string;
}

export function courseStatus(paths: RepoPaths, slug: string): CourseStatus {
  const dir = join(paths.coursesDir, slug);
  const course = CourseSchema.parse(JSON.parse(readFileSync(join(dir, "course.json"), "utf8")));
  const gate = canPublish(dir, paths.standardsDir);
  const nextActions: string[] = [];
  let recommended = "";
  if (course.status === "generating") {
    nextActions.push("목차를 승인하고 생성을 실행한다 (S3~S10)", "초안 등록을 시도한다 (S12)");
    recommended = "생성 파이프라인을 이어서 돌린다";
  } else if (course.status === "draft") {
    if (gate.ok) {
      nextActions.push("발행한다 (publish)", "미리보기로 확인한다");
      recommended = "발행한다";
    } else {
      nextActions.push("막힌 이유를 해소한다", "본문을 수정하고 재검수한다");
      recommended = `막힌 이유 ${gate.reasons.length}건을 해소한다: ${gate.reasons[0] ?? ""}`;
    }
  } else if (course.status === "published") {
    nextActions.push("숨긴다 (hide)", "본문을 수정한다 (발행 뒤 수정은 재검수를 부른다)");
    recommended = "그대로 둔다";
  } else {
    nextActions.push("다시 발행한다 (게이트 재확인)");
    recommended = "필요할 때 다시 발행한다";
  }
  return { slug, title: course.title, status: course.status, gate, nextActions, recommended };
}

/** 상태 전환 — 발행·숨김. 발행은 게이트를 먼저 확인한다 (편의 장치이지 방어선은 아니다: 빌드가 어차피 거른다). */
export function setStatus(
  paths: RepoPaths,
  slug: string,
  next: "published" | "hidden",
  now = new Date().toISOString().replace(/\.\d+Z$/u, "Z"),
): { ok: boolean; reasons: string[] } {
  const dir = join(paths.coursesDir, slug);
  const course = CourseSchema.parse(JSON.parse(readFileSync(join(dir, "course.json"), "utf8")));
  if (next === "published") {
    const gate = canPublish(dir, paths.standardsDir);
    if (!gate.ok) return gate;
    course.status = "published";
    course.published_at = course.published_at ?? now;
  } else {
    course.status = "hidden"; // published_at은 지우지 않는다 (docs/02)
  }
  course.updated_at = now;
  writeFileSync(join(dir, "course.json"), JSON.stringify(course, null, 2) + "\n");
  return { ok: true, reasons: [] };
}
