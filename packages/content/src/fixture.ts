import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  combinedSha256,
  courseContentSha256,
  sha256Hex,
  sentenceSha256,
  shortHash,
} from "./fingerprint.js";
import { ulid } from "./ids.js";
import { MR_CODES } from "./schemas/manual-review.js";

/**
 * 테스트용 고정 교재 생성기 (구현 계획 1단계).
 * 지문이 전부 맞아떨어지는 "발행 가능" 상태의 교재를 만들고,
 * sabotage 옵션으로 불변 조건을 하나씩 부러뜨린다 — canPublish 진리표의 재료다.
 */
export interface Sabotage {
  statusOverride?: "generating" | "draft" | "published" | "hidden";
  dropFile?: string;
  tamperChapterBody?: boolean;
  tamperStandards?: boolean;
  machineFail?: boolean;
  pendingBlocker?: boolean;
  mediaMissingUrl?: boolean;
  sentenceNotClean?: boolean;
}

const T = "2026-08-25T12:00:00+09:00";
const CH1 = "01-intro";
const CH2 = "02-practice";
const SENT1 = "위젯은 화면을 이루는 가장 작은 부품이다.";
const SENT2 = "트리를 그리면 코드가 화면으로 보인다.";

function j(v: unknown): string {
  return JSON.stringify(v, null, 2) + "\n";
}

export function writeFixtureCourse(root: string, sabotage: Sabotage = {}) {
  rmSync(root, { recursive: true, force: true });
  const standardsDir = join(root, "standards");
  const courseDir = join(root, "course");
  mkdirSync(join(standardsDir), { recursive: true });
  mkdirSync(join(courseDir, "review"), { recursive: true });
  mkdirSync(join(courseDir, "chapters", CH1), { recursive: true });
  mkdirSync(join(courseDir, "chapters", CH2), { recursive: true });

  // 검수 기준 (fixture 정본)
  writeFileSync(join(standardsDir, "review-protocol.md"), "# 검수 프로토콜 (fixture)\n");
  writeFileSync(join(standardsDir, "beginner-baseline.md"), "# 초보자 기준 (fixture)\n");
  writeFileSync(join(standardsDir, "scoring-rules.md"), "# 채점 기준 (fixture)\n");
  writeFileSync(join(standardsDir, "manual-review-items.md"), "# 수동 검토 항목 (fixture)\n");
  const tv = (value: number, unit: string) => ({ value, unit, default: value });
  writeFileSync(
    join(standardsDir, "thresholds.json"),
    j({
      version: 1,
      updatedAt: "2026-08-25",
      source: "judgement",
      thresholds: {
        maxSections: tv(15, "count"),
        maxSectionChars: tv(3000, "chars"),
        maxOverviewSeconds: tv(90, "seconds"),
        maxConcurrentJobs: tv(2, "count"),
        minFreeStorageGB: tv(1, "GB"),
      },
      learnerState: {
        maxKnownFacts: tv(40, "count"),
        maxDefinedTerms: tv(40, "count"),
        maxOpenQuestions: tv(20, "count"),
      },
    }),
  );
  const std = (name: string) => sha256Hex(readFileSync(join(standardsDir, name)));

  // 본문과 미디어
  const mdx1 = `---\ntitle: 위젯이 뭐예요\nsummary: 위젯의 뜻\n---\n\n${SENT1}\n\n![](media:fig-01)\n`;
  const mdx2 = `---\ntitle: 실습\nsummary: 트리 그리기\n---\n\n${SENT2}\n`;
  writeFileSync(join(courseDir, "chapters", CH1, "01.mdx"), mdx1);
  writeFileSync(join(courseDir, "chapters", CH2, "01.mdx"), mdx2);

  const mediaFor = (chapterId: string) => ({
    schema_version: 1,
    chapter_id: chapterId,
    items: [
      {
        id: "fig-01",
        kind: "infographic",
        alt: "위젯 트리를 나타낸 그림",
        purpose: "트리 구조를 눈으로 확인하게 한다",
        source: `ops/runs/gen-fixture-202608251200/${chapterId}/fig-01.png`,
        r2_key: `media/${chapterId}/fig-01.png`,
        url:
          sabotage.mediaMissingUrl && chapterId === CH1
            ? null
            : `https://media.example.com/${chapterId}/fig-01.png`,
        bytes: sabotage.mediaMissingUrl && chapterId === CH1 ? null : 40960,
        sha256:
          sabotage.mediaMissingUrl && chapterId === CH1 ? null : sha256Hex(`png-${chapterId}`),
        uploaded_at: sabotage.mediaMissingUrl && chapterId === CH1 ? null : T,
        status: "active",
        cleanup_marked_at: null,
      },
      {
        id: "aud-01",
        kind: "audio",
        alt: null,
        purpose: "챕터 개요 나레이션",
        source: `ops/runs/gen-fixture-202608251200/${chapterId}/aud-01.mp3`,
        r2_key: `media/${chapterId}/aud-01.mp3`,
        url: `https://media.example.com/${chapterId}/aud-01.mp3`,
        bytes: 300000,
        sha256: sha256Hex(`mp3-${chapterId}`),
        uploaded_at: T,
        status: "active",
        cleanup_marked_at: null,
      },
    ],
    video: {
      audio_item: "aud-01",
      timeline_file: "timeline.json",
      captions_file: "captions.vtt",
      duration_sec: 84,
    },
  });
  for (const ch of [CH1, CH2]) {
    writeFileSync(join(courseDir, "chapters", ch, "media.json"), j(mediaFor(ch)));
    writeFileSync(
      join(courseDir, "chapters", ch, "timeline.json"),
      j({
        schema_version: 1,
        chapter_id: ch,
        gap_sec: 2,
        total_duration_sec: 84,
        scenes: [
          {
            index: 0,
            start_sec: 0,
            duration_sec: 84,
            narration: "이 챕터의 개요입니다.",
            visual: { type: "title", text: "개요" },
          },
        ],
      }),
    );
    writeFileSync(
      join(courseDir, "chapters", ch, "captions.vtt"),
      "WEBVTT\n\n00:00.000 --> 01:24.000\n이 챕터의 개요입니다.\n",
    );
  }

  // course.json
  const courseId = ulid();
  const course = {
    schema_version: 1,
    id: courseId,
    title: "고정 교재",
    slug: "fixture-course",
    summary: "테스트용 고정 교재",
    topic: "테스트",
    audience: "테스트 독자",
    difficulty: "beginner",
    language: "ko",
    learning_outcomes: ["위젯 트리를 읽을 수 있다"],
    prerequisites: ["없음"],
    content_style: "차분한 설명체",
    status: sabotage.statusOverride ?? "draft",
    created_at: T,
    updated_at: T,
    published_at: null,
    style_version: "v1",
    estimated_minutes: 30,
    edit_count: 0,
    rewrite_after_publish_count: 0,
    chapters: [
      {
        id: CH1,
        title: "위젯이 뭐예요",
        summary: "위젯의 뜻",
        estimated_minutes: 15,
        outcomes: ["위젯을 정의할 수 있다"],
        subchapters: [{ file: "01.mdx", title: "위젯이 뭐예요" }],
      },
      {
        id: CH2,
        title: "실습",
        summary: "트리 그리기",
        estimated_minutes: 15,
        outcomes: ["트리를 그릴 수 있다"],
        subchapters: [{ file: "01.mdx", title: "실습" }],
      },
    ],
    generated_by: { run_id: "gen-fixture-202608251200", style_version: "v1" },
  };
  writeFileSync(join(courseDir, "course.json"), j(course));

  // 지문 계산
  const read = (p: string) => readFileSync(join(courseDir, p));
  const body1 = combinedSha256([read(`chapters/${CH1}/01.mdx`)]);
  const body2 = combinedSha256([read(`chapters/${CH2}/01.mdx`)]);
  const bodyAll = combinedSha256([read(`chapters/${CH1}/01.mdx`), read(`chapters/${CH2}/01.mdx`)]);
  const inputPaths = [
    "course.json",
    `chapters/${CH1}/01.mdx`,
    `chapters/${CH2}/01.mdx`,
    `chapters/${CH1}/media.json`,
    `chapters/${CH2}/media.json`,
  ];

  // 기계 검사
  const machineDefects = sabotage.machineFail
    ? [
        {
          code: "ST02",
          kind: "static",
          grade: "block",
          message: "출처 주소가 비어 있다",
          path: "review/source-map.json",
          line: null,
          detail: null,
        },
      ]
    : [];
  writeFileSync(
    join(courseDir, "review", "machine-check.json"),
    j({
      schema_version: 1,
      course_id: courseId,
      checked_at: T,
      pass: machineDefects.length === 0,
      blocker_count: machineDefects.length,
      warning_count: 0,
      inputs: inputPaths.map((p) => ({
        path: p,
        sha256:
          p === "course.json"
            ? courseContentSha256(JSON.parse(read(p).toString("utf8")))
            : sha256Hex(read(p)),
      })),
      standards: {
        scoring_rules_sha256: std("scoring-rules.md"),
        manual_review_items_sha256: std("manual-review-items.md"),
        thresholds_sha256: std("thresholds.json"),
      },
      defects: machineDefects,
    }),
  );

  // 문장 검수
  const unit = (path: string, ordinal: number, line: number, text: string) => ({
    id: `${path}:${ordinal}:${shortHash(sentenceSha256(text))}`,
    path,
    line,
    ordinal,
    kind: "prose",
    text,
    text_sha256: sentenceSha256(text),
  });
  const units = [unit(`${CH1}/01.mdx`, 1, 6, SENT1), unit(`${CH2}/01.mdx`, 2, 6, SENT2)];
  const readerState = {
    understood_facts: ["위젯은 화면의 가장 작은 부품이다"],
    defined_terms: [{ term: "위젯", definition: "화면을 이루는 가장 작은 부품" }],
    open_questions: [],
    evictions: [],
  };
  writeFileSync(
    join(courseDir, "review", "sentence-review.json"),
    j({
      schema_version: 1,
      course_id: courseId,
      protocol: {
        review_protocol_sha256: std("review-protocol.md"),
        beginner_baseline_sha256: std("beginner-baseline.md"),
        thresholds_sha256: std("thresholds.json"),
      },
      source_sha256: bodyAll,
      status: sabotage.sentenceNotClean ? "revision_required" : "clean_pass",
      rounds: [
        {
          round: 1,
          started_at: T,
          ended_at: T,
          clean_pass: !sabotage.sentenceNotClean,
          source_sha256: bodyAll,
          ended_reason: sabotage.sentenceNotClean ? "revision" : "clean_pass",
        },
      ],
      units,
      reviews: units.map((u) => ({
        sentence_id: u.id,
        round: 1,
        reviewed_at: T,
        state_before_sha256: sha256Hex(`state-${u.ordinal}`),
        reviewer: {
          run_id: `sr-r1-u${u.ordinal}-202608251200`,
          model: "claude-fable-5",
          fresh_context: true,
          repository_access: false,
          raw_neighbor_sentences: false,
        },
        dimensions: { clarity: 2, consistency: 2, flow: 2, logic: 2, novice_comprehension: 2 },
        severity: "pass",
        issues: [],
        reader_state_after: readerState,
        invalidated: false,
        invalidated_at: null,
        invalidated_reason: null,
      })),
      reader_state: readerState,
      exceptions: [],
    }),
  );

  // 섹션 검수
  const sectionVerdict = (
    chapterId: string,
    body: string,
    prior: { chapter_id: string; body_sha256: string }[],
  ) => ({
    chapter_id: chapterId,
    round: 1,
    reviewed_at: T,
    body_sha256: body,
    context: { prior_chapters: prior },
    reviewer: {
      run_id: `sc-r1-${chapterId}-202608251200`,
      model: "claude-fable-5",
      read_whole_chapter: true,
    },
    dimensions: {
      completeness: 2,
      sequence: 2,
      frame_consistency: 2,
      evidence: 2,
      learner_exit: 2,
    },
    severity: "pass",
    missing: [],
    issues: [],
    covered: ["위젯의 정의"],
    defines: ["위젯"],
    invalidated: false,
    invalidated_at: null,
    invalidated_reason: null,
  });
  writeFileSync(
    join(courseDir, "review", "section-review.json"),
    j({
      schema_version: 1,
      course_id: courseId,
      protocol: {
        review_protocol_sha256: std("review-protocol.md"),
        beginner_baseline_sha256: std("beginner-baseline.md"),
        thresholds_sha256: std("thresholds.json"),
      },
      status: "clean_pass",
      reviews: [
        sectionVerdict(CH1, body1, []),
        sectionVerdict(CH2, body2, [{ chapter_id: CH1, body_sha256: body1 }]),
      ],
      exceptions: [],
    }),
  );

  // 수동 검토
  writeFileSync(
    join(courseDir, "review", "manual-review.json"),
    j({
      schema_version: 1,
      course_id: courseId,
      items: (Object.keys(MR_CODES) as (keyof typeof MR_CODES)[]).map((code) => {
        const pending = sabotage.pendingBlocker && code === "MR05";
        return {
          code,
          grade: MR_CODES[code].grade,
          status: pending ? "pending" : "done",
          note: pending ? null : "확인 완료",
          waive_reason: null,
          actor: pending ? null : "관리자",
          at: pending ? null : T,
          evidence: null,
        };
      }),
      waived_count_total: 0,
      updated_at: T,
    }),
  );

  // 진행 요약·루브릭·출처
  writeFileSync(
    join(courseDir, "review", "progress.json"),
    j({
      schema_version: 1,
      course_id: courseId,
      gates: {
        machine_check: { state: "passed", checked_at: T },
        sentence_review: { state: "passed", round: 1, clean_pass_at: T },
        section_review: { state: "passed" },
        manual_review: { state: "passed", open_blockers: 0 },
      },
      fingerprints_ok: true,
      next_actions: ["발행 여부를 판단한다"],
      updated_at: T,
    }),
  );
  writeFileSync(
    join(courseDir, "review", "rubric.json"),
    j({
      schema_version: 1,
      course_id: courseId,
      artifact: "위젯 트리 그림 한 장",
      grading_note: "학습자가 그린 트리를 채점한다",
      criteria: [
        {
          id: "C-1",
          outcome: "위젯 트리를 읽을 수 있다",
          reads: ["트리 그림"],
          levels: { 미달: "트리가 없다", 기준: "부모 자식이 맞다", 우수: "깊이까지 정확하다" },
        },
      ],
      deferred: [],
      quality_checks: { scope: "30분 안에 끝난다" },
    }),
  );
  writeFileSync(
    join(courseDir, "review", "source-map.json"),
    j({
      schema_version: 1,
      course_id: courseId,
      verified_at: "2026-08-25",
      verification_note: "출처 1건을 열어 생존과 제목을 확인했다",
      sources: [
        {
          id: "src-001",
          title: "Flutter 공식 문서",
          publisher: "Google",
          url: "https://docs.flutter.dev/",
          fetched_at: "2026-08-25",
          http_status: 200,
          license: "CC BY 4.0",
          license_url: "https://creativecommons.org/licenses/by/4.0/",
          attribution_required: true,
          use_kind: "concept-reference",
          use_note: "위젯 정의만 참조",
          used_for: "위젯의 정의 설명",
        },
      ],
      sections: [{ path: `chapters/${CH1}/01.mdx`, source_ids: ["src-001"] }],
      agent_added: ["트리 비유"],
      not_derived_from: [],
    }),
  );

  // 파괴 공작 (검수 뒤에 가한다 — 지문 드리프트 재현)
  if (sabotage.tamperChapterBody) {
    writeFileSync(join(courseDir, "chapters", CH1, "01.mdx"), mdx1 + "\n한 문장을 몰래 고쳤다.\n");
  }
  if (sabotage.tamperStandards) {
    writeFileSync(join(standardsDir, "scoring-rules.md"), "# 채점 기준 (몰래 고침)\n");
  }
  if (sabotage.dropFile) {
    const p = join(courseDir, sabotage.dropFile);
    if (existsSync(p)) rmSync(p);
  }

  return { courseDir, standardsDir, courseId };
}
