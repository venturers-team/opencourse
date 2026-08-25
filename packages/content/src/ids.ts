import { randomBytes } from "node:crypto";
import { sentenceSha256, shortHash } from "./fingerprint.js";

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford

/** 교재 식별자용 ULID (docs/11 §0). 슬러그가 바뀌어도 불변인 26자 id. */
export function ulid(now = Date.now()): string {
  let ts = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = B32[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  const rnd = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += B32[(rnd[i] as number) % 32];
  return ts + out;
}

/** 문장 단위 id: `챕터폴더/파일:서수:문장지문10` (v1 계승, docs/11 §0). */
export function makeUnitId(path: string, ordinal: number, text: string): string {
  return `${path}:${ordinal}:${shortHash(sentenceSha256(text))}`;
}

/** 작업 id: `<종류>-<과제>-<YYYYMMDDHHmm>` (docs/11 §0). */
export function makeRunId(kind: string, task: string, at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}${p(at.getHours())}${p(at.getMinutes())}`;
  return `${kind}-${task}-${stamp}`;
}
