import type { DefectCode } from "../schemas/machine-check.js";
import type { ReviewUnit } from "../units.js";
import type { RawDefect } from "./static-rules.js";

/**
 * 구조 검사 SC01~SC06 (content/standards/scoring-rules.md).
 * 파일 전체를 훑어 앞뒤가 맞는지를 본다 — 문장 하나만 봐서는 알 수 없는 결함.
 * v1 course-structure-check.mjs의 판정 로직 이식. 전부 결정적이다.
 */
export interface ChapterUnits {
  chapterId: string;
  chapterIndex: number; // 1부터
  units: ReviewUnit[];
}

/** 뒤로 미루는 예고 문장 (v1 PROMISE_PATTERNS). */
const PROMISE_PATTERNS = [
  /뒤에서\s*(?:다시\s*|자세히\s*|더\s*)?(?:다룬다|살펴본다|설명한다|알아본다)/u,
  /다음\s*(?:장|챕터|절)에서\s*(?:다시\s*|자세히\s*|더\s*)?(?:다룬다|살펴본다|설명한다|알아본다)/u,
  /나중에\s*(?:다시\s*|자세히\s*|더\s*)?(?:다룬다|살펴본다|설명한다|알아본다)/u,
  /이후에\s*(?:다시\s*|자세히\s*|더\s*)?(?:다룬다|살펴본다|설명한다)/u,
];

/** 조사와 일반 명사는 주제 정보가 없다 (v1 STOPWORDS). */
const STOPWORDS = new Set([
  "이것",
  "그것",
  "저것",
  "여기",
  "거기",
  "내용",
  "부분",
  "경우",
  "때문",
  "이번",
  "다음",
  "위해",
  "통해",
  "대해",
  "우리",
  "자세히",
  "간단히",
  "먼저",
  "그리고",
  "하지만",
  "따라서",
  "예를",
  "들어",
  "이제",
  "지금",
]);

/** 이미 지난 내용처럼 말하는 표지 (v1 BACKWARD_MARKERS). */
const BACKWARD_MARKERS =
  /앞(?:서|에서)|지난|이미|앞 장|해 둔|띄워 둔|만들어 둔|작성한|배운|살펴본/u;

function normalizeSentence(text: string): string {
  return text
    .replace(/\[[^\]]*\]/gu, "[]")
    .replace(/[.,!?·「」“”"'()]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function topicWordsOf(text: string): string[] {
  return [
    ...new Set(
      text
        .replace(/[^\p{Script=Hangul}\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/u)
        .map((word) => word.trim())
        .filter((word) => word.length >= 2 && !STOPWORDS.has(word)),
    ),
  ];
}

function tenseOf(text: string): "future" | "past" | null {
  if (/할\s*것이다|하게\s*된다|할\s*예정|일\s*것이다/u.test(text)) return "future";
  if (/했다|였다|있었다|한\s*적이\s*있다/u.test(text)) return "past";
  return null;
}

function templateSlotsOf(text: string): string[] {
  const slots = [...text.matchAll(/\[([^\]]+)\]/gu)].map((m) => (m[1] as string).trim());
  return slots.length >= 2 ? slots : [];
}

export function structureRules(chapters: ChapterUnits[]): RawDefect[] {
  const defects: RawDefect[] = [];
  const push = (code: DefectCode, message: string, unit?: ReviewUnit) =>
    defects.push({
      code,
      message,
      path: unit?.path ?? "chapters",
      line: unit?.line ?? null,
    });

  const flat = chapters.flatMap((ch) =>
    ch.units.map((unit) => ({ unit, chapterIndex: ch.chapterIndex })),
  );

  // SC01 지키지 않은 예고 — 뒤에서 다룬다고 했는데 이후 어디에도 없는 것
  flat.forEach((entry, index) => {
    if (!PROMISE_PATTERNS.some((p) => p.test(entry.unit.text))) return;
    const topics = topicWordsOf(entry.unit.text);
    if (topics.length === 0) return;
    const later = flat.slice(index + 1);
    const kept = topics.some((topic) => later.some((o) => o.unit.text.includes(topic)));
    if (!kept) {
      push(
        "SC01",
        `뒤에서 다룬다고 했지만 이후 본문에 해당 내용이 없습니다: "${entry.unit.text.slice(0, 60)}"`,
        entry.unit,
      );
    }
  });

  // SC02 없는 것을 가리키는 회수 — "앞서 다룬 N장"이 실제 앞이 아니거나 없는 장
  const chapterCount = chapters.length;
  for (const entry of flat) {
    if (!BACKWARD_MARKERS.test(entry.unit.text)) continue;
    for (const match of entry.unit.text.matchAll(/(\d+)\s*장(?:에서|의|은|는|을)?/gu)) {
      const referenced = Number(match[1]);
      if (referenced >= entry.chapterIndex) {
        push(
          "SC02",
          `이미 지난 내용처럼 ${referenced}장을 가리키지만 이 문장은 ${entry.chapterIndex}장에 있습니다`,
          entry.unit,
        );
      } else if (referenced < 1 || referenced > chapterCount) {
        push(
          "SC02",
          `${referenced}장을 가리키지만 이 교재의 챕터는 ${chapterCount}개입니다`,
          entry.unit,
        );
      }
    }
  }

  // SC03 시제 뒤섞임 (경고) — 학습자가 채우는 문틀이 미래형과 과거형으로 갈림
  const templates = flat
    .map((entry) => ({
      entry,
      slots: templateSlotsOf(entry.unit.text),
      tense: tenseOf(entry.unit.text),
    }))
    .filter((t) => t.slots.length > 0 && t.tense !== null);
  const future = templates.find((t) => t.tense === "future");
  const past = templates.find((t) => t.tense === "past");
  if (future && past) {
    push(
      "SC03",
      `같은 문틀이 미래형(${future.entry.unit.path}:${future.entry.unit.line})과 과거형(${past.entry.unit.path}:${past.entry.unit.line})으로 갈립니다 — 어느 쪽이 정본인지 통일하십시오`,
      future.entry.unit,
    );
  }

  // SC04 문장 중복 (경고) — 긴 문장이 서로 다른 파일에 그대로 반복
  const seen = new Map<string, ReviewUnit[]>();
  for (const { unit } of flat) {
    if (unit.kind === "heading") continue;
    const normalized = normalizeSentence(unit.text);
    if (normalized.length < 25) continue;
    if (!seen.has(normalized)) seen.set(normalized, []);
    (seen.get(normalized) as ReviewUnit[]).push(unit);
  }
  for (const units of seen.values()) {
    const places = new Set(units.map((u) => u.path));
    if (places.size < 2) continue; // 한 파일 안의 반복은 강조다
    push(
      "SC04",
      `같은 문장이 ${[...places].join(", ")}에 반복됩니다: "${(units[0] as ReviewUnit).text.slice(0, 50)}"`,
      units[0],
    );
  }

  // SC05 용어 표기 흔들림 (경고) — 같은 것을 다른 표기로 부름
  //  (1) 라틴 용어의 대소문자 변형  (2) 한글 복합어의 붙임/띄어쓰기 변형
  const latinForms = new Map<string, Set<string>>();
  for (const { unit } of flat) {
    for (const m of unit.text.matchAll(/\b[A-Za-z][A-Za-z0-9+#.-]{2,}\b/gu)) {
      const word = m[0] as string;
      const key = word.toLowerCase();
      if (!latinForms.has(key)) latinForms.set(key, new Set());
      (latinForms.get(key) as Set<string>).add(word);
    }
  }
  for (const [key, forms] of latinForms) {
    if (forms.size > 1) {
      push("SC05", `용어 표기가 흔들립니다: ${[...forms].join(" / ")} (${key})`);
    }
  }
  const hangulJoined = new Map<string, Set<string>>();
  for (const { unit } of flat) {
    const words = unit.text.match(/[\p{Script=Hangul}]{2,}(?:\s[\p{Script=Hangul}]{2,})?/gu) ?? [];
    for (const phrase of words) {
      const joined = phrase.replace(/\s/gu, "");
      if (joined.length < 4) continue;
      if (!hangulJoined.has(joined)) hangulJoined.set(joined, new Set());
      (hangulJoined.get(joined) as Set<string>).add(phrase);
    }
  }
  for (const [joined, forms] of hangulJoined) {
    if (forms.size > 1) {
      push("SC05", `용어 표기가 흔들립니다: ${[...forms].join(" / ")} (${joined})`);
    }
  }

  // SC06 섹션 순서 역전 — 뒤 챕터에서 정의한 용어를 앞 챕터가 쓰는 것
  const definitions = new Map<string, number>(); // 용어 → 정의된 챕터 index
  for (const entry of flat) {
    for (const m of entry.unit.text.matchAll(
      /([\p{Script=Hangul}A-Za-z0-9]{2,20}?)(?:이란|란)\s/gu,
    )) {
      const term = (m[1] as string).trim();
      if (term.length < 2 || STOPWORDS.has(term)) continue;
      if (!definitions.has(term)) definitions.set(term, entry.chapterIndex);
    }
  }
  for (const [term, definedIn] of definitions) {
    for (const entry of flat) {
      if (entry.chapterIndex >= definedIn) continue;
      if (entry.unit.text.includes(term)) {
        push(
          "SC06",
          `${definedIn}장에서 정의하는 용어 "${term}"을 ${entry.chapterIndex}장이 먼저 씁니다 — 순서가 뒤집혀 있습니다`,
          entry.unit,
        );
        break; // 용어당 한 번만 보고
      }
    }
  }

  return defects;
}
