import { z } from "zod";

/** 공통 규약 (docs/11 §0). */
export const schemaVersion = z.literal(1);
export const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "SHA-256 소문자 64자리여야 한다");
export const isoDatetime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    "ISO 8601 시각(오프셋 포함)이어야 한다",
  );
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const nonempty = z.string().min(1);
export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const ulidStr = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID여야 한다");
export const chapterId = z.string().regex(/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const subchapterFile = z.string().regex(/^\d{2}\.mdx$/);
export const mediaId = z.string().regex(/^(?:fig|aud)-\d{2}$/);
export const unitId = z
  .string()
  .regex(/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\/\d{2}\.mdx:\d+:[0-9a-f]{10}$/);

export const courseStatus = z.enum(["generating", "draft", "published", "hidden"]);
export const reviewGrade = z.enum(["pass", "minor", "major", "critical"]);
export const machineGrade = z.enum(["block", "warn"]);
export const gateState = z.enum(["missing", "failed", "stale", "passed"]);
export const reviewStatus = z.enum(["in_progress", "revision_required", "clean_pass", "halted"]);

export const score = z.union([z.literal(0), z.literal(1), z.literal(2)]);
