/**
 * 교재 슬러그 생성 (docs/04 주소 구조).
 * 한글 제목은 국어의 로마자 표기법(개정, 2000)을 따라 옮긴다.
 * 영문 소문자·숫자·붙임표만 쓰고, 같은 슬러그가 있으면 뒤에 연번을 붙인다.
 */
const CHO = [
  "g",
  "kk",
  "n",
  "d",
  "tt",
  "r",
  "m",
  "b",
  "pp",
  "s",
  "ss",
  "",
  "j",
  "jj",
  "ch",
  "k",
  "t",
  "p",
  "h",
];
const JUNG = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
];
// 받침(종성)은 어말 표기 기준의 단순화: g, n, d, l, m, b, ng 계열로 적는다.
const JONG = [
  "",
  "k",
  "k",
  "k",
  "n",
  "n",
  "n",
  "t",
  "l",
  "k",
  "m",
  "l",
  "l",
  "l",
  "l",
  "l",
  "m",
  "p",
  "l",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "t",
];

function romanizeHangul(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      const cho = Math.floor(idx / 588);
      const jung = Math.floor((idx % 588) / 28);
      const jong = idx % 28;
      out += `${CHO[cho]}${JUNG[jung]}${JONG[jong]}`;
    } else {
      out += ch;
    }
  }
  return out;
}

export function slugify(title: string, existing: ReadonlySet<string> = new Set()): string {
  const base =
    romanizeHangul(title)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .replace(/-{2,}/gu, "-") || "course";
  if (!existing.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!existing.has(candidate)) return candidate;
  }
}
