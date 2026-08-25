#!/usr/bin/env node
import { resolve, join } from "node:path";
import { courseStatus, createCourse, repoPaths, setStatus } from "./lifecycle.js";
import { registerDraft } from "./draft-register.js";
import { loadThresholds, preflight } from "./thresholds.js";
import { writeStatusBoard } from "./ops/board.js";

/**
 * 생성 파이프라인 CLI — 저장소 루트에서 실행한다.
 *   pnpm course create --title <제목> --topic <주제> --audience <대상> [--difficulty beginner]
 *   pnpm course status <슬러그>
 *   pnpm course preflight --sections N --chars N --seconds N
 *   pnpm course register <슬러그>
 *   pnpm course publish <슬러그> | hide <슬러그>
 */
const paths = repoPaths(process.cwd());
const [cmd, ...rest] = process.argv.slice(2);

function opt(name: string, fallback?: string): string {
  const i = rest.indexOf(`--${name}`);
  const v = i >= 0 ? rest[i + 1] : undefined;
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    console.error(`--${name} 값이 필요합니다`);
    process.exit(1);
  }
  return v;
}

switch (cmd) {
  case "create": {
    const { slug, dir } = createCourse(paths, {
      title: opt("title"),
      topic: opt("topic"),
      audience: opt("audience"),
      difficulty: opt("difficulty", "beginner") as "beginner" | "intermediate" | "advanced",
      contentStyle: opt("style", "차분하고 친근한 설명체"),
      learningOutcomes: opt("outcomes", "주제를 스스로 설명할 수 있다").split("|"),
      prerequisites: opt("prerequisites", "").split("|").filter(Boolean),
      estimatedMinutes: Number(opt("minutes", "60")),
      styleVersion: opt("style-version", "v1"),
      runId: opt("run-id", `gen-${Date.now()}`),
    });
    writeStatusBoard(process.cwd());
    console.log(`만들었습니다: ${slug} (${resolve(dir)})`);
    console.log("다음: 목차를 제안하고 승인받은 뒤 챕터를 생성하십시오 (S3~S10).");
    break;
  }
  case "status": {
    const slug = rest[0];
    if (!slug) {
      console.error("사용법: pnpm course status <슬러그>");
      process.exit(1);
    }
    const s = courseStatus(paths, slug);
    console.log(`${s.title} [${s.slug}] — 상태: ${s.status}`);
    console.log(`게이트: ${s.gate.ok ? "통과" : "막힘"}`);
    for (const r of s.gate.reasons) console.log(`  - ${r}`);
    console.log(`다음에 가능한 일:`);
    for (const a of s.nextActions) console.log(`  · ${a}`);
    console.log(`권장: ${s.recommended}`);
    break;
  }
  case "preflight": {
    const loaded = loadThresholds(join(paths.standardsDir, "thresholds.json"));
    const r = preflight(
      {
        plannedSections: Number(opt("sections")),
        maxPlannedSectionChars: Number(opt("chars", "3000")),
        plannedOverviewSeconds: Number(opt("seconds", "90")),
        activeJobs: Number(opt("jobs", "0")),
        freeStorageGB: Number(opt("free-gb", "10")),
      },
      loaded,
    );
    if (r.notice) console.log(`알림: ${r.notice}`);
    if (r.ok) console.log("실행 전 점검 통과 — 생성을 시작해도 됩니다.");
    else {
      console.log("실행 전 점검에 걸렸습니다 — 작업을 시작하지 마십시오:");
      for (const v of r.violations) console.log(`  - ${v}`);
      process.exit(1);
    }
    break;
  }
  case "register": {
    const slug = rest[0];
    if (!slug) {
      console.error("사용법: pnpm course register <슬러그>");
      process.exit(1);
    }
    const r = registerDraft(join(paths.coursesDir, slug), paths.standardsDir);
    if (!r.ok) {
      console.log("초안 등록 거부 — 전부 아니면 무입니다. 빠진 것:");
      for (const m of r.missing) console.log(`  - ${m}`);
      process.exit(1);
    }
    writeStatusBoard(process.cwd());
    console.log(
      `초안으로 등록했습니다. 기계 검사: ${r.machineCheck?.pass ? "통과" : `차단 ${r.machineCheck?.blocker_count}건`}`,
    );
    break;
  }
  case "publish":
  case "hide": {
    const slug = rest[0];
    if (!slug) {
      console.error(`사용법: pnpm course ${cmd} <슬러그>`);
      process.exit(1);
    }
    const r = setStatus(paths, slug, cmd === "publish" ? "published" : "hidden");
    if (!r.ok) {
      console.log("발행할 수 없습니다 — 게이트가 막았습니다:");
      for (const reason of r.reasons) console.log(`  - ${reason}`);
      process.exit(1);
    }
    writeStatusBoard(process.cwd());
    console.log(
      cmd === "publish"
        ? "발행 상태로 바꿨습니다. 커밋·푸시하면 공개됩니다."
        : "숨김 상태로 바꿨습니다.",
    );
    break;
  }
  default:
    console.error("명령: create | status | preflight | register | publish | hide");
    process.exit(1);
}
