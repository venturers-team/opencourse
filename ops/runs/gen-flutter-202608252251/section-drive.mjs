/**
 * 섹션(챕터) 전체 검수 구동기 (docs/11 §6, docs/05).
 * 검수자는 챕터마다 새로 시작하며, 이 챕터의 본문 전체 + 앞 챕터의 covered/defines만 받는다.
 * 뒤 챕터는 절대 주지 않는다. 등급은 판정표(expectedSectionSeverity)가 기계적으로 정한다.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expectedSectionSeverity } from "../../../packages/content/dist/index.js";
import { SectionReviewSession } from "../../../packages/pipeline/dist/index.js";

const runDir = new URL(".", import.meta.url).pathname;
const root = join(runDir, "../../..");
const courseDir = join(root, "content/courses/baibeu-kodingeuro-baeuneun-flutter-cheotgeoleum");
const MODEL = "claude-sonnet-5";

const session = SectionReviewSession.open(courseDir, join(root, "content/standards"));

const RUBRIC = `너는 교재의 챕터 하나를 통째로 판정하는 섹션 검수자다. 너는 방금 새로 시작되었고, 받는 것은 이 챕터의 본문 전체와 "앞 챕터들이 이미 다룬 것(covered)·정의한 것(defines)" 요약뿐이다. 뒤 챕터는 존재를 모른다고 가정하라.

[독자] 한국 대학의 비전공 학생, 이 주제를 처음 배운다. 모르는 말을 검색하지 않는다.

[다섯 차원 — 각 0/1/2점]
- completeness 완결성: 챕터가 약속한 목표를 빠짐없이 다루는가. 2=빠진 것 없음, 1=사소한 공백, 0=목표에 필요한 조각이 빠져 학습자가 완주 불가.
- sequence 순서: 챕터 안 전개가 아는 것→새 것 순서인가, 앞 챕터 지식 위에 서는가. 2=자연스러움, 1=한 군데 삐걱, 0=순서가 뒤집혀 이해 불가 지점 존재.
- frame_consistency 얼개 일관성: 도입-전개-마무리 틀과 어조·용어가 챕터 안에서 한결같은가 (covered/defines의 용어를 그대로 쓰는가). 2=한결같음, 1=근소한 흔들림, 0=틀이 깨지거나 용어가 어긋남.
- evidence 근거: 주장에 근거가 있고, 예시·코드가 주장과 맞는가. 2=맞음, 1=근거가 얇은 곳 하나, 0=근거 없는 단정이나 잘못된 예시.
- learner_exit 학습자 도달 상태: 이 챕터를 마친 독자가 다음으로 넘어갈 준비가 되는가. **0점이면 곧바로 심각.** 2=준비됨, 1=한 가지가 흐릿함, 0=핵심을 오해하거나 이탈할 상태.

[함께 낼 것]
- missing: 이 챕터에 있어야 하는데 없는 것 [{"what","why_needed"}] — 이 검수의 존재 이유. 없으면 빈 배열.
- issues: 구체적 문제와 수정 제안 [{"problem","suggestion"}]. 0·1점 차원이 있으면 반드시 채운다.
- covered: 이 챕터가 실제로 다룬 것 (다음 챕터 검수자에게 넘어갈 요약, 5~10개 한 줄 진술)
- defines: 이 챕터가 정의한 용어 이름 목록

[출력] 다음 JSON 하나만. 설명·코드펜스 금지.
{"dimensions":{"completeness":0|1|2,"sequence":0|1|2,"frame_consistency":0|1|2,"evidence":0|1|2,"learner_exit":0|1|2},"missing":[],"issues":[],"covered":[],"defines":[]}`;

let count = 0;
for (;;) {
  const target = session.next();
  if (!target) break;
  const prompt = [
    RUBRIC,
    `\n[앞 챕터들이 다룬 것과 정의한 것]\n${JSON.stringify(target.prior, null, 1)}`,
    `\n[판정할 챕터] ${target.chapter_id} — ${target.title} (회차 ${target.round})\n\n${target.body}`,
  ].join("\n");
  let lastError = null;
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt += 1) {
    try {
      const out = execFileSync(
        "/Users/gimjungwook/.local/bin/claude", // PATH의 cmux 심은 호출마다 세션 훅을 얹어 수십 배 느리다
        ["-p", prompt + (lastError ? `\n\n[직전 시도 거부 사유] ${lastError}` : ""), "--model", MODEL, "--output-format", "json"],
        { maxBuffer: 1024 * 1024 * 16, timeout: 300_000 },
      ).toString();
      const text = (JSON.parse(out).result ?? "").replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim();
      const r = JSON.parse(text.slice(text.indexOf("{")));
      const severity = expectedSectionSeverity(r.dimensions);
      const { remaining } = session.submit({
        reviewer: {
          run_id: `sec-${target.chapter_id}-r${target.round}-${Date.now()}`,
          model: MODEL,
          read_whole_chapter: true,
        },
        dimensions: r.dimensions,
        severity,
        missing: r.missing ?? [],
        issues: r.issues ?? [],
        covered: r.covered ?? [],
        defines: r.defines ?? [],
      });
      count += 1;
      console.log(`[${count}] ${target.chapter_id} → ${severity} (빠짐 ${r.missing?.length ?? 0}, 문제 ${r.issues?.length ?? 0}) — 남음 ${remaining}`);
      done = true;
    } catch (e) {
      lastError = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      console.error(`  재시도 ${attempt}: ${target.chapter_id} — ${lastError.slice(0, 120)}`);
    }
  }
  if (!done) {
    console.error(`중단: ${target.chapter_id} 3회 실패`);
    process.exit(1);
  }
}
console.log("섹션 검수 종료 — 차단 챕터:", JSON.stringify(session.blockingChapters()));
