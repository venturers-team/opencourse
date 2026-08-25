import { createHash } from "node:crypto";

/** 파일 지문: 바이트 그대로의 SHA-256, 소문자 64자리 (docs/11 §0). */
export function sha256Hex(data: string | Uint8Array): string {
  const h = createHash("sha256");
  h.update(typeof data === "string" ? Buffer.from(data, "utf8") : data);
  return h.digest("hex");
}

/** 문장 지문: NFC 정규화 + 앞뒤 공백 제거 + 연속 공백 1칸 축약 (docs/11 §0). */
export function sentenceSha256(text: string): string {
  return sha256Hex(text.normalize("NFC").trim().replace(/\s+/g, " "));
}

/** 식별자 안에서 쓰는 축약 지문 (앞 10자리). */
export function shortHash(hash: string): string {
  return hash.slice(0, 10);
}

/**
 * 본문 결합 지문: 파일 바이트를 순서대로 연결하되, 조각마다 길이 헤더를 붙여
 * 경계 이동으로 같은 지문이 나오는 일을 막는다. sentence-review.source_sha256과
 * section-review.body_sha256이 이 함수 하나로 계산된다 — 정의는 여기가 정본이다.
 */
export function combinedSha256(parts: Uint8Array[]): string {
  const h = createHash("sha256");
  for (const p of parts) {
    h.update(`${p.byteLength}\n`);
    h.update(p);
  }
  return h.digest("hex");
}
