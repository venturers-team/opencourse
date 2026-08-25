/**
 * S10 — 장면 음성 실측으로 timeline.json·captions.vtt·챕터 오디오를 조립한다.
 * 전제: audio/<챕터>/scene-N.wav + whisper/scene-N.txt 존재.
 * 검증: 장면별 재전사 유사도 ≥ 0.65 (불합격 목록만 출력하고 실패 종료 — 재합성은 호출자가).
 * 상한: 챕터 총 길이 ≤ 90초 (thresholds).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { transcriptSimilarity } from "../../../packages/pipeline/dist/media/synth.js";

const runDir = new URL(".", import.meta.url).pathname;
const GAP = 2;
const failures = [];
const report = [];

const dur = (f) =>
  Number(
    execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f,
    ]).toString().trim(),
  );

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const sec = (s - m * 60).toFixed(3).padStart(6, "0");
  return `${String(m).padStart(2, "0")}:${sec}`;
};

for (const chapter of readdirSync(join(runDir, "scenes")).map((f) => f.replace(".json", ""))) {
  const sceneDoc = JSON.parse(readFileSync(join(runDir, "scenes", `${chapter}.json`), "utf8"));
  const audioDir = join(runDir, "audio", chapter);

  const measured = [];
  for (const sc of sceneDoc.scenes) {
    const wav = join(audioDir, `scene-${sc.index}.wav`);
    const transcript = readFileSync(join(audioDir, "whisper", `scene-${sc.index}.txt`), "utf8").trim();
    const sim = transcriptSimilarity(sc.narration, transcript);
    if (sim < 0.65) failures.push({ chapter, index: sc.index, sim: +sim.toFixed(3), transcript });
    measured.push({ ...sc, duration_sec: +dur(wav).toFixed(2), similarity: +sim.toFixed(3) });
  }
  if (failures.some((f) => f.chapter === chapter)) continue;

  // 타임라인 — start_sec은 실측 누적 (장면 사이 2초)
  let t = 0;
  const scenes = measured.map((sc) => {
    const start = +t.toFixed(2);
    t += sc.duration_sec + GAP;
    return {
      index: sc.index,
      start_sec: start,
      duration_sec: sc.duration_sec,
      narration: sc.narration,
      visual: sc.visual,
    };
  });
  const total = +(t - GAP).toFixed(2);
  if (total > 90) {
    failures.push({ chapter, index: -1, sim: 0, transcript: `총 길이 ${total}s > 90s` });
    continue;
  }

  writeFileSync(
    join(audioDir, "timeline.json"),
    JSON.stringify(
      { schema_version: 1, chapter_id: chapter, gap_sec: GAP, total_duration_sec: total, scenes },
      null,
      2,
    ) + "\n",
  );

  // 자막 — 표준 WebVTT
  const vtt = ["WEBVTT", ""];
  for (const sc of scenes) {
    vtt.push(`${fmt(sc.start_sec)} --> ${fmt(sc.start_sec + sc.duration_sec)}`, sc.narration, "");
  }
  writeFileSync(join(audioDir, "captions.vtt"), vtt.join("\n"));

  // 챕터 오디오 — 장면 사이 2초 무음으로 이어 붙여 mp3
  const args = [];
  const n = scenes.length;
  for (const sc of scenes) args.push("-i", join(audioDir, `scene-${sc.index}.wav`));
  const pads = scenes
    .map((_, i) => `[${i}]apad=pad_dur=${i < n - 1 ? GAP : 0}[p${i}]`)
    .join(";");
  const concat = scenes.map((_, i) => `[p${i}]`).join("") + `concat=n=${n}:v=0:a=1[out]`;
  execFileSync("ffmpeg", [
    "-y", ...args,
    "-filter_complex", `${pads};${concat}`,
    "-map", "[out]", "-ar", "24000", "-b:a", "96k",
    join(audioDir, "aud-01.mp3"),
  ], { stdio: "pipe" });

  report.push({ chapter, total_sec: total, scenes: n, min_sim: Math.min(...measured.map((m) => m.similarity)) });
}

if (failures.length > 0) {
  console.error("재전사 불합격 — 해당 장면만 재합성하십시오:");
  for (const f of failures) console.error(` ${f.chapter} scene-${f.index} 유사도 ${f.sim} — "${f.transcript.slice(0, 60)}"`);
  process.exit(1);
}
for (const r of report) console.log(`${r.chapter}: ${r.scenes}장면 ${r.total_sec}s (최저 유사도 ${r.min_sim})`);
