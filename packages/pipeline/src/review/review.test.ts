import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canPublish, writeFixtureCourse } from "@opencourse/content";
import { registerDraft } from "../draft-register.js";
import { SentenceReviewSession, type SentenceReviewerOutput } from "./sentence-session.js";
import { SectionReviewSession, type SectionReviewerOutput } from "./section-session.js";
import { editImpact } from "./edit-impact.js";
import type { ReaderState } from "./state.js";

let clockTick = 0;
const now = () => {
  clockTick += 1;
  return new Date(Date.parse("2026-08-25T15:00:00+09:00") + clockTick * 1000)
    .toISOString()
    .replace(/\.\d+Z$/u, "Z");
};

/** 검수 파일이 없는 초안 상태의 교재를 만든다 (세션이 처음부터 쓰게). */
function makeCourse(root: string) {
  const { courseDir, standardsDir } = writeFixtureCourse(root);
  rmSync(join(courseDir, "review", "sentence-review.json"));
  rmSync(join(courseDir, "review", "section-review.json"));
  return { courseDir, standardsDir };
}

const ISOLATION = {
  model: "claude-fable-5",
  fresh_context: true as const,
  repository_access: false as const,
  raw_neighbor_sentences: false as const,
};

function passOutput(unitId: string, state: ReaderState, n: number): SentenceReviewerOutput {
  return {
    reviewer: { run_id: `sr-u${n}-${clockTick}`, ...ISOLATION },
    dimensions: { clarity: 2, consistency: 2, flow: 2, logic: 2, novice_comprehension: 2 },
    severity: "pass",
    issues: [],
    reader_state_after: {
      ...state,
      understood_facts: [...state.understood_facts, `요지 ${n}을 이해했다`],
      evictions: [],
    },
  };
}

function majorOutput(unitId: string, state: ReaderState, n: number): SentenceReviewerOutput {
  return {
    reviewer: { run_id: `sr-u${n}-${clockTick}`, ...ISOLATION },
    dimensions: { clarity: 0, consistency: 2, flow: 2, logic: 2, novice_comprehension: 2 },
    severity: "major",
    issues: [{ problem: "가리키는 말의 대상이 문장 안에 없다", suggestion: "주어를 명시한다" }],
    reader_state_after: { ...state, evictions: [] },
  };
}

function cleanRun(courseDir: string, standardsDir: string): SentenceReviewSession {
  const session = SentenceReviewSession.open(courseDir, standardsDir, { now });
  session.startRound();
  let n = 0;
  for (let next = session.next(); next; next = session.next()) {
    n += 1;
    session.submit(passOutput(next.unit.id, next.readerState, n));
  }
  return session;
}

test("문장 검수: 무결점 완주가 clean_pass를 만든다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-sr-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    const session = cleanRun(courseDir, standardsDir);
    const p = session.progress();
    assert.equal(p.status, "clean_pass");
    assert.equal(p.reviewed, p.total);
    assert.deepEqual(p.blocking, []);
    const doc = JSON.parse(
      readFileSync(join(courseDir, "review", "sentence-review.json"), "utf8"),
    ) as { rounds: { clean_pass: boolean }[] };
    assert.equal(doc.rounds[0]?.clean_pass, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("격리: 검수자에게 넘어가는 것에 이웃 문장의 원문이 없다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-iso-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    // 첫 챕터를 세 문장으로 교체 — 각 문장에 구별 가능한 표식을 넣는다
    writeFileSync(
      join(courseDir, "chapters/01-intro/01.mdx"),
      "---\ntitle: 위젯이 뭐예요\nsummary: 위젯의 뜻\n---\n\n앞문장표식앞문장. 가운데문장표식가운데. 뒷문장표식뒷문장.\n",
    );
    const session = SentenceReviewSession.open(courseDir, standardsDir, { now });
    session.startRound();
    const first = session.next();
    assert.ok(first);
    session.submit(passOutput(first.unit.id, first.readerState, 1));
    const middle = session.next();
    assert.ok(middle);
    assert.ok(middle.unit.text.includes("가운데문장표식"));
    // 페이로드 전체를 직렬화해 이웃 문장·원문 전체·다른 판정이 없음을 단언한다
    const payload = JSON.stringify(middle);
    assert.equal(payload.includes("앞문장표식"), false, "앞 문장의 원문이 새어 나갔다");
    assert.equal(payload.includes("뒷문장표식"), false, "뒤 문장의 원문이 새어 나갔다");
    assert.equal(payload.includes("severity"), false, "다른 판정이 새어 나갔다");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("기록 거부: 격리 증거·판정표·문제 목록이 어긋난 판정은 저장되지 않는다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-refuse-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    const session = SentenceReviewSession.open(courseDir, standardsDir, { now });
    session.startRound();
    const next = session.next();
    assert.ok(next);
    const good = passOutput(next.unit.id, next.readerState, 1);

    // 저장소를 본 검수자
    assert.throws(() =>
      session.submit({
        ...good,
        reviewer: { ...good.reviewer, repository_access: true as unknown as false },
      }),
    );
    // 판정표와 어긋난 등급 (전 차원 2점인데 critical)
    assert.throws(() => session.submit({ ...good, severity: "critical" }));
    // 중대인데 문제 목록이 빈 판정
    assert.throws(() =>
      session.submit({
        ...good,
        dimensions: { ...good.dimensions, clarity: 0 },
        severity: "major",
        issues: [],
      }),
    );
    // 셋 다 기록되지 않았다
    assert.equal(session.progress().reviewed, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("장부: 상한 초과는 거부되고, 버림 기록 없는 삭제도 거부된다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-ledger-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    const session = SentenceReviewSession.open(courseDir, standardsDir, { now });
    session.startRound();
    const first = session.next();
    assert.ok(first);
    // 상한 초과 (41개 사실)
    assert.throws(() =>
      session.submit({
        ...passOutput(first.unit.id, first.readerState, 1),
        reader_state_after: {
          understood_facts: Array.from({ length: 41 }, (_, i) => `사실 ${i}`),
          defined_terms: [],
          open_questions: [],
          evictions: [],
        },
      }),
    );
    session.submit(passOutput(first.unit.id, first.readerState, 1));
    const second = session.next();
    assert.ok(second);
    // 앞 상태의 사실을 버림 기록 없이 삭제
    assert.throws(
      () =>
        session.submit({
          ...passOutput(second.unit.id, second.readerState, 2),
          reader_state_after: {
            understood_facts: [],
            defined_terms: [],
            open_questions: [],
            evictions: [],
          },
        }),
      /버림 기록/u,
    );
    // 버림 기록을 남기면 통과
    session.submit({
      ...passOutput(second.unit.id, second.readerState, 2),
      reader_state_after: {
        understood_facts: ["요지 2를 이해했다"],
        defined_terms: [],
        open_questions: [],
        evictions: [
          {
            list: "understood_facts",
            item: "요지 1을 이해했다",
            reason: "상한 시험을 위해 오래된 항목을 버림",
            at_unit: second.unit.id,
          },
        ],
      },
    });
    assert.equal(session.progress().status, "clean_pass");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("무효화: 본문을 고치면 그 지점부터 뒤 판정만 무효가 되고, 재검수 뒤 다시 통과한다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-inval-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    cleanRun(courseDir, standardsDir);

    // 1챕터 끝에 문장을 추가 — 추가 지점 이후(2챕터 문장)만 무효여야 한다
    appendFileSync(join(courseDir, "chapters/01-intro/01.mdx"), "\n새로 끼워 넣은 문장이다.\n");
    const session = SentenceReviewSession.open(courseDir, standardsDir, { now });
    assert.equal(session.invalidatedCount(), 1); // 2챕터 판정만
    const p = session.progress();
    assert.equal(p.total, 3);
    assert.equal(p.reviewed, 1); // 1챕터 첫 문장 판정은 살아 있다

    session.startRound(); // 2회차
    let n = 10;
    for (let next = session.next(); next; next = session.next()) {
      n += 1;
      session.submit(passOutput(next.unit.id, next.readerState, n));
    }
    assert.equal(session.progress().status, "clean_pass");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("회차 상한: 6회를 넘기면 멈추고 관리자 판단을 요구한다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-cap-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    // 1문장 교재로 축소
    writeFileSync(
      join(courseDir, "chapters/01-intro/01.mdx"),
      "---\ntitle: t\nsummary: s\n---\n\n기준 문장 0번이다.\n",
    );
    writeFileSync(
      join(courseDir, "chapters/02-practice/01.mdx"),
      "---\ntitle: t2\nsummary: s2\n---\n\n둘째 챕터 문장이다.\n",
    );
    for (let round = 1; round <= 6; round += 1) {
      const session = SentenceReviewSession.open(courseDir, standardsDir, { now });
      session.startRound();
      let n = round * 100;
      for (let next = session.next(); next; next = session.next()) {
        n += 1;
        session.submit(majorOutput(next.unit.id, next.readerState, n));
      }
      assert.equal(session.progress().status, "revision_required");
      // 고쳤지만 여전히 실패하는 시나리오 — 매번 다른 본문
      writeFileSync(
        join(courseDir, "chapters/01-intro/01.mdx"),
        `---\ntitle: t\nsummary: s\n---\n\n기준 문장 ${round}번이다.\n`,
      );
    }
    const session = SentenceReviewSession.open(courseDir, standardsDir, { now });
    assert.throws(() => session.startRound(), /회차 상한/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("루프 감지: 이전 회차의 원문 지문으로 되돌아오면 멈춘다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-loop-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    const original = readFileSync(join(courseDir, "chapters/01-intro/01.mdx"), "utf8");

    // 1회차: 중대 판정으로 끝난다
    const s1 = SentenceReviewSession.open(courseDir, standardsDir, { now });
    s1.startRound();
    let n = 0;
    for (let next = s1.next(); next; next = s1.next()) {
      n += 1;
      s1.submit(majorOutput(next.unit.id, next.readerState, n));
    }
    // 수정 → 2회차 → 다시 중대
    appendFileSync(join(courseDir, "chapters/01-intro/01.mdx"), "\n고친 문장이다.\n");
    const s2 = SentenceReviewSession.open(courseDir, standardsDir, { now });
    s2.startRound();
    for (let next = s2.next(); next; next = s2.next()) {
      n += 1;
      s2.submit(majorOutput(next.unit.id, next.readerState, n));
    }
    // 원래 본문으로 되돌림 → 루프
    writeFileSync(join(courseDir, "chapters/01-intro/01.mdx"), original);
    const s3 = SentenceReviewSession.open(courseDir, standardsDir, { now });
    assert.throws(() => s3.startRound(), /맴돌고/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function sectionOutput(covered: string[], defines: string[]): SectionReviewerOutput {
  return {
    reviewer: { run_id: `sc-${clockTick}`, model: "claude-fable-5", read_whole_chapter: true },
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
    covered,
    defines,
  };
}

test("섹션 검수: 앞 챕터의 확정 내용은 주되 뒤 챕터의 본문은 주지 않는다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-sec-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    const session = SectionReviewSession.open(courseDir, standardsDir, { now });

    const first = session.next();
    assert.ok(first);
    assert.equal(first.chapter_id, "01-intro");
    assert.deepEqual(first.prior, []);
    assert.equal(first.body.includes("트리를 그리면"), false, "뒤 챕터 본문이 새어 나갔다");
    session.submit(sectionOutput(["위젯의 정의"], ["위젯"]));

    const second = session.next();
    assert.ok(second);
    assert.equal(second.chapter_id, "02-practice");
    assert.deepEqual(second.prior, [
      { chapter_id: "01-intro", covered: ["위젯의 정의"], defines: ["위젯"] },
    ]);
    session.submit(sectionOutput(["트리 그리기"], []));
    assert.equal(session.progress().status, "clean_pass");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("섹션 무효화: 앞 챕터를 고치면 그 챕터와 뒤 전부, 뒤 챕터만 고치면 그것만 무효다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-sec2-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    const session = SectionReviewSession.open(courseDir, standardsDir, { now });
    session.submit(sectionOutput(["위젯의 정의"], ["위젯"]));
    session.submit(sectionOutput(["트리 그리기"], []));

    // 뒤 챕터만 수정 → 그 판정만 무효
    appendFileSync(join(courseDir, "chapters/02-practice/01.mdx"), "\n추가 문장.\n");
    const s2 = SectionReviewSession.open(courseDir, standardsDir, { now });
    assert.equal(s2.invalidatedCount(), 1);
    assert.equal(s2.progress().reviewed, 1);
    s2.submit(sectionOutput(["트리 그리기", "추가 내용"], []));
    assert.equal(s2.progress().status, "clean_pass");

    // 앞 챕터 수정 → 앞·뒤 전부 무효
    appendFileSync(join(courseDir, "chapters/01-intro/01.mdx"), "\n앞 챕터 추가.\n");
    const s3 = SectionReviewSession.open(courseDir, standardsDir, { now });
    assert.equal(s3.progress().reviewed, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("저장 영향 안내: 몇 건이 무효가 되었고 어디부터 다시인지 알려 준다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-impact-"));
  try {
    const { courseDir, standardsDir } = makeCourse(root);
    cleanRun(courseDir, standardsDir);
    const sec = SectionReviewSession.open(courseDir, standardsDir, { now });
    sec.submit(sectionOutput(["위젯의 정의"], ["위젯"]));
    sec.submit(sectionOutput(["트리 그리기"], []));

    appendFileSync(join(courseDir, "chapters/01-intro/01.mdx"), "\n수정 문장이다.\n");
    const impact = editImpact(courseDir, standardsDir);
    assert.equal(impact.sentenceInvalidated, 1);
    assert.equal(impact.sectionInvalidated, 2);
    assert.ok(impact.messages.some((m) => m.includes("무효")));
    assert.ok(impact.resumeFromUnit);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("끝에서 끝: 등록 → 문장·섹션 무결점 완주 → canPublish 통과 (게이트 연결)", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-full-"));
  try {
    const { courseDir, standardsDir } = writeFixtureCourse(root, {
      statusOverride: "generating",
    });
    rmSync(join(courseDir, "review", "sentence-review.json"));
    rmSync(join(courseDir, "review", "section-review.json"));

    // 검수 없이 게이트는 막혀 있다
    assert.equal(canPublish(courseDir, standardsDir).ok, false);

    const reg = registerDraft(courseDir, standardsDir);
    assert.equal(reg.ok, true);
    cleanRun(courseDir, standardsDir);
    const sec = SectionReviewSession.open(courseDir, standardsDir, { now });
    sec.submit(sectionOutput(["위젯의 정의"], ["위젯"]));
    sec.submit(sectionOutput(["트리 그리기"], []));

    const gate = canPublish(courseDir, standardsDir);
    assert.deepEqual(gate, { ok: true, reasons: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
