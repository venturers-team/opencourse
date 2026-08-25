import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { combinedSha256, sha256Hex } from "./fingerprint.js";
import { CourseSchema, type Course } from "./schemas/course.js";
import { MachineCheckSchema } from "./schemas/machine-check.js";
import { SentenceReviewSchema } from "./schemas/sentence-review.js";
import { SectionReviewSchema } from "./schemas/section-review.js";
import { ManualReviewSchema, MR_CODES } from "./schemas/manual-review.js";
import { MediaManifestSchema } from "./schemas/media.js";

/**
 * canPublish — 발행 판정 함수. 이 함수 하나가 유일한 관문이다 (docs/05, docs/11 §13).
 * 공개 빌드도, 발행 명령도, 그 밖의 어떤 경로도 이 판정을 대신하지 못한다.
 * 입력은 docs/11 §13의 표에 있는 값들뿐이다.
 */
export interface GateResult {
  ok: boolean;
  reasons: string[];
}

function tryReadJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function fileHash(path: string): string | null {
  if (!existsSync(path)) return null;
  return sha256Hex(readFileSync(path));
}

/** 챕터 소단원 파일들을 course.json의 순서대로 읽어 결합 지문을 만든다. */
export function courseBodySha256(courseDir: string, course: Course): string {
  const parts: Uint8Array[] = [];
  for (const ch of course.chapters) {
    for (const sub of ch.subchapters) {
      parts.push(readFileSync(join(courseDir, "chapters", ch.id, sub.file)));
    }
  }
  return combinedSha256(parts);
}

export function chapterBodySha256(courseDir: string, course: Course, chapterId: string): string {
  const ch = course.chapters.find((c) => c.id === chapterId);
  if (!ch) throw new Error(`챕터 없음: ${chapterId}`);
  return combinedSha256(
    ch.subchapters.map((s) => readFileSync(join(courseDir, "chapters", ch.id, s.file))),
  );
}

export function canPublish(courseDir: string, standardsDir: string): GateResult {
  const reasons: string[] = [];
  const std = (name: string) => fileHash(join(standardsDir, name));

  // 교재 정보
  const courseRaw = tryReadJson(join(courseDir, "course.json"));
  if (!courseRaw) return { ok: false, reasons: ["course.json이 없습니다"] };
  const courseParsed = CourseSchema.safeParse(courseRaw);
  if (!courseParsed.success) {
    return { ok: false, reasons: ["course.json이 계약과 어긋납니다"] };
  }
  const course = courseParsed.data;

  // 기계 검사: 통과 + 지문 유효
  const mcRaw = tryReadJson(join(courseDir, "review", "machine-check.json"));
  if (!mcRaw) reasons.push("기계 검사 기록이 없습니다");
  else {
    const mc = MachineCheckSchema.safeParse(mcRaw);
    if (!mc.success) reasons.push("기계 검사 기록이 계약과 어긋납니다");
    else {
      if (!mc.data.pass) reasons.push(`기계 검사 미통과: 차단 ${mc.data.blocker_count}건`);
      for (const input of mc.data.inputs) {
        if (fileHash(join(courseDir, input.path)) !== input.sha256) {
          reasons.push(`기계 검사가 무효입니다: ${input.path}의 지문이 바뀌었습니다`);
        }
      }
      const s = mc.data.standards;
      if (
        s.scoring_rules_sha256 !== std("scoring-rules.md") ||
        s.manual_review_items_sha256 !== std("manual-review-items.md") ||
        s.thresholds_sha256 !== std("thresholds.json")
      ) {
        reasons.push("기계 검사가 무효입니다: 검수 기준 문서의 지문이 바뀌었습니다");
      }
    }
  }

  // 문장 검수: 무결점 완주 + 지문 유효
  const srRaw = tryReadJson(join(courseDir, "review", "sentence-review.json"));
  if (!srRaw) reasons.push("문장 검수 기록이 없습니다");
  else {
    const sr = SentenceReviewSchema.safeParse(srRaw);
    if (!sr.success) reasons.push("문장 검수 기록이 계약과 어긋납니다");
    else {
      if (sr.data.status !== "clean_pass")
        reasons.push(`문장 검수 미완료: 상태가 ${sr.data.status}입니다`);
      if (sr.data.source_sha256 !== courseBodySha256(courseDir, course)) {
        reasons.push("문장 검수가 무효입니다: 본문 지문이 바뀌었습니다");
      }
      const p = sr.data.protocol;
      if (
        p.review_protocol_sha256 !== std("review-protocol.md") ||
        p.beginner_baseline_sha256 !== std("beginner-baseline.md") ||
        p.thresholds_sha256 !== std("thresholds.json")
      ) {
        reasons.push("문장 검수가 무효입니다: 검수 기준 문서의 지문이 바뀌었습니다");
      }
    }
  }

  // 섹션 검수: 무결점 완주 + 챕터·문맥 지문 유효 + 전 챕터 판정 존재
  const scRaw = tryReadJson(join(courseDir, "review", "section-review.json"));
  if (!scRaw) reasons.push("섹션 검수 기록이 없습니다");
  else {
    const sc = SectionReviewSchema.safeParse(scRaw);
    if (!sc.success) reasons.push("섹션 검수 기록이 계약과 어긋납니다");
    else {
      if (sc.data.status !== "clean_pass")
        reasons.push(`섹션 검수 미완료: 상태가 ${sc.data.status}입니다`);
      const bodyHashes = new Map<string, string>();
      for (const ch of course.chapters) {
        bodyHashes.set(ch.id, chapterBodySha256(courseDir, course, ch.id));
        const verdict = sc.data.reviews.find((r) => r.chapter_id === ch.id && !r.invalidated);
        if (!verdict) {
          reasons.push(`섹션 검수가 없습니다: ${ch.id}`);
          continue;
        }
        if (verdict.body_sha256 !== bodyHashes.get(ch.id)) {
          reasons.push(`섹션 검수가 무효입니다: ${ch.id}의 본문 지문이 바뀌었습니다`);
        }
        for (const prior of verdict.context.prior_chapters) {
          const current =
            bodyHashes.get(prior.chapter_id) ??
            chapterBodySha256(courseDir, course, prior.chapter_id);
          if (prior.body_sha256 !== current) {
            reasons.push(
              `섹션 검수가 무효입니다: ${ch.id}의 판정이 전제한 앞 챕터 ${prior.chapter_id}가 바뀌었습니다`,
            );
          }
        }
      }
    }
  }

  // 수동 검토: 미해결 차단 0 (권리 검토 MR05 포함)
  const mrRaw = tryReadJson(join(courseDir, "review", "manual-review.json"));
  if (!mrRaw) reasons.push("수동 검토 기록이 없습니다");
  else {
    const mr = ManualReviewSchema.safeParse(mrRaw);
    if (!mr.success) reasons.push("수동 검토 기록이 계약과 어긋납니다");
    else {
      const openBlockers = mr.data.items.filter(
        (i) => i.grade === "block" && i.status === "pending",
      );
      for (const item of openBlockers) {
        reasons.push(`수동 검토 미해결: ${item.code} ${MR_CODES[item.code].title}`);
      }
      const recorded = new Set(mr.data.items.map((i) => i.code));
      for (const code of Object.keys(MR_CODES) as (keyof typeof MR_CODES)[]) {
        if (MR_CODES[code].grade === "block" && !recorded.has(code)) {
          reasons.push(`수동 검토 항목이 기록되지 않았습니다: ${code}`);
        }
      }
    }
  }

  // 미디어: 활성 항목 전부 업로드 완료 (URL 존재)
  for (const ch of course.chapters) {
    const manifestRaw = tryReadJson(join(courseDir, "chapters", ch.id, "media.json"));
    if (!manifestRaw) {
      reasons.push(`미디어 목록이 없습니다: ${ch.id}`);
      continue;
    }
    const manifest = MediaManifestSchema.safeParse(manifestRaw);
    if (!manifest.success) {
      reasons.push(`미디어 목록이 계약과 어긋납니다: ${ch.id}`);
      continue;
    }
    for (const item of manifest.data.items) {
      if (item.status === "active" && !item.url) {
        reasons.push(`미디어가 업로드되지 않았습니다: ${ch.id}/${item.id}`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}
