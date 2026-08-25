import { z } from "zod";
import {
  chapterId,
  courseStatus,
  isoDatetime,
  nonempty,
  schemaVersion,
  slug,
  subchapterFile,
  ulidStr,
} from "./common.js";

/** course.json — 교재 정보 정본 (docs/11 §1). */
export const SubchapterSchema = z
  .object({
    file: subchapterFile,
    title: nonempty,
  })
  .strict();

export const ChapterSchema = z
  .object({
    id: chapterId,
    title: nonempty,
    summary: nonempty,
    estimated_minutes: z.number().int().positive(),
    outcomes: z.array(nonempty).min(1),
    subchapters: z.array(SubchapterSchema).min(1),
  })
  .strict();

export const CourseSchema = z
  .object({
    schema_version: schemaVersion,
    id: ulidStr,
    title: nonempty,
    slug,
    summary: nonempty,
    topic: nonempty,
    audience: nonempty,
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    language: nonempty,
    learning_outcomes: z.array(nonempty).min(1),
    prerequisites: z.array(nonempty).min(1),
    content_style: nonempty,
    status: courseStatus,
    created_at: isoDatetime,
    updated_at: isoDatetime,
    published_at: isoDatetime.nullable(),
    style_version: nonempty,
    estimated_minutes: z.number().int().positive(),
    edit_count: z.number().int().min(0),
    rewrite_after_publish_count: z.number().int().min(0),
    chapters: z.array(ChapterSchema).min(1),
    generated_by: z.object({ run_id: nonempty, style_version: nonempty }).strict(),
  })
  .strict();

export type Course = z.infer<typeof CourseSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
