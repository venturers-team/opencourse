import { test } from "node:test";
import assert from "node:assert/strict";
import {
  combinedSha256,
  sentenceSha256,
  sha256Hex,
  shortHash,
  thresholdsContentSha256,
} from "./fingerprint.js";

test("같은 내용은 같은 지문, 한 글자 수정은 다른 지문", () => {
  assert.equal(sha256Hex("가나다"), sha256Hex("가나다"));
  assert.notEqual(sha256Hex("가나다"), sha256Hex("가나닭"));
});

test("문장 지문은 NFC 정규화와 공백 축약 뒤에 계산된다", () => {
  const composed = "위젯"; // NFC
  const decomposed = composed.normalize("NFD");
  assert.notEqual(composed, decomposed);
  assert.equal(sentenceSha256(composed), sentenceSha256(decomposed));
  assert.equal(sentenceSha256("  위젯은   부품이다  "), sentenceSha256("위젯은 부품이다"));
  assert.notEqual(sentenceSha256("위젯은 부품이다"), sentenceSha256("위젯은 부품이었다"));
});

test("결합 지문은 조각 경계 이동에 속지 않는다", () => {
  const a = Buffer.from("ab");
  const b = Buffer.from("c");
  const c = Buffer.from("a");
  const d = Buffer.from("bc");
  assert.notEqual(combinedSha256([a, b]), combinedSha256([c, d]));
  assert.equal(combinedSha256([a, b]), combinedSha256([Buffer.from("ab"), Buffer.from("c")]));
});

test("축약 지문은 앞 10자리다", () => {
  const h = sha256Hex("x");
  assert.equal(shortHash(h).length, 10);
  assert.ok(h.startsWith(shortHash(h)));
});

test("임계값 내용 지문: 실측 전환 기록은 지문을 바꾸지 않고, 상한 값은 바꾼다", () => {
  const base = {
    version: 1,
    updatedAt: "2026-08-21",
    source: "judgement",
    thresholds: { maxSections: { value: 15, unit: "count", default: 15 } },
    learnerState: { maxKnownFacts: { value: 40, unit: "count", default: 40 } },
  };
  const measured = { ...base, source: "measured", updatedAt: "2026-08-26" };
  const changedValue = {
    ...base,
    thresholds: { maxSections: { value: 20, unit: "count", default: 15 } },
  };
  assert.equal(thresholdsContentSha256(base), thresholdsContentSha256(measured));
  assert.notEqual(thresholdsContentSha256(base), thresholdsContentSha256(changedValue));
});
