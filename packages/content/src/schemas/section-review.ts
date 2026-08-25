import { z } from "zod";
import {
  chapterId,
  isoDatetime,
  nonempty,
  reviewGrade,
  reviewStatus,
  schemaVersion,
  score,
  sha256,
  ulidStr,
} from "./common.js";
import { expectedSectionSeverity, type SectionDimensions } from "../severity.js";

/** review/section-review.json — 섹션(챕터) 전체 검수 (docs/11 §6). 단위는 챕터다. */
const SectionDimensionsSchema = z
  .object({
    completeness: score,
    sequence: score,
    frame_consistency: score,
    evidence: score,
    learner_exit: score,
  })
  .strict();

const MissingSchema = z.object({ what: nonempty, why_needed: nonempty }).strict();
const IssueSchema = z.object({ problem: nonempty, suggestion: z.string().nullable() }).strict();

export const SectionVerdictSchema = z
  .object({
    chapter_id: chapterId,
    round: z.number().int().min(1).max(6),
    reviewed_at: isoDatetime,
    body_sha256: sha256,
    context: z
      .object({
        prior_chapters: z.array(z.object({ chapter_id: chapterId, body_sha256: sha256 }).strict()),
      })
      .strict(),
    reviewer: z
      .object({
        run_id: nonempty,
        model: nonempty,
        read_whole_chapter: z.literal(true),
      })
      .strict(),
    dimensions: SectionDimensionsSchema,
    severity: reviewGrade,
    missing: z.array(MissingSchema),
    issues: z.array(IssueSchema),
    covered: z.array(nonempty),
    defines: z.array(nonempty),
    invalidated: z.boolean(),
    invalidated_at: isoDatetime.nullable(),
    invalidated_reason: z.string().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const expected = expectedSectionSeverity(v.dimensions as SectionDimensions);
    if (v.severity !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${v.chapter_id}: 등급이 판정표와 어긋난다 (기록 ${v.severity}, 판정표 ${expected}) — 기록 거부`,
      });
    }
    if (
      (v.severity === "major" || v.severity === "critical") &&
      v.missing.length + v.issues.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${v.chapter_id}: 중대·심각인데 빠진 것도 문제도 적혀 있지 않다 — 기록 거부`,
      });
    }
  });

const ExceptionSchema = z
  .object({
    chapter_id: chapterId,
    grade: z.literal("critical"),
    reason: nonempty,
    approved_by: nonempty,
    approved_at: isoDatetime,
  })
  .strict();

export const SectionReviewSchema = z
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
    status: reviewStatus,
    reviews: z.array(SectionVerdictSchema),
    exceptions: z.array(ExceptionSchema),
  })
  .strict();

export type SectionReview = z.infer<typeof SectionReviewSchema>;
