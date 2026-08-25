/**
 * 문장 격리 검수 구동기 (content/standards/review-protocol.md).
 * 문장마다 `claude -p`를 새로 시작한다 — 매번 새 컨텍스트의 서브에이전트이며,
 * 프롬프트에는 판정할 문장 하나와 학습자 상태만 들어간다 (원문·이웃·타 판정 없음).
 * 등급은 검수자가 아니라 판정표(expectedSentenceSeverity)가 기계적으로 정한다.
 * 세션 파일이 매 제출마다 저장되므로 중단해도 다시 실행하면 이어진다.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expectedSentenceSeverity } from "../../../packages/content/dist/index.js";
import { SentenceReviewSession } from "../../../packages/pipeline/dist/index.js";

const runDir = new URL(".", import.meta.url).pathname;
const root = join(runDir, "../../..");
const courseDir = join(root, "content/courses/baibeu-kodingeuro-baeuneun-flutter-cheotgeoleum");
const MODEL = "claude-haiku-4-5-20251001";

const session = SentenceReviewSession.open(courseDir, join(root, "content/standards"), {
  chainPath: join(runDir, "learner-state.jsonl"),
});
const before = session.progress();
if (before.reviewed === 0 || before.reviewed < before.total) {
  try {
    session.startRound();
  } catch {
    /* 이미 열린 회차 — 이어서 진행 */
  }
}

const RUBRIC = `너는 교재 문장 하나를 판정하는 격리 검수자다. 너는 방금 새로 시작되었고, 원문 전체도 이웃 문장도 다른 판정도 받지 못했다. 아래 문장 하나와 학습자 상태만이 전부다.

[독자] 한국 대학의 비전공 학생. 이 주제를 이번 학기 처음 배운다. 모르는 말이 나와도 검색하지 않고 넘어가며, 그런 것이 두세 개 쌓이면 읽기를 멈춘다.
- 안다고 본다: 고등학교 수준 수학·과학, 일상적 컴퓨터 사용(파일·폴더·인터넷 주소·앱 설치), 일상 어휘·신문 수준 시사어, 그리고 [학습자 상태]의 정의된 용어(그 뜻으로만).
- 모른다고 본다(설명 없이 나오면 초보자 이해도 0점): 전공 용어, 도구·제품·라이브러리 이름, 풀지 않은 줄임말, 분야의 암묵적 관례, 번역 없는 영어 표현, 뜻을 밝히지 않은 수식·기호. 단 **바로 그 문장 안에서 뜻을 밝히면** 깎지 않는다. 학습자 상태에 이미 정의된 용어도 깎지 않는다.

[다섯 차원 — 각 0/1/2점, 중간 점수 없음]
- clarity 명료성: 이 문장 하나만 읽고 뜻이 하나로 잡히는가. 2=한 번에, 1=두 번 읽으면, 0=여러 뜻이거나 가리키는 대상이 문장 안에 없음.
- consistency 일관성: 정의된 용어·표기를 그대로 쓰는가. 2=그대로, 1=다르게 부르지만 같은 것임을 알 수 있음, 0=정의와 다른 뜻으로 쓰거나 정의 안 된 용어를 아는 것처럼 씀.
- flow 흐름: 학습자 상태에서 이 문장으로 자연스럽게 이어지는가. 2=이어짐, 1=연결어 하나가 아쉬움, 0=갑자기 튐·빠진 단계 있음. (제목·목록 항목은 새 절의 시작일 수 있음을 감안한다)
- logic 논리: 주장이 지금까지의 것으로 뒷받침되는가. 2=근거가 상태 안에 있거나 문장 자체가 정의, 1=한 다리 건너 추론, 0=근거 없는 단정이거나 상태와 어긋남.
- novice_comprehension 초보자 이해도: 위 독자가 읽고 넘어갈 수 있는가. 2=안다고 본 것만으로 읽힘, 1=모르는 것 하나를 문맥으로 짐작 가능, 0=모른다고 본 것을 설명 없이 씀.

[학습자 상태 변화분] 판정 뒤, 이 문장이 학습자 상태에 일으키는 변화만 적어라 (전체 상태를 다시 쓰지 마라 — 합치기는 기계가 한다).
- add_facts: 이 문장이 새로 알려 준 사실 (한 줄 진술, 없으면 빈 배열)
- add_terms: 이 문장이 뜻을 밝힌 용어 [{"term","definition"}]
- add_questions: 언급만 하고 설명하지 않은 것
- resolve_questions: 이 문장이 답을 준 기존 남은 의문 (정확히 그 문자열)
- remove: 이 문장 때문에 더는 유효하지 않은 기존 항목 [{"list":"understood_facts|defined_terms|open_questions","item":"정확한 문자열(용어는 term)","reason":"왜"}] (드묾, 보통 빈 배열)

[출력] 다음 JSON 하나만 출력하라. 설명·코드펜스 금지.
{"dimensions":{"clarity":0|1|2,"consistency":0|1|2,"flow":0|1|2,"logic":0|1|2,"novice_comprehension":0|1|2},"issues":[{"problem":"...","suggestion":"..."}],"state_delta":{"add_facts":[],"add_terms":[],"add_questions":[],"resolve_questions":[],"remove":[]}}
- 0점이나 1점을 준 차원이 있으면 issues에 구체적 문제와 수정 제안을 적어라. 전부 2점이면 issues는 빈 배열.`;

/** 변화분을 상태에 접는다 — 상한 초과 시 프로토콜대로 오래된 항목부터 버리고 기록한다. */
function applyDelta(before, delta, unitId) {
  const after = {
    understood_facts: [...before.understood_facts],
    defined_terms: before.defined_terms.map((t) => ({ ...t })),
    open_questions: [...before.open_questions],
    evictions: [...before.evictions],
  };
  const evict = (list, item, reason) => {
    after.evictions.push({ list, item, reason, at_unit: unitId });
  };
  for (const r of delta.remove ?? []) {
    if (r.list === "defined_terms") {
      const i = after.defined_terms.findIndex((t) => t.term === r.item);
      if (i >= 0) { after.defined_terms.splice(i, 1); evict(r.list, r.item, r.reason); }
    } else if (after[r.list]) {
      const i = after[r.list].indexOf(r.item);
      if (i >= 0) { after[r.list].splice(i, 1); evict(r.list, r.item, r.reason); }
    }
  }
  for (const q of delta.resolve_questions ?? []) {
    const i = after.open_questions.indexOf(q);
    if (i >= 0) { after.open_questions.splice(i, 1); evict("open_questions", q, "이 문장이 답을 주어 해소"); }
  }
  for (const f of delta.add_facts ?? []) if (!after.understood_facts.includes(f)) after.understood_facts.push(f);
  for (const t of delta.add_terms ?? []) {
    const i = after.defined_terms.findIndex((x) => x.term === t.term);
    if (i >= 0) after.defined_terms[i] = t; else after.defined_terms.push(t);
  }
  for (const q of delta.add_questions ?? []) if (!after.open_questions.includes(q)) after.open_questions.push(q);
  const cap = (list, max, key) => {
    while (after[list].length > max) {
      const oldest = after[list].shift();
      evict(list, key ? oldest[key] : oldest, "상한 초과 — 프로토콜대로 가장 오래된 항목을 버림");
    }
  };
  cap("understood_facts", 40); cap("defined_terms", 40, "term"); cap("open_questions", 20);
  return after;
}

function reviewOnce(unit, readerState, errorHint) {
  const prompt = [
    RUBRIC,
    errorHint ? `\n[직전 시도 거부 사유 — 고쳐서 다시] ${errorHint}` : "",
    `\n[학습자 상태]\n${JSON.stringify(readerState, null, 1)}`,
    `\n[판정할 문장] (종류: ${unit.kind}, id: ${unit.id})\n${unit.text}`,
  ].join("\n");
  const out = execFileSync(
    "/Users/gimjungwook/.local/bin/claude", // PATH의 cmux 심은 호출마다 세션 훅을 얹어 수십 배 느리다
    ["-p", prompt, "--model", MODEL, "--output-format", "json"],
    { maxBuffer: 1024 * 1024 * 16, timeout: 180_000 },
  ).toString();
  const result = JSON.parse(out).result ?? "";
  const jsonText = result.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim();
  const start = jsonText.indexOf("{");
  return JSON.parse(jsonText.slice(start));
}

let count = 0;
for (;;) {
  const target = session.next();
  if (!target) break;
  let lastError = null;
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt += 1) {
    try {
      const r = reviewOnce(target.unit, target.readerState, lastError);
      const severity = expectedSentenceSeverity(r.dimensions);
      const readerStateAfter = applyDelta(target.readerState, r.state_delta ?? {}, target.unit.id);
      const { remaining, roundClosed } = session.submit({
        reviewer: {
          run_id: `sr-${target.unit.ordinal}-r${target.round}-a${attempt}-${Date.now()}`,
          model: MODEL,
          fresh_context: true,
          repository_access: false,
          raw_neighbor_sentences: false,
        },
        dimensions: r.dimensions,
        severity,
        issues: r.issues ?? [],
        reader_state_after: readerStateAfter,
      });
      count += 1;
      console.log(
        `[${count}] ${target.unit.id} → ${severity}${(r.issues ?? []).length ? ` (문제 ${r.issues.length})` : ""} — 남음 ${remaining}${roundClosed ? " · 회차 종료" : ""}`,
      );
      done = true;
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
      console.error(`  재시도 ${attempt}: ${target.unit.id} — ${lastError.slice(0, 120)}`);
    }
  }
  if (!done) {
    console.error(`중단: ${target.unit.id} 3회 실패 — 다시 실행하면 이 문장부터 이어진다`);
    process.exit(1);
  }
}

const p = session.progress();
console.log(`완료: ${p.reviewed}/${p.total}, 상태 ${p.status}, 차단 ${p.blocking.length}건`);
for (const b of p.blocking) console.log("  차단:", b);
