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

/** 키를 재귀적으로 정렬한 결정적 직렬화. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** 상태 전환에 흔들리지 않는 course.json 내용 지문 (docs/11 §4). */
const COURSE_VOLATILE_KEYS = [
  "status",
  "updated_at",
  "published_at",
  "edit_count",
  "rewrite_after_publish_count",
];

export function courseContentSha256(courseRaw: unknown): string {
  const clone = { ...(courseRaw as Record<string, unknown>) };
  for (const key of COURSE_VOLATILE_KEYS) delete clone[key];
  return sha256Hex(stableStringify(clone));
}

/**
 * 임계값 내용 지문 (docs/11 §4·§5, 2026-08-26).
 * source(judgement→measured)·updatedAt 같은 측정 기록 메타데이터는 판정에 쓰이지 않으므로
 * 제외하고, 실제 상한 값({ thresholds, learnerState })만 안정 직렬화해 해시한다.
 * course.json 내용 지문과 같은 원리다 — 실측 전환이 검수를 무효화해서는 안 된다.
 */
export function thresholdsContentSha256(raw: unknown): string {
  const doc = raw as { thresholds?: unknown; learnerState?: unknown };
  return sha256Hex(
    stableStringify({ thresholds: doc.thresholds ?? null, learnerState: doc.learnerState ?? null }),
  );
}
