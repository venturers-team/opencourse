import { z } from "zod";
import {
  isoDatetime,
  nonempty,
  reviewGrade,
  reviewStatus,
  schemaVersion,
  score,
  sha256,
  ulidStr,
  unitId,
} from "./common.js";
import { expectedSentenceSeverity, type SentenceDimensions } from "../severity.js";

/**
 * review/sentence-review.json — 문장 단위 격리 검수 (docs/11 §5).
 * 기록 거부 규칙을 스키마가 강제한다: 격리 증거가 없거나, 중대·심각인데 문제 목록이
 * 비었거나, 판정표와 어긋난 등급은 파싱 자체가 거부된다.
 */
export interface LearnerStateCaps {
  maxKnownFacts: number;
  maxDefinedTerms: number;
  maxOpenQuestions: number;
}
export const DEFAULT_CAPS: LearnerStateCaps = {
  maxKnownFacts: 40,
  maxDefinedTerms: 40,
  maxOpenQuestions: 20,
};

/** 격리 증거 — 리터럴 타입으로 구조 자체가 강제한다. */
const IsolationReviewerSchema = z
  .object({
    run_id: nonempty,
    model: nonempty,
    fresh_context: z.literal(true),
    repository_access: z.literal(false),
    raw_neighbor_sentences: z.literal(false),
  })
  .strict();

const IssueSchema = z.object({ problem: nonempty, suggestion: z.string().nullable() }).strict();

export function makeReaderStateSchema(caps: LearnerStateCaps = DEFAULT_CAPS) {
  return z
    .object({
      understood_facts: z.array(nonempty).max(caps.maxKnownFacts),
      defined_terms: z
        .array(z.object({ term: nonempty, definition: nonempty }).strict())
        .max(caps.maxDefinedTerms),
      open_questions: z.array(nonempty).max(caps.maxOpenQuestions),
      evictions: z.array(
        z
          .object({
            list: z.enum(["understood_facts", "defined_terms", "open_questions"]),
            item: nonempty,
            reason: nonempty,
            at_unit: unitId,
          })
          .strict(),
      ),
    })
    .strict();
}

const DimensionsSchema = z
  .object({
    clarity: score,
    consistency: score,
    flow: score,
    logic: score,
    novice_comprehension: score,
  })
  .strict();

export function makeSentenceVerdictSchema(caps: LearnerStateCaps = DEFAULT_CAPS) {
  return z
    .object({
      sentence_id: unitId,
      round: z.number().int().min(1).max(6),
      reviewed_at: isoDatetime,
      state_before_sha256: sha256,
      reviewer: IsolationReviewerSchema,
      dimensions: DimensionsSchema,
      severity: reviewGrade,
      issues: z.array(IssueSchema),
      reader_state_after: makeReaderStateSchema(caps),
      invalidated: z.boolean(),
      invalidated_at: isoDatetime.nullable(),
      invalidated_reason: z.string().nullable(),
    })
    .strict()
    .superRefine((v, ctx) => {
      const expected = expectedSentenceSeverity(v.dimensions as SentenceDimensions);
      if (v.severity !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${v.sentence_id}: 등급이 판정표와 어긋난다 (기록 ${v.severity}, 판정표 ${expected}) — 기록 거부`,
        });
      }
      if ((v.severity === "major" || v.severity === "critical") && v.issues.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${v.sentence_id}: 중대·심각인데 문제 목록이 비었다 — 기록 거부`,
        });
      }
    });
}

const UnitSchema = z
  .object({
    id: unitId,
    path: nonempty,
    line: z.number().int().positive(),
    ordinal: z.number().int().min(1),
    kind: z.enum(["prose", "heading", "list", "quote", "table"]),
    text: nonempty,
    text_sha256: sha256,
  })
  .strict();

const RoundSchema = z
  .object({
    round: z.number().int().min(1).max(6),
    started_at: isoDatetime,
    ended_at: isoDatetime.nullable(),
    clean_pass: z.boolean(),
    ended_reason: z
      .enum(["clean_pass", "revision", "halted_max_rounds", "halted_loop", "invalidated"])
      .nullable(),
  })
  .strict();

const ExceptionSchema = z
  .object({
    unit_id: unitId,
    grade: z.literal("critical"),
    reason: nonempty,
    approved_by: nonempty,
    approved_at: isoDatetime,
  })
  .strict();

export function makeSentenceReviewSchema(caps: LearnerStateCaps = DEFAULT_CAPS) {
  return z
    .object({
      schema_version: schemaVersion,
      course_id: ulidStr,
      protocol: z
        .object({
          review_protocol_sha256: sha256,
          beginner_baseline_sha256: sha256,
          thresholds_sha256: sha256,
        })
        .strict(),
      source_sha256: sha256,
      status: reviewStatus,
      rounds: z.array(RoundSchema),
      units: z.array(UnitSchema),
      reviews: z.array(makeSentenceVerdictSchema(caps)),
      reader_state: makeReaderStateSchema(caps),
      exceptions: z.array(ExceptionSchema),
    })
    .strict()
    .superRefine((doc, ctx) => {
      if (doc.status === "clean_pass" && !doc.rounds.some((r) => r.clean_pass)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "status가 clean_pass인데 무결점 완주 회차가 없다",
        });
      }
    });
}

export const SentenceReviewSchema = makeSentenceReviewSchema();
export type SentenceReview = z.infer<typeof SentenceReviewSchema>;
