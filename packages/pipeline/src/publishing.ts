import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CourseSchema, canPublish, type Course } from "@opencourse/content";
import { repoPaths } from "./lifecycle.js";

/**
 * 공개 산출물 수집기 (구현 계획 5단계, docs/05 "어떻게 막는가").
 *
 * 여기가 유일한 관문이다. 정적 사이트 빌드는 이 함수가 돌려주는 published
 * 목록만 산출물에 담는다. 조건은 둘 다여야 한다:
 *   상태가 published  AND  canPublish()가 참.
 * 상태 값만 직접 발행으로 고친 교재는 canPublish가 거르고,
 * 검수 뒤 본문이 바뀐 교재는 지문 드리프트로 걸러진다.
 * 막는 자리가 하나이므로 우회할 다른 문이 없다.
 */
export interface PublishableCourse {
  slug: string;
  dir: string;
  course: Course;
}

export interface ExcludedCourse {
  slug: string;
  status: string;
  reasons: string[];
}

export interface CollectResult {
  published: PublishableCourse[];
  excluded: ExcludedCourse[];
}

export function collectPublishable(root: string): CollectResult {
  const paths = repoPaths(root);
  const published: PublishableCourse[] = [];
  const excluded: ExcludedCourse[] = [];
  if (!existsSync(paths.coursesDir)) return { published, excluded };

  const slugs = readdirSync(paths.coursesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const slug of slugs) {
    const dir = join(paths.coursesDir, slug);
    const coursePath = join(dir, "course.json");
    if (!existsSync(coursePath)) {
      excluded.push({ slug, status: "unknown", reasons: ["course.json이 없습니다"] });
      continue;
    }
    const parsed = CourseSchema.safeParse(JSON.parse(readFileSync(coursePath, "utf8")));
    if (!parsed.success) {
      excluded.push({ slug, status: "unknown", reasons: ["course.json이 계약과 어긋납니다"] });
      continue;
    }
    const course = parsed.data;
    if (course.status !== "published") {
      excluded.push({
        slug,
        status: course.status,
        reasons: [`상태가 ${course.status}입니다 — 발행 상태가 아닙니다`],
      });
      continue;
    }
    const gate = canPublish(dir, paths.standardsDir);
    if (!gate.ok) {
      // 상태는 발행인데 증거가 깨진 교재 — 우회 시도의 흔적이다. 담지 않는다.
      excluded.push({ slug, status: course.status, reasons: gate.reasons });
      continue;
    }
    published.push({ slug, dir, course });
  }
  return { published, excluded };
}

/**
 * 교재 삭제 — 한 번도 발행된 적 없는 교재만 지울 수 있다 (docs/04 화면 7 규칙).
 * 발행 이력이 있으면 공개 링크가 깨지고 생성 결과를 되짚지 못하게 되므로 숨김을 권한다.
 */
export function deleteCourse(root: string, slug: string): { ok: boolean; reason: string | null } {
  const paths = repoPaths(root);
  const dir = join(paths.coursesDir, slug);
  const coursePath = join(dir, "course.json");
  if (!existsSync(coursePath)) return { ok: false, reason: "교재가 없습니다" };
  const course = CourseSchema.parse(JSON.parse(readFileSync(coursePath, "utf8")));
  if (course.published_at !== null) {
    return {
      ok: false,
      reason: "한 번이라도 발행된 교재는 지울 수 없습니다 — 숨김(hide)을 쓰십시오",
    };
  }
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, reason: null };
}
