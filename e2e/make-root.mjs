/**
 * E2E용 임시 콘텐츠 뿌리를 만든다 (구현 계획 8단계 증명).
 * 발행 교재 1권(fixture-course, 게이트 통과 후 setStatus published)과
 * 초안 교재 1권(draft-course) — 초안이 산출물에 없다는 것까지가 증명 대상이다.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeFixtureCourse } from "../packages/content/dist/fixture.js";
import { repoPaths, setStatus } from "../packages/pipeline/dist/lifecycle.js";

export function makeRoot(root) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "content", "courses"), { recursive: true });

  // 발행 교재
  const pub = writeFixtureCourse(join(root, "pub-tmp"), {});
  renameSync(pub.courseDir, join(root, "content", "courses", "fixture-course"));
  renameSync(pub.standardsDir, join(root, "content", "standards"));
  const publish = setStatus(repoPaths(root), "fixture-course", "published");
  if (!publish.ok) {
    throw new Error(`고정 교재 발행 실패: ${publish.reasons.join(", ")}`);
  }

  // 초안 교재 — 제목·슬러그만 바꾼 사본, 상태는 draft 그대로
  const draft = writeFixtureCourse(join(root, "draft-tmp"), {});
  const draftDir = join(root, "content", "courses", "draft-course");
  renameSync(draft.courseDir, draftDir);
  rmSync(join(root, "draft-tmp"), { recursive: true, force: true });
  const coursePath = join(draftDir, "course.json");
  const course = JSON.parse(readFileSync(coursePath, "utf8"));
  course.slug = "draft-course";
  course.title = "초안 교재";
  writeFileSync(coursePath, JSON.stringify(course, null, 2) + "\n");

  rmSync(join(root, "pub-tmp"), { recursive: true, force: true });
  return root;
}
