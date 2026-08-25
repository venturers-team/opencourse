import { z } from "zod";
import { isoDatetime, machineGrade, nonempty, schemaVersion, ulidStr } from "./common.js";

/** 수동 검토 항목 등록부 — content/standards/manual-review-items.md와 1:1 (docs/11 §7). */
export const MR_CODES = {
  MR01: { grade: "block", title: "출처가 실제로 존재하는가" },
  MR02: { grade: "block", title: "실습·예제가 실제로 돌아가는가" },
  MR03: { grade: "block", title: "이미지가 본문과 맞는가" },
  MR04: { grade: "block", title: "음성이 본문과 맞는가" },
  MR05: { grade: "block", title: "저작권 판단이 필요한 자산" },
  MR06: { grade: "warn", title: "학습 목표와 실제 내용 정합" },
  MR07: { grade: "warn", title: "분량 쏠림" },
  MR08: { grade: "warn", title: "같은 예시 반복" },
  MR09: { grade: "warn", title: "제목의 대표성" },
} as const;

export type MrCode = keyof typeof MR_CODES;
const mrCode = z.enum(Object.keys(MR_CODES) as [MrCode, ...MrCode[]]);

export const ManualItemSchema = z
  .object({
    code: mrCode,
    grade: machineGrade,
    status: z.enum(["pending", "done", "waived"]),
    note: z.string().nullable(),
    waive_reason: z.string().nullable(),
    actor: z.string().nullable(),
    at: isoDatetime.nullable(),
    evidence: z.record(z.unknown()).nullable(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.grade !== MR_CODES[item.code].grade) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${item.code}: 등급이 등록부와 다르다 (등록부: ${MR_CODES[item.code].grade})`,
      });
    }
    if (item.status === "waived" && (!item.waive_reason || item.waive_reason.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${item.code}: 사유 없는 보류는 기록할 수 없다`,
      });
    }
    if (item.status !== "pending" && (!item.actor || !item.at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${item.code}: 처리된 항목에는 처리자와 처리 시각이 필수다`,
      });
    }
  });

export const ManualReviewSchema = z
  .object({
    schema_version: schemaVersion,
    course_id: ulidStr,
    items: z.array(ManualItemSchema).min(1),
    waived_count_total: z.number().int().min(0),
    updated_at: isoDatetime,
  })
  .strict()
  .superRefine((doc, ctx) => {
    const codes = doc.items.map((i) => i.code);
    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "같은 코드가 두 번 있다" });
    }
    const waived = doc.items.filter((i) => i.status === "waived").length;
    if (doc.waived_count_total < waived) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "누적 보류 계수가 현재 보류 건수보다 작을 수 없다",
      });
    }
  });

export type ManualReview = z.infer<typeof ManualReviewSchema>;
