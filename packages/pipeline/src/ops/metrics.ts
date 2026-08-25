import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RunSchema, type Run } from "@opencourse/content";

/**
 * 세 지표 (docs/01 성공 기준): 생성 완료율 ≥90%, 파이프라인 오류율 ≤10%,
 * 첫 검토 가능 초안 소요 시간의 중앙값(목표 없음, 기록만).
 * 전부 ops/runs/의 집계다 — 별도 집계가 필요하면 아무도 보지 않게 된다.
 */
export interface Metrics {
  runCount: number;
  generateCount: number;
  completionRate: number | null;
  errorRate: number | null;
  medianDraftMinutes: number | null;
  inProgress: { run_id: string; kind: string; startedAt: string; lastStage: string | null }[];
  recent: { run_id: string; kind: string; status: string; minutes: number | null }[];
  period: { from: string | null; to: string | null };
}

export function loadRuns(opsRunsDir: string): Run[] {
  if (!existsSync(opsRunsDir)) return [];
  const runs: Run[] = [];
  for (const entry of readdirSync(opsRunsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const parsed = RunSchema.safeParse(
      JSON.parse(readFileSync(join(opsRunsDir, entry.name), "utf8")),
    );
    if (parsed.success) runs.push(parsed.data);
  }
  return runs.sort((a, b) => a.started_at.localeCompare(b.started_at));
}

function minutesOf(run: Run): number | null {
  if (!run.ended_at) return null;
  return Math.round((Date.parse(run.ended_at) - Date.parse(run.started_at)) / 60000);
}

export function computeMetrics(opsRunsDir: string): Metrics {
  const runs = loadRuns(opsRunsDir);
  const finished = runs.filter((r) => r.ended_at !== null);
  const generates = finished.filter((r) => r.kind === "generate");
  const succeeded = generates.filter((r) => r.status === "success");
  const failed = finished.filter((r) => r.status === "failed");
  const draftDurations = succeeded
    .map(minutesOf)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  return {
    runCount: runs.length,
    generateCount: generates.length,
    completionRate: generates.length > 0 ? succeeded.length / generates.length : null,
    errorRate: finished.length > 0 ? failed.length / finished.length : null,
    medianDraftMinutes:
      draftDurations.length > 0
        ? (draftDurations[Math.floor(draftDurations.length / 2)] as number)
        : null,
    inProgress: runs
      .filter((r) => r.ended_at === null)
      .map((r) => ({
        run_id: r.run_id,
        kind: r.kind,
        startedAt: r.started_at,
        lastStage: r.stages[r.stages.length - 1]?.id ?? null,
      })),
    recent: runs.slice(-10).map((r) => ({
      run_id: r.run_id,
      kind: r.kind,
      status: r.ended_at ? r.status : "진행 중",
      minutes: minutesOf(r),
    })),
    period: {
      from: runs[0]?.started_at ?? null,
      to: runs[runs.length - 1]?.started_at ?? null,
    },
  };
}
