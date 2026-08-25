import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MR_CODES, ManualReviewSchema, type ManualReview, type MrCode } from "@opencourse/content";

/**
 * 수동 검토 기록 (docs/04 화면 7의 몫, content/standards/manual-review-items.md).
 * 사유 없는 보류가 쌓이면 이 목록은 형식이 되고, 형식이 된 검사는 없는 것과 같다 —
 * 그래서 사유 없는 보류는 기록 자체가 거부되고, 보류 건수는 누적 표시된다.
 */
export function initManualReview(courseDir: string, courseId: string, now: string): ManualReview {
  const doc = ManualReviewSchema.parse({
    schema_version: 1,
    course_id: courseId,
    items: (Object.keys(MR_CODES) as MrCode[]).map((code) => ({
      code,
      grade: MR_CODES[code].grade,
      status: "pending",
      note: null,
      waive_reason: null,
      actor: null,
      at: null,
      evidence: null,
    })),
    waived_count_total: 0,
    updated_at: now,
  });
  mkdirSync(join(courseDir, "review"), { recursive: true });
  writeFileSync(
    join(courseDir, "review", "manual-review.json"),
    JSON.stringify(doc, null, 2) + "\n",
  );
  return doc;
}

export interface ManualRecordInput {
  code: MrCode;
  action: "done" | "waive" | "reopen";
  actor: string;
  note?: string;
  waiveReason?: string;
  now: string;
}

export function recordManualReview(courseDir: string, input: ManualRecordInput): ManualReview {
  const path = join(courseDir, "review", "manual-review.json");
  if (!existsSync(path)) throw new Error("manual-review.json이 없습니다 — 초안 등록이 먼저입니다");
  const doc = ManualReviewSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const item = doc.items.find((i) => i.code === input.code);
  if (!item) throw new Error(`항목이 없습니다: ${input.code}`);
  if (input.action === "waive") {
    if (!input.waiveReason?.trim()) {
      throw new Error("사유 없는 보류는 기록할 수 없습니다 — 왜 넘기는지 적으십시오");
    }
    item.status = "waived";
    item.waive_reason = input.waiveReason;
    doc.waived_count_total += 1; // 누적 — 늘어나는 것이 보여야 손을 쓸 수 있다
  } else if (input.action === "done") {
    item.status = "done";
    item.waive_reason = null;
  } else {
    item.status = "pending";
    item.actor = null;
    item.at = null;
    item.note = input.note ?? null;
    doc.updated_at = input.now;
    const reopened = ManualReviewSchema.parse(doc);
    writeFileSync(path, JSON.stringify(reopened, null, 2) + "\n");
    return reopened;
  }
  if (!input.actor.trim()) throw new Error("처리자 없는 기록은 남길 수 없습니다");
  item.actor = input.actor;
  item.at = input.now;
  item.note = input.note ?? item.note;
  doc.updated_at = input.now;
  const validated = ManualReviewSchema.parse(doc);
  writeFileSync(path, JSON.stringify(validated, null, 2) + "\n");
  return validated;
}
