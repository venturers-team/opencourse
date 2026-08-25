import { sentenceSha256, shortHash } from "./fingerprint.js";

/**
 * 학습자가 보게 될 단위(문장) 추출 — v1 sentence-review.mjs의 extractReviewUnits 이식.
 * 대상: 제목, 산문, 목록 항목, 인용, 표의 행. 제외: 머리말(frontmatter), 코드 블록, 주석.
 * (content/standards/scoring-rules.md "검사 대상과 제외 대상")
 */
export type UnitKind = "prose" | "heading" | "list" | "quote" | "table";

export interface ReviewUnit {
  id: string;
  path: string;
  line: number;
  ordinal: number;
  kind: UnitKind;
  text: string;
  text_sha256: string;
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/<!--.*?-->/gu, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[`*_~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/* 따옴표 안의 . ! ? 는 문장 경계가 아니다 — Intl.Segmenter가 '안녕, Flutter!' 같은
   인용 문자열에서 문장을 쪼개는 것을 자리 표시 문자로 보호했다가 복원한다.
   (실전 교재 검수 1회차가 잡은 추출기 결함, 2026-08-26) */
const PUNCT_GUARD: Record<string, string> = { ".": "\u0001", "!": "\u0002", "?": "\u0003" };
const PUNCT_RESTORE: Record<string, string> = { "\u0001": ".", "\u0002": "!", "\u0003": "?" };

function guardQuotedPunctuation(text: string): string {
  return text.replace(/([\x27"\u2018\u201c])([^\x27"\u2018\u2019\u201c\u201d]{0,80}?)([\x27"\u2019\u201d])/gu, (m) =>
    m.replace(/[.!?]/gu, (ch) => PUNCT_GUARD[ch] as string),
  );
}

function segmentText(value: string): string[] {
  const clean = cleanInlineMarkdown(value);
  if (!clean) return [];
  const segmenter = new Intl.Segmenter("ko", { granularity: "sentence" });
  return [...segmenter.segment(guardQuotedPunctuation(clean))]
    .map(({ segment }) => segment.replace(/[\u0001-\u0003]/gu, (ch) => PUNCT_RESTORE[ch] as string).trim())
    .filter(Boolean);
}

export function extractReviewUnits(raw: string, relativePath: string): ReviewUnit[] {
  const lines = raw.replace(/\r\n?/gu, "\n").split("\n");
  const units: ReviewUnit[] = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  let inFence = false;
  let inComment = false;

  const add = (text: string, line: number, kind: UnitKind) => {
    for (const sentence of segmentText(text)) {
      const ordinal = units.length + 1;
      const hash = sentenceSha256(sentence);
      units.push({
        id: `${relativePath}:${ordinal}:${shortHash(hash)}`,
        path: relativePath,
        line,
        ordinal,
        kind,
        text: sentence,
        text_sha256: hash,
      });
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const source = lines[index] as string;
    const trimmed = source.trim();
    if (inFrontmatter) {
      if (index > 0 && trimmed === "---") inFrontmatter = false;
      continue;
    }
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (trimmed.includes("<!--")) inComment = true;
    if (inComment) {
      if (trimmed.includes("-->")) inComment = false;
      const withoutComment = source.replace(/<!--.*?-->/gu, "").trim();
      if (!withoutComment) continue;
    }
    if (!trimmed || /^[-|:\s]+$/u.test(trimmed)) continue;

    if (trimmed.startsWith("|")) {
      const cells = trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell && !/^[-:]+$/u.test(cell));
      if (cells.length > 0) add(cells.join(" / "), index + 1, "table");
      continue;
    }

    let kind: UnitKind = "prose";
    let readable = trimmed;
    if (/^#{1,6}\s+/u.test(readable)) {
      kind = "heading";
      readable = readable.replace(/^#{1,6}\s+/u, "");
    } else if (/^>\s?/u.test(readable)) {
      kind = "quote";
      readable = readable.replace(/^>\s?/u, "");
    } else if (/^(?:[-*+]\s+|\d+[.)]\s+)/u.test(readable)) {
      kind = "list";
      readable = readable.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/u, "");
    }
    add(readable, index + 1, kind);
  }
  return units;
}
