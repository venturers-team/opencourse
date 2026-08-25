#!/usr/bin/env node
import { execSync } from "node:child_process";
import { join } from "node:path";
import { courseStatus, repoPaths } from "./lifecycle.js";
import { computeMetrics } from "./ops/metrics.js";
import { checkStatusBoard, writeStatusBoard } from "./ops/board.js";
import { recordManualReview } from "./ops/manual.js";
import { canPurge, listAssets, markCleanup, unmarkCleanup } from "./ops/assets.js";
import { activateStyle, listStyles } from "./ops/styles.js";
import { SentenceReviewSession } from "./review/sentence-session.js";
import { SectionReviewSession } from "./review/section-session.js";
import { collectPublishable } from "./publishing.js";
import type { MrCode } from "@opencourse/content";

/**
 * 운영 CLI (구현 계획 6단계) — 화면 6~14의 기능을 명령으로.
 * 관제는 여기서, 관측은 ops/STATUS.md 보드에서. 상태를 바꾸는 명령은 보드를 재생성한다.
 */
const root = process.cwd();
const paths = repoPaths(root);
const [cmd, ...rest] = process.argv.slice(2);
const now = () => new Date().toISOString().replace(/\.\d+Z$/u, "Z");

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

function uncommittedCount(): number | null {
  try {
    return execSync("git status --porcelain", { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean).length;
  } catch {
    return null;
  }
}

switch (cmd) {
  case "status": {
    const slug = rest[0] && !rest[0].startsWith("--") ? rest[0] : null;
    if (slug) {
      const s = courseStatus(paths, slug);
      console.log(`${s.title} [${s.slug}] — 상태: ${s.status}`);
      console.log(`게이트: ${s.gate.ok ? "통과" : "막힘"}`);
      for (const r of s.gate.reasons) console.log(`  - ${r}`);
      console.log("다음에 가능한 일:");
      for (const a of s.nextActions) console.log(`  · ${a}`);
      console.log(`권장: ${s.recommended}`);
      break;
    }
    const { published, excluded } = collectPublishable(root);
    console.log(`발행 중 교재: ${published.length}권`);
    for (const p of published) console.log(`  · ${p.course.title} (${p.slug})`);
    if (excluded.length > 0) {
      console.log(`미발행/제외: ${excluded.length}권`);
      for (const e of excluded) console.log(`  · ${e.slug} [${e.status}] — ${e.reasons[0] ?? ""}`);
    }
    const metrics = computeMetrics(paths.opsRunsDir);
    const pct = (v: number | null) => (v === null ? "측정 전" : `${Math.round(v * 100)}%`);
    console.log(
      `지표: 완료율 ${pct(metrics.completionRate)} · 오류율 ${pct(metrics.errorRate)} · 초안 중앙값 ${metrics.medianDraftMinutes ?? "측정 전"}분`,
    );
    const dirty = uncommittedCount();
    if (dirty !== null)
      console.log(`보내지 않은 변경: ${dirty}건 (커밋·푸시 전까지는 내 기기 안의 일)`);
    writeStatusBoard(root);
    console.log("보드 갱신: ops/STATUS.md");
    break;
  }
  case "metrics": {
    const m = computeMetrics(paths.opsRunsDir);
    console.log(JSON.stringify(m, null, 2));
    break;
  }
  case "board": {
    writeStatusBoard(root);
    console.log("ops/STATUS.md를 다시 생성했습니다.");
    break;
  }
  case "board:check": {
    const r = checkStatusBoard(root);
    console.log(r.message);
    if (!r.fresh) process.exit(1);
    break;
  }
  case "manual": {
    const [slug, code, action] = rest;
    if (!slug || !code || !["done", "waive", "reopen"].includes(action ?? "")) {
      console.error(
        "사용법: pnpm ops manual <슬러그> <MR코드> done|waive|reopen --actor <이름> [--reason <사유>] [--note <메모>]",
      );
      process.exit(1);
    }
    const doc = recordManualReview(join(paths.coursesDir, slug), {
      code: code as MrCode,
      action: action as "done" | "waive" | "reopen",
      actor: opt("actor", action === "reopen" ? "관리자" : undefined),
      note: opt("note", ""),
      waiveReason: opt("reason", ""),
      now: now(),
    });
    console.log(`기록했습니다. 누적 보류 ${doc.waived_count_total}건.`);
    writeStatusBoard(root);
    break;
  }
  case "exception": {
    const slug = rest[0];
    if (!slug) {
      console.error(
        "사용법: pnpm ops exception <슬러그> --unit <문장id>|--chapter <챕터id> --reason <사유> --by <승인자>",
      );
      process.exit(1);
    }
    const reason = opt("reason");
    const by = opt("by");
    const unit = opt("unit", "");
    const chapter = opt("chapter", "");
    const dir = join(paths.coursesDir, slug);
    if (unit) {
      SentenceReviewSession.open(dir, paths.standardsDir).approveException(unit, reason, by);
    } else if (chapter) {
      SectionReviewSession.open(dir, paths.standardsDir).approveException(chapter, reason, by);
    } else {
      console.error("--unit 또는 --chapter가 필요합니다");
      process.exit(1);
    }
    console.log("예외를 승인하고 누적 기록에 남겼습니다.");
    writeStatusBoard(root);
    break;
  }
  case "media": {
    const sub = rest[0];
    if (sub === "mark" || sub === "unmark" || sub === "purge-check") {
      const [, slug, chapterId, assetId] = rest;
      if (!slug || !chapterId || !assetId) {
        console.error(`사용법: pnpm ops media ${sub} <슬러그> <챕터id> <자산id>`);
        process.exit(1);
      }
      if (sub === "mark") markCleanup(root, slug, chapterId, assetId, now());
      else if (sub === "unmark") unmarkCleanup(root, slug, chapterId, assetId);
      else {
        const r = canPurge(root, slug, chapterId, assetId);
        console.log(r.ok ? "지울 수 있습니다" : `지울 수 없습니다: ${r.reason}`);
        if (!r.ok) process.exit(1);
        break;
      }
      console.log("표시를 갱신했습니다.");
      writeStatusBoard(root);
      break;
    }
    const { assets, totalBytes } = listAssets(root);
    console.log(`자산 ${assets.length}건, 총 ${(totalBytes / 1024 ** 2).toFixed(1)}MB / 10GB`);
    for (const a of assets) {
      console.log(
        `  · ${a.slug}/${a.chapterId}/${a.id} [${a.status}${a.protected ? "·보호" : ""}]${a.purgeEligibleAt ? ` 정리 예정 ${a.purgeEligibleAt}` : ""}`,
      );
    }
    break;
  }
  case "styles": {
    if (rest[0] === "activate") {
      const version = rest[1];
      if (!version) {
        console.error("사용법: pnpm ops styles activate <버전> --by <이름>");
        process.exit(1);
      }
      activateStyle(root, version, opt("by"), now());
      console.log(`${version}을 활성화했습니다.`);
      break;
    }
    for (const s of listStyles(root)) {
      console.log(
        `  · ${s.version}${s.active ? " (활성)" : ""} — ${s.createdBy}, ${s.createdAt}${s.referencedBy.length > 0 ? `, 참조: ${s.referencedBy.join(", ")}` : ""}`,
      );
    }
    break;
  }
  default:
    console.error(
      "명령: status [슬러그] | metrics | board | board:check | manual | exception | media | styles",
    );
    process.exit(1);
}
