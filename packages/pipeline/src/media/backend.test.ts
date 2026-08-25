import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { R2MediaBackend, mediaBackendFromEnv } from "./backend.js";

/** R2 백엔드 (9단계 준비) — 명령 조립·URL 생성·HEAD 검증을 주입으로 확인한다. */

function tempFile(content: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "oc-r2-"));
  const path = join(dir, "fig-01.png");
  writeFileSync(path, content);
  return { dir, path };
}

test("R2 업로드: 템플릿 치환으로 wrangler 명령을 만들고 공개 URL을 돌려준다", async () => {
  const { dir, path } = tempFile("png-bytes");
  const calls: { cmd: string; args: string[] }[] = [];
  const backend = new R2MediaBackend(
    "opencourse-media",
    "https://media.example.dev/",
    undefined,
    async (cmd, args) => {
      calls.push({ cmd, args });
    },
  );
  try {
    const up = await backend.upload(path, "media/01-intro/fig-01.png");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.cmd, "wrangler");
    assert.deepEqual(calls[0]?.args, [
      "r2",
      "object",
      "put",
      "opencourse-media/media/01-intro/fig-01.png",
      "--file",
      path,
      "--remote",
    ]);
    assert.equal(up.url, "https://media.example.dev/media/01-intro/fig-01.png");
    assert.equal(up.bytes, 9);
    assert.equal(up.sha256.length, 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("R2 검증: HEAD 응답과 길이가 맞아야 통과, 아니면 실패", async () => {
  const { dir, path } = tempFile("123456789");
  const backendWith = (status: number, length: string | null) =>
    new R2MediaBackend(
      "b",
      "https://m.dev",
      undefined,
      async () => {},
      (async () =>
        new Response(null, {
          status,
          headers: length === null ? {} : { "content-length": length },
        })) as typeof fetch,
    );
  try {
    const up = await backendWith(200, "9").upload(path, "k");
    assert.equal(await backendWith(200, "9").verify(up), true);
    assert.equal(await backendWith(200, "7").verify(up), false);
    assert.equal(await backendWith(404, "9").verify(up), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("백엔드 선택: R2 환경이 없으면 로컬, 있으면 R2", () => {
  assert.equal(mediaBackendFromEnv("/tmp/store", {} as NodeJS.ProcessEnv).name, "local");
  assert.equal(
    mediaBackendFromEnv("/tmp/store", {
      OPENCOURSE_R2_BUCKET: "b",
      OPENCOURSE_R2_PUBLIC_URL: "https://m.dev",
    } as NodeJS.ProcessEnv).name,
    "r2",
  );
});
