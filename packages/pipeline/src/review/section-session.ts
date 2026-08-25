import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CourseSchema,
  SectionReviewSchema,
  SectionVerdictSchema,
  combinedSha256,
  sha256Hex,
  type SectionReview,
} from "@opencourse/content";

/**
 * 섹션(챕터) 전체 검수 세션 (구현 계획 4단계, docs/05).
 * 문장 검수와 달리 맥락을 준다 — 빠진 것을 찾으려면 이미 다뤄진 것을 알아야 한다.
 * 검수자가 받는 것: 이 챕터의 본문 전체 + 앞 챕터들이 다룬 것(covered)과 정의한 것(defines).
 * 뒤 챕터의 본문은 절대 주지 않는다.
 */
export interface SectionReviewerOutput {
  reviewer: { run_id: string; model: string; read_whole_chapter: true };
  dimensions: {
    completeness: 0 | 1 | 2;
    sequence: 0 | 1 | 2;
    frame_consistency: 0 | 1 | 2;
    evidence: 0 | 1 | 2;
    learner_exit: 0 | 1 | 2;
  };
  severity: "pass" | "minor" | "major" | "critical";
  missing: { what: string; why_needed: string }[];
  issues: { problem: string; suggestion: string | null }[];
  covered: string[];
  defines: string[];
}

export interface NextChapter {
  chapter_id: string;
  title: string;
  body: string;
  prior: { chapter_id: string; covered: string[]; defines: string[] }[];
  round: number;
}

interface ChapterInfo {
  id: string;
  title: string;
  bodySha256: string;
  body: string;
}

const MAX_ROUNDS = 6;

export class SectionReviewSession {
  private constructor(
    private readonly courseDir: string,
    private doc: SectionReview,
    private readonly chapters: ChapterInfo[],
    private readonly now: () => string,
  ) {}

  static open(
    courseDir: string,
    standardsDir: string,
    options: { now?: () => string } = {},
  ): SectionReviewSession {
    const now = options.now ?? (() => new Date().toISOString().replace(/\.\d+Z$/u, "Z"));
    const course = CourseSchema.parse(
      JSON.parse(readFileSync(join(courseDir, "course.json"), "utf8")),
    );
    const chapters: ChapterInfo[] = course.chapters.map((ch) => {
      const parts = ch.subchapters.map((s) =>
        readFileSync(join(courseDir, "chapters", ch.id, s.file)),
      );
      return {
        id: ch.id,
        title: ch.title,
        bodySha256: combinedSha256(parts),
        body: parts.map((p) => p.toString("utf8")).join("\n\n"),
      };
    });
    const std = (name: string) => sha256Hex(readFileSync(join(standardsDir, name)));
    const protocol = {
      review_protocol_sha256: std("review-protocol.md"),
      beginner_baseline_sha256: std("beginner-baseline.md"),
      thresholds_sha256: std("thresholds.json"),
    };
    const path = join(courseDir, "review", "section-review.json");
    let doc: SectionReview;
    if (!existsSync(path)) {
      doc = {
        schema_version: 1,
        course_id: course.id,
        protocol,
        status: "in_progress",
        reviews: [],
        exceptions: [],
      };
    } else {
      doc = SectionReviewSchema.parse(JSON.parse(readFileSync(path, "utf8")));
      const protocolChanged =
        doc.protocol.review_protocol_sha256 !== protocol.review_protocol_sha256 ||
        doc.protocol.beginner_baseline_sha256 !== protocol.beginner_baseline_sha256 ||
        doc.protocol.thresholds_sha256 !== protocol.thresholds_sha256;
      const invalidate = (chapterIds: Set<string>, reason: string) => {
        for (const r of doc.reviews) {
          if (!r.invalidated && chapterIds.has(r.chapter_id)) {
            r.invalidated = true;
            r.invalidated_at = now();
            r.invalidated_reason = reason;
          }
        }
      };
      if (protocolChanged) {
        invalidate(new Set(chapters.map((c) => c.id)), "검수 기준 변경으로 무효");
        doc.protocol = protocol;
        doc.status = "in_progress";
      } else {
        // 앞 챕터가 바뀌면 그 챕터와 뒤따르는 모든 챕터의 판정이 무효다
        const firstChanged = chapters.findIndex((ch) => {
          const v = [...doc.reviews]
            .reverse()
            .find((r) => r.chapter_id === ch.id && !r.invalidated);
          return v !== undefined && v.body_sha256 !== ch.bodySha256;
        });
        if (firstChanged >= 0) {
          invalidate(
            new Set(chapters.slice(firstChanged).map((c) => c.id)),
            "본문 수정으로 무효 (앞 챕터 변경 포함)",
          );
          doc.status = "revision_required";
        }
      }
    }
    const session = new SectionReviewSession(courseDir, doc, chapters, now);
    session.flush();
    return session;
  }

  private validVerdict(chapterId: string) {
    for (let i = this.doc.reviews.length - 1; i >= 0; i -= 1) {
      const r = this.doc.reviews[i];
      if (r && r.chapter_id === chapterId && !r.invalidated) return r;
    }
    return null;
  }

  /** 다음 판정 대상 챕터 — 본문 전체와 앞 챕터의 확정 내용만 준다. */
  next(): NextChapter | null {
    for (let i = 0; i < this.chapters.length; i += 1) {
      const ch = this.chapters[i] as ChapterInfo;
      if (this.validVerdict(ch.id)) continue;
      const prior = this.chapters.slice(0, i).map((p) => {
        const v = this.validVerdict(p.id);
        if (!v) throw new Error(`앞 챕터 ${p.id}의 판정이 먼저 필요합니다`);
        return { chapter_id: p.id, covered: v.covered, defines: v.defines };
      });
      const attempts = this.doc.reviews.filter((r) => r.chapter_id === ch.id).length;
      if (attempts >= MAX_ROUNDS) {
        this.doc.status = "halted";
        this.flush();
        throw new Error(`${ch.id}의 검수 회차가 상한(${MAX_ROUNDS})에 닿았습니다`);
      }
      return { chapter_id: ch.id, title: ch.title, body: ch.body, prior, round: attempts + 1 };
    }
    return null;
  }

  submit(output: SectionReviewerOutput): { remaining: number } {
    const target = this.next();
    if (!target) throw new Error("판정할 챕터가 없습니다");
    const ch = this.chapters.find((c) => c.id === target.chapter_id) as ChapterInfo;
    const verdict = SectionVerdictSchema.parse({
      chapter_id: ch.id,
      round: target.round,
      reviewed_at: this.now(),
      body_sha256: ch.bodySha256,
      context: {
        prior_chapters: this.chapters
          .slice(0, this.chapters.indexOf(ch))
          .map((p) => ({ chapter_id: p.id, body_sha256: p.bodySha256 })),
      },
      reviewer: output.reviewer,
      dimensions: output.dimensions,
      severity: output.severity,
      missing: output.missing,
      issues: output.issues,
      covered: output.covered,
      defines: output.defines,
      invalidated: false,
      invalidated_at: null,
      invalidated_reason: null,
    });
    this.doc.reviews.push(verdict);
    const remaining = this.chapters.filter((c) => !this.validVerdict(c.id)).length;
    if (remaining === 0) {
      const blocking = this.blockingChapters();
      this.doc.status = blocking.length === 0 ? "clean_pass" : "revision_required";
    }
    this.flush();
    return { remaining };
  }

  blockingChapters(): string[] {
    const excepted = new Set(this.doc.exceptions.map((e) => e.chapter_id));
    const blocking: string[] = [];
    for (const ch of this.chapters) {
      const v = this.validVerdict(ch.id);
      if (!v) continue;
      if (v.severity === "major") blocking.push(ch.id);
      if (v.severity === "critical" && !excepted.has(ch.id)) blocking.push(ch.id);
    }
    return blocking;
  }

  approveException(chapterId: string, reason: string, approvedBy: string): void {
    const verdict = this.validVerdict(chapterId);
    if (!verdict) throw new Error(`유효한 판정이 없습니다: ${chapterId}`);
    if (verdict.severity !== "critical") {
      throw new Error("예외 승인은 심각 등급만 가능합니다");
    }
    if (!reason.trim() || !approvedBy.trim()) {
      throw new Error("사유와 승인자 없는 예외는 기록할 수 없습니다");
    }
    this.doc.exceptions.push({
      chapter_id: chapterId,
      grade: "critical",
      reason,
      approved_by: approvedBy,
      approved_at: this.now(),
    });
    if (this.chapters.every((c) => this.validVerdict(c.id))) {
      this.doc.status = this.blockingChapters().length === 0 ? "clean_pass" : "revision_required";
    }
    this.flush();
  }

  progress(): {
    total: number;
    reviewed: number;
    blocking: string[];
    status: SectionReview["status"];
  } {
    return {
      total: this.chapters.length,
      reviewed: this.chapters.filter((c) => this.validVerdict(c.id)).length,
      blocking: this.blockingChapters(),
      status: this.doc.status,
    };
  }

  invalidatedCount(): number {
    return this.doc.reviews.filter((r) => r.invalidated).length;
  }

  private flush(): void {
    const parsed = SectionReviewSchema.parse(this.doc);
    mkdirSync(join(this.courseDir, "review"), { recursive: true });
    writeFileSync(
      join(this.courseDir, "review", "section-review.json"),
      JSON.stringify(parsed, null, 2) + "\n",
    );
  }
}
