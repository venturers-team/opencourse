import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CourseSchema,
  thresholdsContentSha256,
  combinedSha256,
  extractReviewUnits,
  makeReaderStateSchema,
  makeSentenceReviewSchema,
  makeSentenceVerdictSchema,
  sha256Hex,
  type LearnerStateCaps,
  type ReviewUnit,
  type SentenceReview,
  DEFAULT_CAPS,
} from "@opencourse/content";
import {
  emptyReaderState,
  evictionErrors,
  readerStateSha256,
  type EvictionRecord,
  type ReaderState,
} from "./state.js";

/**
 * 문장 단위 격리 검수 세션 (구현 계획 4단계, content/standards/review-protocol.md).
 *
 * 격리는 이 API의 형태 자체로 보장된다: next()가 돌려주는 것은
 * **판정할 문장 하나와 학습자 상태뿐**이다. 원문 전체도, 이웃 문장도,
 * 다른 검수자의 판정도 이 객체 밖으로 나가지 않는다.
 *
 * 기록 거부는 스키마가 강제한다 (격리 증거·판정표·문제 목록·상한).
 * 무효화·회차 상한(≤6)·루프 감지는 세션이 지킨다.
 */
export interface SentenceReviewerOutput {
  reviewer: {
    run_id: string;
    model: string;
    fresh_context: true;
    repository_access: false;
    raw_neighbor_sentences: false;
  };
  dimensions: {
    clarity: 0 | 1 | 2;
    consistency: 0 | 1 | 2;
    flow: 0 | 1 | 2;
    logic: 0 | 1 | 2;
    novice_comprehension: 0 | 1 | 2;
  };
  severity: "pass" | "minor" | "major" | "critical";
  issues: { problem: string; suggestion: string | null }[];
  /** 판정 뒤 학습자 상태 — 파일에는 지문만 남고, 전체는 사슬 로그(jsonl)에 남는다. */
  reader_state_after: ReaderState;
  /** 이번 전이에서 버린 항목 — 사유 없는 버림은 기록 거부된다. */
  evictions: EvictionRecord[];
}

export interface NextUnit {
  unit: { id: string; path: string; line: number; ordinal: number; kind: string; text: string };
  readerState: ReaderState;
  round: number;
}

type Doc = SentenceReview;

const MAX_ROUNDS = 6;

export interface SentenceSessionOptions {
  caps?: LearnerStateCaps;
  /** 학습자 상태 사슬을 남길 파일 (ops/runs/<run>/learner-state.jsonl). */
  chainPath?: string;
  now?: () => string;
}

export class SentenceReviewSession {
  private constructor(
    private readonly courseDir: string,
    private doc: Doc,
    private readonly units: ReviewUnit[],
    private readonly caps: LearnerStateCaps,
    private readonly chainPath: string | null,
    private readonly now: () => string,
  ) {}

  /** 파일을 읽고 무효화 규칙을 적용(reconcile)한 세션을 연다. 결과는 즉시 저장된다. */
  static open(
    courseDir: string,
    standardsDir: string,
    options: SentenceSessionOptions = {},
  ): SentenceReviewSession {
    const now = options.now ?? (() => new Date().toISOString().replace(/\.\d+Z$/u, "Z"));
    const course = CourseSchema.parse(
      JSON.parse(readFileSync(join(courseDir, "course.json"), "utf8")),
    );
    const units: ReviewUnit[] = [];
    const parts: Uint8Array[] = [];
    for (const ch of course.chapters) {
      for (const sub of ch.subchapters) {
        const raw = readFileSync(join(courseDir, "chapters", ch.id, sub.file));
        parts.push(raw);
        units.push(...extractReviewUnits(raw.toString("utf8"), `${ch.id}/${sub.file}`));
      }
    }
    const sourceSha = combinedSha256(parts);
    const std = (name: string) => sha256Hex(readFileSync(join(standardsDir, name)));
    const protocol = {
      review_protocol_sha256: std("review-protocol.md"),
      beginner_baseline_sha256: std("beginner-baseline.md"),
      thresholds_sha256: thresholdsContentSha256(
        JSON.parse(readFileSync(join(standardsDir, "thresholds.json"), "utf8")),
      ),
    };

    const path = join(courseDir, "review", "sentence-review.json");
    let doc: Doc;
    if (!existsSync(path)) {
      doc = {
        schema_version: 2,
        course_id: course.id,
        protocol,
        source_sha256: sourceSha,
        status: "in_progress",
        rounds: [],
        units,
        reviews: [],
        reader_state: emptyReaderState(),
        exceptions: [],
      };
    } else {
      doc = makeSentenceReviewSchema(options.caps ?? DEFAULT_CAPS).parse(
        JSON.parse(readFileSync(path, "utf8")),
      ) as Doc;
      const protocolChanged =
        doc.protocol.review_protocol_sha256 !== protocol.review_protocol_sha256 ||
        doc.protocol.beginner_baseline_sha256 !== protocol.beginner_baseline_sha256 ||
        doc.protocol.thresholds_sha256 !== protocol.thresholds_sha256;
      if (protocolChanged) {
        // 기준이 바뀌면 진행 중 검수 전체가 무효다. 회차 계수는 이어진다.
        for (const r of doc.reviews) {
          if (!r.invalidated) {
            r.invalidated = true;
            r.invalidated_at = now();
            r.invalidated_reason = "검수 기준 변경으로 무효";
          }
        }
        doc.protocol = protocol;
        doc.status = "in_progress";
      } else if (doc.source_sha256 !== sourceSha) {
        // 본문 수정: 바뀐 지점부터 뒤 전부 무효. 앞쪽의 똑같은 문장들만 유지한다.
        let prefix = 0;
        while (
          prefix < doc.units.length &&
          prefix < units.length &&
          doc.units[prefix]?.id === units[prefix]?.id
        ) {
          prefix += 1;
        }
        const validIds = new Set(doc.units.slice(0, prefix).map((u) => u.id));
        for (const r of doc.reviews) {
          if (!r.invalidated && !validIds.has(r.sentence_id)) {
            r.invalidated = true;
            r.invalidated_at = now();
            r.invalidated_reason = "본문 수정으로 무효";
          }
        }
        doc.status =
          doc.reviews.some((r) => !r.invalidated) || doc.reviews.length > 0
            ? "revision_required"
            : "in_progress";
      }
      // 열린 회차가 있고 본문이 바뀌었다면 그 회차를 revision으로 닫는다
      const open = doc.rounds.find((r) => r.ended_at === null);
      if (open && open.source_sha256 !== sourceSha) {
        open.ended_at = now();
        open.clean_pass = false;
        open.ended_reason = "revision";
      }
      doc.units = units;
      doc.source_sha256 = sourceSha;
    }
    const session = new SentenceReviewSession(
      courseDir,
      doc,
      units,
      options.caps ?? DEFAULT_CAPS,
      options.chainPath ?? null,
      now,
    );
    session.restoreReaderState();
    session.flush();
    return session;
  }

  /**
   * doc.reader_state를 유효 접두사의 끝 상태로 맞춘다.
   * 마지막 유효 판정의 state_after_sha256과 일치하는 스냅숏을 사슬 로그에서 찾는다.
   * 무효화로 되감을 때 사슬 로그가 없으면 재개할 수 없다 — 그것이 로그의 존재 이유다.
   */
  private restoreReaderState(): void {
    let lastValid: { unitId: string; sha: string } | null = null;
    for (const unit of this.units) {
      const v = this.validVerdict(unit.id);
      if (!v) break;
      lastValid = { unitId: unit.id, sha: v.state_after_sha256 };
    }
    if (!lastValid) {
      this.doc.reader_state = emptyReaderState();
      return;
    }
    if (readerStateSha256(this.doc.reader_state as ReaderState) === lastValid.sha) return; // 이미 정합
    if (this.chainPath && existsSync(this.chainPath)) {
      const lines = readFileSync(this.chainPath, "utf8").split("\n").filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const entry = JSON.parse(lines[i] as string) as { unit_id: string; state: ReaderState };
        if (
          entry.unit_id === lastValid.unitId &&
          readerStateSha256(entry.state) === lastValid.sha
        ) {
          this.doc.reader_state = entry.state;
          return;
        }
      }
    }
    /* 사슬 로그가 없거나 스냅숏이 없다 — 빈 상태로 표시만 해 둔다.
       재개를 시도하면 stateBefore의 지문 검증이 명확한 오류로 막는다 (읽기용 열람은 계속 된다). */
    this.doc.reader_state = emptyReaderState();
  }

  /** 유효한(무효화되지 않은) 최신 판정. */
  private validVerdict(unitId: string) {
    for (let i = this.doc.reviews.length - 1; i >= 0; i -= 1) {
      const r = this.doc.reviews[i];
      if (r && r.sentence_id === unitId && !r.invalidated) return r;
    }
    return null;
  }

  private openRound() {
    return this.doc.rounds.find((r) => r.ended_at === null) ?? null;
  }

  /** 새 회차 시작 — 상한 6회, 이전 지문으로 되돌아오면 루프로 판정해 멈춘다. */
  startRound(): number {
    if (this.openRound()) throw new Error("이미 진행 중인 회차가 있습니다");
    if (this.doc.rounds.length >= MAX_ROUNDS) {
      this.doc.status = "halted";
      this.flush();
      throw new Error(
        `회차 상한(${MAX_ROUNDS}회)에 닿았습니다 — 문장이 아니라 구조가 잘못된 경우가 대부분입니다. 관리자 판단이 필요합니다`,
      );
    }
    const seen = this.doc.rounds.find((r) => r.source_sha256 === this.doc.source_sha256);
    if (seen && !seen.clean_pass) {
      this.doc.status = "halted";
      this.flush();
      throw new Error(
        `이전 ${seen.round}회차에서 이미 본 원문 지문으로 되돌아왔습니다 — 같은 자리를 맴돌고 있으므로 멈춥니다`,
      );
    }
    const round = this.doc.rounds.length + 1;
    this.doc.rounds.push({
      round,
      started_at: this.now(),
      ended_at: null,
      clean_pass: false,
      source_sha256: this.doc.source_sha256,
      ended_reason: null,
    });
    this.doc.status = "in_progress";
    this.flush();
    return round;
  }

  /**
   * 다음 판정 대상 — 문장 하나와 학습자 상태만 돌려준다.
   * 모든 문장이 판정되어 있으면 null.
   */
  next(): NextUnit | null {
    const pending = this.units.find((u) => !this.validVerdict(u.id));
    if (!pending) return null;
    const round = this.openRound();
    if (!round) throw new Error("회차를 먼저 시작하십시오 (startRound)");
    for (const unit of this.units) {
      if (!this.validVerdict(unit.id)) {
        return {
          unit: {
            id: unit.id,
            path: unit.path,
            line: unit.line,
            ordinal: unit.ordinal,
            kind: unit.kind,
            text: unit.text,
          },
          readerState: this.stateBefore(unit.id),
          round: round.round,
        };
      }
    }
    return null;
  }

  /** unit 직전까지의 학습자 상태 — 유효 접두사의 끝(doc.reader_state)을 지문으로 검증해 준다. */
  private stateBefore(unitId: string): ReaderState {
    let lastSha: string | null = null;
    for (const unit of this.units) {
      if (unit.id === unitId) {
        const state = this.doc.reader_state as ReaderState;
        const expected = lastSha ?? readerStateSha256(emptyReaderState());
        if (readerStateSha256(state) !== expected) {
          throw new Error(
            `학습자 상태 사슬이 어긋났습니다 (${unitId} 직전) — 세션을 다시 여십시오`,
          );
        }
        return state;
      }
      const verdict = this.validVerdict(unit.id);
      if (!verdict) {
        throw new Error(`사슬이 끊겼습니다: ${unit.id}에 유효한 판정이 없습니다`);
      }
      lastSha = verdict.state_after_sha256;
    }
    throw new Error(`문장을 찾을 수 없습니다: ${unitId}`);
  }

  /** 검수자 출력 제출 — 스키마가 거부하는 판정은 기록되지 않는다. */
  submit(output: SentenceReviewerOutput): { remaining: number; roundClosed: boolean } {
    const target = this.next();
    if (!target) throw new Error("판정할 문장이 없습니다");
    const before = target.readerState;
    // 장부 상한(40/40/20)은 이제 판정 스키마 밖이므로 여기서 강제한다
    const after = makeReaderStateSchema(this.caps).parse(output.reader_state_after) as ReaderState;
    const evictionProblems = evictionErrors(before, after, output.evictions);
    if (evictionProblems.length > 0) {
      throw new Error(`기록 거부 — ${evictionProblems.join("; ")}`);
    }
    const verdict = makeSentenceVerdictSchema(this.caps).parse({
      sentence_id: target.unit.id,
      round: target.round,
      reviewed_at: this.now(),
      state_before_sha256: readerStateSha256(before),
      reviewer: output.reviewer,
      dimensions: output.dimensions,
      severity: output.severity,
      issues: output.issues,
      state_after_sha256: readerStateSha256(after),
      evictions: output.evictions,
      invalidated: false,
      invalidated_at: null,
      invalidated_reason: null,
    });
    this.doc.reviews.push(verdict);
    this.doc.reader_state = after;
    if (this.chainPath) {
      mkdirSync(dirname(this.chainPath), { recursive: true });
      appendFileSync(
        this.chainPath,
        JSON.stringify({ unit_id: target.unit.id, state: after }) + "\n",
      );
    }
    const remaining = this.units.filter((u) => !this.validVerdict(u.id)).length;
    let roundClosed = false;
    if (remaining === 0) {
      this.closeRound();
      roundClosed = true;
    }
    this.flush();
    return { remaining, roundClosed };
  }

  /** 막고 있는 문장들 — 중대, 또는 예외 승인 없는 심각. */
  blockingUnits(): string[] {
    const excepted = new Set(this.doc.exceptions.map((e) => e.unit_id));
    const blocking: string[] = [];
    for (const unit of this.units) {
      const v = this.validVerdict(unit.id);
      if (!v) continue;
      if (v.severity === "major") blocking.push(unit.id);
      if (v.severity === "critical" && !excepted.has(unit.id)) blocking.push(unit.id);
    }
    return blocking;
  }

  private closeRound(): void {
    const round = this.openRound();
    if (!round) return;
    const blocking = this.blockingUnits();
    round.ended_at = this.now();
    round.clean_pass = blocking.length === 0;
    round.ended_reason = blocking.length === 0 ? "clean_pass" : "revision";
    this.doc.status = blocking.length === 0 ? "clean_pass" : "revision_required";
  }

  /** 심각 등급만, 사유와 승인자를 남기고 예외 처리한다. 누적 표시는 exceptions 길이다. */
  approveException(unitId: string, reason: string, approvedBy: string): void {
    const verdict = this.validVerdict(unitId);
    if (!verdict) throw new Error(`유효한 판정이 없습니다: ${unitId}`);
    if (verdict.severity !== "critical") {
      throw new Error("예외 승인은 심각 등급만 가능합니다 (중대는 고쳐야 합니다)");
    }
    if (!reason.trim() || !approvedBy.trim()) {
      throw new Error("사유와 승인자 없는 예외는 기록할 수 없습니다");
    }
    this.doc.exceptions.push({
      unit_id: unitId,
      grade: "critical",
      reason,
      approved_by: approvedBy,
      approved_at: this.now(),
    });
    // 완주 뒤의 승인이면 마지막 회차 판정을 다시 계산한다
    const allReviewed = this.units.every((u) => this.validVerdict(u.id));
    const last = this.doc.rounds[this.doc.rounds.length - 1];
    if (allReviewed && last && last.ended_at !== null) {
      const blocking = this.blockingUnits();
      last.clean_pass = blocking.length === 0;
      last.ended_reason = blocking.length === 0 ? "clean_pass" : "revision";
      this.doc.status = blocking.length === 0 ? "clean_pass" : "revision_required";
    }
    this.flush();
  }

  progress(): { total: number; reviewed: number; blocking: string[]; status: Doc["status"] } {
    const reviewed = this.units.filter((u) => this.validVerdict(u.id)).length;
    return {
      total: this.units.length,
      reviewed,
      blocking: this.blockingUnits(),
      status: this.doc.status,
    };
  }

  invalidatedCount(): number {
    return this.doc.reviews.filter((r) => r.invalidated).length;
  }

  private flush(): void {
    const parsed = makeSentenceReviewSchema(this.caps).parse(this.doc);
    mkdirSync(join(this.courseDir, "review"), { recursive: true });
    writeFileSync(
      join(this.courseDir, "review", "sentence-review.json"),
      JSON.stringify(parsed, null, 2) + "\n",
    );
  }
}
