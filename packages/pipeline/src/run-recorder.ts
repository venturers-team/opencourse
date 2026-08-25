import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRunId, RunSchema, type Run } from "@opencourse/content";

/**
 * 작업 기록기 (docs/11 §11). 모든 실행은 시작·종료 시각과 단계별 소요 시간을
 * ops/runs/<run_id>.json에 남긴다 — 지표 셋(완료율·오류율·소요 중앙값)의 원천이다.
 * 시간 목표는 없지만 재지 않으면 고장 신호를 놓친다 (docs/01).
 */
type RunKind = Run["kind"];
type MetricKey = "model_calls" | "tts_seconds" | "uploaded_bytes";

interface StageRecord {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: "success" | "failed" | "aborted" | "skipped";
  outputs: string[];
  error: string | null;
}

export class RunRecorder {
  readonly runId: string;
  readonly dir: string;
  private readonly stages: StageRecord[] = [];
  private readonly startedAt: string;
  private endedAt: string | null = null;
  private status: Run["status"] = "failed";
  private failedStage: string | null = null;
  private readonly metrics = {
    model_calls: null as number | null,
    tts_seconds: null as number | null,
    uploaded_bytes: null as number | null,
  };

  constructor(
    private readonly opsRunsDir: string,
    private readonly courseId: string,
    private readonly kind: RunKind,
    task: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.runId = makeRunId(kind === "generate" ? "gen" : kind, task, this.now());
    this.dir = join(opsRunsDir, this.runId);
    this.startedAt = this.iso();
    mkdirSync(this.dir, { recursive: true });
    this.flush();
  }

  private iso(): string {
    return this.now()
      .toISOString()
      .replace(/\.\d+Z$/u, "Z");
  }

  /** 단계 하나를 실행하고 시간·산출물·실패를 기록한다. 실패는 다시 던진다. */
  async stage<T>(id: string, fn: () => Promise<T> | T, outputs: string[] = []): Promise<T> {
    const record: StageRecord = {
      id,
      started_at: this.iso(),
      ended_at: null,
      status: "failed",
      outputs,
      error: null,
    };
    this.stages.push(record);
    try {
      const result = await fn();
      record.status = "success";
      return result;
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      this.failedStage = id;
      throw error;
    } finally {
      record.ended_at = this.iso();
      this.flush();
    }
  }

  addMetric(key: MetricKey, delta: number): void {
    this.metrics[key] = (this.metrics[key] ?? 0) + delta;
  }

  finish(status: Run["status"] = "success"): Run {
    this.status = this.failedStage ? "failed" : status;
    this.endedAt = this.iso();
    return this.flush();
  }

  private flush(): Run {
    const doc: Run = RunSchema.parse({
      schema_version: 1,
      run_id: this.runId,
      course_id: this.courseId,
      kind: this.kind,
      started_at: this.startedAt,
      ended_at: this.endedAt,
      status: this.endedAt ? this.status : "aborted",
      failed_stage: this.failedStage,
      stages: this.stages,
      metrics: this.metrics,
    });
    mkdirSync(this.opsRunsDir, { recursive: true });
    writeFileSync(join(this.opsRunsDir, `${this.runId}.json`), JSON.stringify(doc, null, 2) + "\n");
    return doc;
  }
}
