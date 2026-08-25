import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedSectionSeverity, expectedSentenceSeverity, type Score } from "./severity.js";

function dims(c: Score, co: Score, f: Score, l: Score, n: Score) {
  return { clarity: c, consistency: co, flow: f, logic: l, novice_comprehension: n };
}

test("판정표: 0점 둘 이상이면 심각", () => {
  assert.equal(expectedSentenceSeverity(dims(0, 0, 2, 2, 2)), "critical");
});

test("판정표: 초보자 이해도 0점은 곧바로 심각", () => {
  assert.equal(expectedSentenceSeverity(dims(2, 2, 2, 2, 0)), "critical");
});

test("판정표: 초보자 이해도를 제외한 0점 하나는 중대", () => {
  assert.equal(expectedSentenceSeverity(dims(0, 2, 2, 2, 2)), "major");
});

test("판정표: 0점 없고 1점 둘 이상이면 경미", () => {
  assert.equal(expectedSentenceSeverity(dims(1, 1, 2, 2, 2)), "minor");
});

test("판정표: 0점 없고 1점 하나 이하면 통과", () => {
  assert.equal(expectedSentenceSeverity(dims(2, 2, 1, 2, 2)), "pass");
  assert.equal(expectedSentenceSeverity(dims(2, 2, 2, 2, 2)), "pass");
});

test("섹션 판정표: 학습자 도달 상태 0점은 곧바로 심각", () => {
  assert.equal(
    expectedSectionSeverity({
      completeness: 2,
      sequence: 2,
      frame_consistency: 2,
      evidence: 2,
      learner_exit: 0,
    }),
    "critical",
  );
  assert.equal(
    expectedSectionSeverity({
      completeness: 0,
      sequence: 2,
      frame_consistency: 2,
      evidence: 2,
      learner_exit: 2,
    }),
    "major",
  );
});
