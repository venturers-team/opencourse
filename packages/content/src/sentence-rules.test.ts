import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSentenceVerdictSchema, makeReaderStateSchema } from "./schemas/sentence-review.js";
import { makeUnitId } from "./ids.js";
import { sha256Hex } from "./fingerprint.js";

const schema = makeSentenceVerdictSchema();
const T = "2026-08-25T12:00:00+09:00";

function validVerdict() {
  return {
    sentence_id: makeUnitId("01-intro/01.mdx", 1, "위젯은 부품이다."),
    round: 1,
    reviewed_at: T,
    state_before_sha256: sha256Hex("state"),
    reviewer: {
      run_id: "sr-r1-u1-202608251200",
      model: "claude-fable-5",
      fresh_context: true,
      repository_access: false,
      raw_neighbor_sentences: false,
    },
    dimensions: { clarity: 2, consistency: 2, flow: 2, logic: 2, novice_comprehension: 2 },
    severity: "pass",
    issues: [],
    reader_state_after: {
      understood_facts: ["위젯은 부품이다"],
      defined_terms: [],
      open_questions: [],
      evictions: [],
    },
    invalidated: false,
    invalidated_at: null,
    invalidated_reason: null,
  };
}

test("정상 판정은 기록된다", () => {
  assert.ok(schema.safeParse(validVerdict()).success);
});

test("기록 거부: 저장소를 본 검수자의 판정", () => {
  const v = validVerdict();
  (v.reviewer as { repository_access: boolean }).repository_access = true;
  assert.equal(schema.safeParse(v).success, false);
});

test("기록 거부: 이웃 문장을 받은 검수자의 판정", () => {
  const v = validVerdict();
  (v.reviewer as { raw_neighbor_sentences: boolean }).raw_neighbor_sentences = true;
  assert.equal(schema.safeParse(v).success, false);
});

test("기록 거부: 모델 식별자 없는 판정", () => {
  const v = validVerdict();
  (v.reviewer as { model: string }).model = "";
  assert.equal(schema.safeParse(v).success, false);
});

test("기록 거부: 판정표와 어긋난 등급", () => {
  const v = validVerdict();
  (v as { severity: string }).severity = "critical"; // 전 차원 2점인데 심각이라 주장
  assert.equal(schema.safeParse(v).success, false);
});

test("기록 거부: 초보자 이해도 0점인데 심각이 아닌 등급", () => {
  const v = validVerdict();
  v.dimensions.novice_comprehension = 0;
  (v as { severity: string }).severity = "major";
  assert.equal(schema.safeParse(v).success, false);
  (v as { severity: string }).severity = "critical";
  const r = schema.safeParse({
    ...v,
    issues: [{ problem: "정의 없는 용어를 쓴다", suggestion: null }],
  });
  assert.ok(r.success);
});

test("기록 거부: 중대·심각인데 문제 목록이 빈 판정", () => {
  const v = validVerdict();
  v.dimensions.clarity = 0;
  (v as { severity: string }).severity = "major";
  assert.equal(schema.safeParse(v).success, false); // issues 비어 있음
  const ok = schema.safeParse({
    ...v,
    issues: [{ problem: "가리키는 말의 대상이 문장 안에 없다", suggestion: "주어를 명시한다" }],
  });
  assert.ok(ok.success);
});

test("학습자 상태 상한: 40·40·20을 넘으면 거부된다", () => {
  const state = makeReaderStateSchema();
  const many = (n: number) => Array.from({ length: n }, (_, i) => `사실 ${i}`);
  assert.ok(
    state.safeParse({
      understood_facts: many(40),
      defined_terms: [],
      open_questions: [],
      evictions: [],
    }).success,
  );
  assert.equal(
    state.safeParse({
      understood_facts: many(41),
      defined_terms: [],
      open_questions: [],
      evictions: [],
    }).success,
    false,
  );
  assert.equal(
    state.safeParse({
      understood_facts: [],
      defined_terms: [],
      open_questions: many(21),
      evictions: [],
    }).success,
    false,
  );
});
