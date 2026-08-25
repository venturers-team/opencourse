import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CourseSchema,
  MediaManifestSchema,
  TimelineSchema,
  runMachineCheck,
  type MachineCheck,
} from "@opencourse/content";

/**
 * S12 초안 등록 (docs/10). 전부 아니면 무 —
 * 필수 산출물이 하나라도 없으면 어느 것도 초안으로 등록되지 않는다.
 * 등록되면 상태를 generating→draft로 바꾸고 기계 검사를 자동으로 한 번 돌린다.
 */
export interface RegisterResult {
  ok: boolean;
  missing: string[];
  machineCheck: MachineCheck | null;
}

export function registerDraft(
  courseDir: string,
  standardsDir: string,
  options: { now?: string } = {},
): RegisterResult {
  const missing: string[] = [];
  const coursePath = join(courseDir, "course.json");
  if (!existsSync(coursePath)) {
    return { ok: false, missing: ["course.json"], machineCheck: null };
  }
  const course = CourseSchema.parse(JSON.parse(readFileSync(coursePath, "utf8")));

  // 필수 산출물 점검 — 챕터마다 본문·미디어 목록·타임라인·자막·업로드 완료
  for (const ch of course.chapters) {
    for (const sub of ch.subchapters) {
      const rel = `chapters/${ch.id}/${sub.file}`;
      if (!existsSync(join(courseDir, rel))) missing.push(rel);
    }
    const manifestRel = `chapters/${ch.id}/media.json`;
    const manifestPath = join(courseDir, manifestRel);
    if (!existsSync(manifestPath)) {
      missing.push(manifestRel);
      continue;
    }
    const manifest = MediaManifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, "utf8")));
    if (!manifest.success) {
      missing.push(`${manifestRel} (계약 위반)`);
      continue;
    }
    for (const item of manifest.data.items) {
      if (item.status === "active" && !item.url) {
        missing.push(`${manifestRel}의 ${item.id} 업로드 (S11 미완)`);
      }
    }
    const timelineRel = `chapters/${ch.id}/${manifest.data.video.timeline_file}`;
    if (!existsSync(join(courseDir, timelineRel))) missing.push(timelineRel);
    else {
      const t = TimelineSchema.safeParse(
        JSON.parse(readFileSync(join(courseDir, timelineRel), "utf8")),
      );
      if (!t.success) missing.push(`${timelineRel} (계약 위반)`);
    }
    const captionsRel = `chapters/${ch.id}/${manifest.data.video.captions_file}`;
    if (!existsSync(join(courseDir, captionsRel))) missing.push(captionsRel);
  }
  for (const rel of ["review/rubric.json", "review/source-map.json", "review/manual-review.json"]) {
    if (!existsSync(join(courseDir, rel))) missing.push(rel);
  }

  if (missing.length > 0) {
    return { ok: false, missing, machineCheck: null }; // 상태를 바꾸지 않는다
  }

  // 등록 — 상태 전환과 기계 검사 자동 1회
  const now = options.now ?? new Date().toISOString().replace(/\.\d+Z$/u, "Z");
  course.status = "draft";
  course.updated_at = now;
  writeFileSync(coursePath, JSON.stringify(course, null, 2) + "\n");
  const machineCheck = runMachineCheck(courseDir, standardsDir, { now });
  return { ok: true, missing: [], machineCheck };
}
