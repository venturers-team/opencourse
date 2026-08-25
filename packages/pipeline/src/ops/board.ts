import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CourseSchema, MediaManifestSchema, canPublish } from "@opencourse/content";
import { repoPaths } from "../lifecycle.js";
import { computeMetrics } from "./metrics.js";

/**
 * ops/STATUS.md — 자동 생성 상태 보드 (docs/11 §12, docs/09 관제와 관측).
 * 사람이 고치지 않는다. 도구가 중요한 변경마다 다시 생성하며,
 * CI가 "다시 생성해도 차이가 없는가"를 검사해 낡은 보드를 잡는다.
 * 보드는 커밋된 데이터에서만 파생된다 — 벽시계를 쓰지 않아 재생성이 결정적이다.
 */
const FREE_STORAGE_GB = 10;
const MONTHLY_BUILD_LIMIT = 500;

interface CourseRow {
  slug: string;
  title: string;
  status: string;
  gates: { machine: string; sentence: string; section: string; manual: string };
  fingerprintsOk: boolean;
  updatedAt: string;
  nextAction: string;
  mediaBytes: number;
}

function gateStates(reasons: string[]): CourseRow["gates"] & { fingerprintsOk: boolean } {
  const state = (keyword: string): string => {
    const related = reasons.filter((r) => r.includes(keyword));
    if (related.length === 0) return "통과";
    if (related.some((r) => r.includes("없습니다"))) return "없음";
    if (related.some((r) => r.includes("무효"))) return "무효";
    return "미통과";
  };
  return {
    machine: state("기계 검사"),
    sentence: state("문장 검수"),
    section: state("섹션 검수"),
    manual: state("수동 검토"),
    fingerprintsOk: !reasons.some((r) => r.includes("지문")),
  };
}

function collectRows(root: string): CourseRow[] {
  const paths = repoPaths(root);
  if (!existsSync(paths.coursesDir)) return [];
  const rows: CourseRow[] = [];
  const slugs = readdirSync(paths.coursesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const slug of slugs) {
    const dir = join(paths.coursesDir, slug);
    const parsed = CourseSchema.safeParse(
      JSON.parse(readFileSync(join(dir, "course.json"), "utf8")),
    );
    if (!parsed.success) continue;
    const course = parsed.data;
    const gate = canPublish(dir, paths.standardsDir);
    const gates = gateStates(gate.reasons);
    let mediaBytes = 0;
    for (const ch of course.chapters) {
      const manifestPath = join(dir, "chapters", ch.id, "media.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = MediaManifestSchema.safeParse(
        JSON.parse(readFileSync(manifestPath, "utf8")),
      );
      if (manifest.success) {
        for (const item of manifest.data.items) mediaBytes += item.bytes ?? 0;
      }
    }
    const nextAction =
      course.status === "published"
        ? "—"
        : gate.ok
          ? course.status === "draft"
            ? "발행 판단"
            : "초안 등록"
          : (gate.reasons[0] ?? "");
    rows.push({
      slug,
      title: course.title,
      status: course.status,
      gates,
      fingerprintsOk: gates.fingerprintsOk,
      updatedAt: course.updated_at,
      nextAction,
      mediaBytes,
    });
  }
  return rows;
}

export function renderStatusBoard(root: string): string {
  const paths = repoPaths(root);
  const rows = collectRows(root);
  const metrics = computeMetrics(paths.opsRunsDir);
  const latest = [...rows.map((r) => r.updatedAt), ...metrics.recent.map((r) => r.run_id)];
  const asOf =
    rows
      .map((r) => r.updatedAt)
      .sort()
      .at(-1) ?? "기록 없음";
  void latest;

  const pct = (v: number | null) => (v === null ? "측정 전" : `${Math.round(v * 100)}%`);
  const totalMediaGB = rows.reduce((sum, r) => sum + r.mediaBytes, 0) / 1024 ** 3;

  const lines: string[] = [];
  lines.push("# 상태 보드");
  lines.push("");
  lines.push(
    "> 자동 생성 문서다 — **직접 수정 금지.** 도구가 중요한 변경마다 다시 생성하며, `pnpm board:check`가 낡은 보드를 잡는다. 기준 시각(마지막 교재 갱신): " +
      asOf,
  );
  lines.push("");
  lines.push("## 지표");
  lines.push("");
  lines.push(
    `- 생성 완료율: **${pct(metrics.completionRate)}** (생성 작업 ${metrics.generateCount}건 기준, 목표 ≥90%)`,
  );
  lines.push(
    `- 파이프라인 오류율: **${pct(metrics.errorRate)}** (완료 작업 ${metrics.runCount}건 기준, 목표 ≤10%)`,
  );
  lines.push(
    `- 첫 초안 소요 중앙값: **${metrics.medianDraftMinutes === null ? "측정 전" : `${metrics.medianDraftMinutes}분`}** (목표 없음 — 기록만)`,
  );
  lines.push("");
  lines.push("## 교재");
  lines.push("");
  if (rows.length === 0) {
    lines.push("아직 교재가 없다.");
  } else {
    lines.push("| 교재 | 상태 | 기계 | 문장 | 섹션 | 수동 | 지문 | 다음 할 일 |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const r of rows) {
      lines.push(
        `| ${r.title} (\`${r.slug}\`) | ${r.status} | ${r.gates.machine} | ${r.gates.sentence} | ${r.gates.section} | ${r.gates.manual} | ${r.fingerprintsOk ? "일치" : "어긋남"} | ${r.nextAction} |`,
      );
    }
  }
  lines.push("");
  lines.push("## 진행 중 작업");
  lines.push("");
  if (metrics.inProgress.length === 0) lines.push("진행 중인 작업이 없다.");
  else {
    for (const run of metrics.inProgress) {
      lines.push(
        `- \`${run.run_id}\` (${run.kind}) — ${run.lastStage ?? "시작"} 단계, ${run.startedAt} 시작`,
      );
    }
  }
  lines.push("");
  lines.push("## 최근 실행");
  lines.push("");
  if (metrics.recent.length === 0) lines.push("실행 기록이 없다.");
  else {
    for (const run of metrics.recent) {
      lines.push(
        `- \`${run.run_id}\` (${run.kind}) — ${run.status}${run.minutes !== null ? `, ${run.minutes}분` : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("## 용량과 한도");
  lines.push("");
  lines.push(
    `- 미디어 총량: ${totalMediaGB.toFixed(3)}GB / ${FREE_STORAGE_GB}GB (${((totalMediaGB / FREE_STORAGE_GB) * 100).toFixed(1)}%)`,
  );
  lines.push(
    `- 월 빌드 횟수: 인프라 연결 전 (9단계에서 측정 시작, 한도 ${MONTHLY_BUILD_LIMIT}회/월)`,
  );
  lines.push("");
  return lines.join("\n");
}

export function writeStatusBoard(root: string): string {
  const content = renderStatusBoard(root);
  mkdirSync(join(root, "ops"), { recursive: true });
  writeFileSync(join(root, "ops", "STATUS.md"), content + "\n");
  return content;
}

/** CI 검사: 보드를 다시 생성해 커밋된 것과 다르면 낡은 것이다. */
export function checkStatusBoard(root: string): { fresh: boolean; message: string } {
  const path = join(root, "ops", "STATUS.md");
  if (!existsSync(path)) {
    return { fresh: false, message: "ops/STATUS.md가 없습니다 — pnpm board를 실행하십시오" };
  }
  const current = readFileSync(path, "utf8").trimEnd();
  const regenerated = renderStatusBoard(root).trimEnd();
  if (current !== regenerated) {
    return {
      fresh: false,
      message: "보드가 실제 상태와 다릅니다 — pnpm board를 실행해 갱신하십시오",
    };
  }
  return { fresh: true, message: "보드가 실제 상태와 일치합니다" };
}
