import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReviewUnits } from "./units.js";

/** 문장 추출기 회귀 테스트. */

test("따옴표 안의 문장부호는 문장 경계가 아니다 (실전 1회차가 잡은 결함)", () => {
  const md = "---\ntitle: t\nsummary: s\n---\n\n코드는 이래요. '나의 첫 앱'과 '안녕, Flutter!'가 코드 속에 보이죠? 다음 문장이에요.\n";
  const texts = extractReviewUnits(md, "x/01.mdx").map((u) => u.text);
  assert.deepEqual(texts, [
    "코드는 이래요.",
    "'나의 첫 앱'과 '안녕, Flutter!'가 코드 속에 보이죠?",
    "다음 문장이에요.",
  ]);
});
