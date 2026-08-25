import { z } from "zod";
import { gateState, isoDate, isoDatetime, nonempty, schemaVersion, ulidStr } from "./common.js";

/** review/progress.json — 게이트 요약. 파생 요약이며 교재 상태는 담지 않는다 (docs/11 §3). */
export const ProgressSchema = z
  .object({
    schema_version: schemaVersion,
    course_id: ulidStr,
    gates: z
      .object({
        machine_check: z.object({ state: gateState, checked_at: isoDatetime.nullable() }).strict(),
        sentence_review: z
          .object({
            state: gateState,
            round: z.number().int().min(0).max(6),
            clean_pass_at: isoDatetime.nullable(),
          })
          .strict(),
        section_review: z.object({ state: gateState }).strict(),
        manual_review: z
          .object({ state: gateState, open_blockers: z.number().int().min(0) })
          .strict(),
      })
      .strict(),
    fingerprints_ok: z.boolean(),
    next_actions: z.array(nonempty),
    updated_at: isoDatetime,
  })
  .strict();

/** review/rubric.json — 교재별 채점 기준 (docs/11 §8, v1 계승). */
export const RubricSchema = z
  .object({
    schema_version: schemaVersion,
    course_id: ulidStr,
    artifact: nonempty,
    grading_note: nonempty,
    criteria: z
      .array(
        z
          .object({
            id: z.string().regex(/^C-\d+$/),
            outcome: nonempty,
            reads: z.array(nonempty).min(1),
            levels: z.object({ 미달: nonempty, 기준: nonempty, 우수: nonempty }).strict(),
          })
          .strict(),
      )
      .min(1),
    deferred: z.array(
      z
        .object({ id: z.string().regex(/^D-\d+$/), what: nonempty, why: nonempty, when: nonempty })
        .strict(),
    ),
    quality_checks: z.record(nonempty),
  })
  .strict();

/** review/source-map.json — 출처 목록 (docs/11 §9, v1 계승 + attribution_required). */
export const SourceMapSchema = z
  .object({
    schema_version: schemaVersion,
    course_id: ulidStr,
    verified_at: isoDate,
    verification_note: nonempty,
    sources: z
      .array(
        z
          .object({
            id: z.string().regex(/^src-\d{3}$/),
            title: nonempty,
            publisher: nonempty,
            url: z.string().url(),
            fetched_at: isoDate,
            http_status: z.number().int(),
            license: nonempty,
            license_url: z.string().url().nullable(),
            attribution_required: z.boolean(),
            use_kind: nonempty,
            use_note: nonempty,
            used_for: nonempty,
          })
          .strict(),
      )
      .min(1),
    sections: z
      .array(z.object({ path: nonempty, source_ids: z.array(nonempty).min(1) }).strict())
      .min(1),
    agent_added: z.array(nonempty),
    not_derived_from: z.array(nonempty),
  })
  .strict();

/** content/standards/styles/ — 스타일 버전 (docs/11 §10). */
export const StyleActiveSchema = z
  .object({
    schema_version: schemaVersion,
    active: nonempty,
    activated_at: isoDatetime,
    activated_by: nonempty,
  })
  .strict();

export const StyleVersionSchema = z
  .object({
    schema_version: schemaVersion,
    version: z.string().regex(/^v\d+$/),
    created_at: isoDatetime,
    created_by: nonempty,
    prose: z
      .object({
        voice: nonempty,
        tone: nonempty,
        terminology: z.array(
          z.object({ use: nonempty, avoid: nonempty, note: z.string().nullable() }).strict(),
        ),
      })
      .strict(),
    graphics: z
      .object({ palette: z.array(nonempty), typography: nonempty, rules: z.array(nonempty) })
      .strict(),
    narration: z.object({ voice: nonempty, pace: nonempty, rules: z.array(nonempty) }).strict(),
  })
  .strict();

/** ops/runs/<run_id>.json — 작업 요약 (docs/11 §11). */
export const RunSchema = z
  .object({
    schema_version: schemaVersion,
    run_id: nonempty,
    course_id: ulidStr,
    kind: z.enum(["generate", "machine-check", "sentence-review", "section-review", "publish"]),
    started_at: isoDatetime,
    ended_at: isoDatetime.nullable(),
    status: z.enum(["success", "failed", "aborted"]),
    failed_stage: z.string().nullable(),
    stages: z.array(
      z
        .object({
          id: nonempty,
          started_at: isoDatetime,
          ended_at: isoDatetime.nullable(),
          status: z.enum(["success", "failed", "aborted", "skipped"]),
          outputs: z.array(nonempty),
          error: z.string().nullable(),
        })
        .strict(),
    ),
    metrics: z
      .object({
        model_calls: z.number().int().min(0).nullable(),
        tts_seconds: z.number().min(0).nullable(),
        uploaded_bytes: z.number().int().min(0).nullable(),
      })
      .strict(),
  })
  .strict();

/** content/standards/thresholds.json — 운영 임계치 (기존 파일 형태 그대로). */
const thresholdValue = z
  .object({ value: z.number(), unit: nonempty, default: z.number() })
  .strict();

export const ThresholdsSchema = z
  .object({
    version: z.number().int().positive(),
    updatedAt: isoDate,
    source: z.enum(["judgement", "measured"]),
    thresholds: z
      .object({
        maxSections: thresholdValue,
        maxSectionChars: thresholdValue,
        maxOverviewSeconds: thresholdValue,
        maxConcurrentJobs: thresholdValue,
        minFreeStorageGB: thresholdValue,
      })
      .strict(),
    learnerState: z
      .object({
        maxKnownFacts: thresholdValue,
        maxDefinedTerms: thresholdValue,
        maxOpenQuestions: thresholdValue,
      })
      .strict(),
  })
  .strict();

export type Progress = z.infer<typeof ProgressSchema>;
export type Rubric = z.infer<typeof RubricSchema>;
export type SourceMap = z.infer<typeof SourceMapSchema>;
export type Thresholds = z.infer<typeof ThresholdsSchema>;
export type Run = z.infer<typeof RunSchema>;
