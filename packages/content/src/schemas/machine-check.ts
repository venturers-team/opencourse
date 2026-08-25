import { z } from "zod";
import { isoDatetime, machineGrade, nonempty, schemaVersion, sha256, ulidStr } from "./common.js";

/** 결함 코드 등록부 — content/standards/scoring-rules.md와 1:1 (docs/11 §4). 코드는 불변. */
export const DEFECT_CODES = {
  ST01: { kind: "static", grade: "block", title: "필수 항목 누락" },
  ST02: { kind: "static", grade: "block", title: "출처 주소 누락" },
  ST03: { kind: "static", grade: "block", title: "출처 확인 시각 누락" },
  ST04: { kind: "static", grade: "block", title: "사용 조건 누락" },
  ST05: { kind: "static", grade: "block", title: "표기 의무 미이행" },
  ST06: { kind: "static", grade: "warn", title: "미디어 사용 사유 누락" },
  ST07: { kind: "static", grade: "block", title: "미확인 문구 잔존" },
  ST08: { kind: "static", grade: "warn", title: "채점 기준 미비" },
  ST09: { kind: "static", grade: "block", title: "수동 검토 미해결" },
  ST10: { kind: "static", grade: "block", title: "대체 설명 누락" },
  ST11: { kind: "static", grade: "block", title: "자막·요약 누락" },
  SC01: { kind: "structure", grade: "block", title: "지키지 않은 예고" },
  SC02: { kind: "structure", grade: "block", title: "없는 것을 가리키는 회수" },
  SC03: { kind: "structure", grade: "warn", title: "시제 뒤섞임" },
  SC04: { kind: "structure", grade: "warn", title: "문장 중복" },
  SC05: { kind: "structure", grade: "warn", title: "용어 표기 흔들림" },
  SC06: { kind: "structure", grade: "block", title: "섹션 순서 역전" },
} as const;

export type DefectCode = keyof typeof DEFECT_CODES;
const defectCode = z.enum(Object.keys(DEFECT_CODES) as [DefectCode, ...DefectCode[]]);

export const DefectSchema = z
  .object({
    code: defectCode,
    kind: z.enum(["static", "structure"]),
    grade: machineGrade,
    message: nonempty,
    path: nonempty,
    line: z.number().int().positive().nullable(),
    detail: z.string().nullable(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const reg = DEFECT_CODES[d.code];
    if (d.grade !== reg.grade || d.kind !== reg.kind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${d.code}: 등급/종류가 등록부와 다르다 (등록부: ${reg.kind}/${reg.grade})`,
      });
    }
  });

export const MachineCheckSchema = z
  .object({
    schema_version: schemaVersion,
    course_id: ulidStr,
    checked_at: isoDatetime,
    pass: z.boolean(),
    blocker_count: z.number().int().min(0),
    warning_count: z.number().int().min(0),
    inputs: z.array(z.object({ path: nonempty, sha256 }).strict()).min(1),
    standards: z
      .object({
        scoring_rules_sha256: sha256,
        manual_review_items_sha256: sha256,
        thresholds_sha256: sha256,
      })
      .strict(),
    defects: z.array(DefectSchema),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const blocks = doc.defects.filter((d) => d.grade === "block").length;
    const warns = doc.defects.filter((d) => d.grade === "warn").length;
    if (doc.blocker_count !== blocks || doc.warning_count !== warns) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `계수 불일치: 기록 ${doc.blocker_count}/${doc.warning_count}, 실제 ${blocks}/${warns}`,
      });
    }
    if (doc.pass !== (blocks === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pass는 차단 0건과 정확히 일치해야 한다",
      });
    }
  });

export type MachineCheck = z.infer<typeof MachineCheckSchema>;
