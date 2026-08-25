import { z } from "zod";
import { chapterId, isoDatetime, mediaId, nonempty, schemaVersion, sha256 } from "./common.js";

/** chapters/<NN>/media.json — 챕터 미디어 목록 (docs/11 §2). 본문은 식별자로만 참조한다. */
export const MediaItemSchema = z
  .object({
    id: mediaId,
    kind: z.enum(["infographic", "audio"]),
    alt: z.string().nullable(),
    source: nonempty,
    r2_key: z.string().nullable(),
    url: z.string().url().nullable(),
    bytes: z.number().int().positive().nullable(),
    sha256: sha256.nullable(),
    uploaded_at: isoDatetime.nullable(),
    status: z.enum(["active", "cleanup"]),
    cleanup_marked_at: isoDatetime.nullable(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.kind === "infographic" && (!item.alt || item.alt.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${item.id}: 인포그래픽은 대체 설명(alt)이 필수다 (ST10 차단 항목)`,
      });
    }
    if (item.status === "cleanup" && !item.cleanup_marked_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${item.id}: cleanup 상태에는 cleanup_marked_at이 필수다 (90일 규칙의 기준 시각)`,
      });
    }
    if (item.url && (!item.sha256 || !item.uploaded_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${item.id}: 업로드된 항목은 sha256과 uploaded_at을 함께 기록한다`,
      });
    }
  });

export const MediaManifestSchema = z
  .object({
    schema_version: schemaVersion,
    chapter_id: chapterId,
    items: z.array(MediaItemSchema),
    video: z
      .object({
        audio_item: mediaId,
        timeline_file: nonempty,
        captions_file: nonempty,
        duration_sec: z.number().positive(),
      })
      .strict(),
  })
  .strict();

export const TimelineSceneSchema = z
  .object({
    index: z.number().int().min(0),
    start_sec: z.number().min(0),
    duration_sec: z.number().positive(),
    narration: nonempty,
    visual: z
      .object({ type: z.enum(["title", "bullets", "figure", "diagram", "code"]) })
      .passthrough(),
  })
  .strict();

export const TimelineSchema = z
  .object({
    schema_version: schemaVersion,
    chapter_id: chapterId,
    gap_sec: z.number().min(0),
    total_duration_sec: z.number().positive(),
    scenes: z.array(TimelineSceneSchema).min(1),
  })
  .strict();

export type MediaManifest = z.infer<typeof MediaManifestSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
