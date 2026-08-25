import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderInfographicPng } from "./render.js";

/**
 * S7 렌더러 실물 검증 (3단계 이월분). 실제 Chromium으로 찍은 결과가
 * 진짜 PNG인지(매직 바이트), #fig 요소만 잘라 찍는지 확인한다.
 * CI는 테스트 전에 chromium을 설치한다 (.github/workflows/ci.yml).
 */
const FIG_HTML = `<!doctype html><meta charset="utf-8">
<body style="margin:0">
<div id="fig" style="width:640px;height:360px;background:#eef3fe;display:grid;place-items:center">
  <p style="font:700 24px sans-serif;color:#2b5bd7">widget tree</p>
</div>
</body>`;

test("renderInfographicPng: #fig 요소를 진짜 PNG로 찍는다", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-render-"));
  const out = join(dir, "nested", "fig-01.png");
  try {
    await renderInfographicPng(FIG_HTML, out, { deviceScaleFactor: 1 });
    const bytes = readFileSync(out);
    // PNG 매직 바이트
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR 폭 = #fig 요소 폭 (뷰포트 1280이 아니라 640이어야 요소 클립이 증명된다)
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(width, 640);
    assert.equal(height, 360);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
