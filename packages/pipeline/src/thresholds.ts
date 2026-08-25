import { existsSync, readFileSync } from "node:fs";
import { ThresholdsSchema, type Thresholds } from "@opencourse/content";

/**
 * 임계치 읽기 (content/standards/thresholds.md).
 * 파일이 없거나 읽을 수 없으면 기본값으로 돌되, 기본값을 썼다는 사실을 반드시 알린다 —
 * 조용히 기본값으로 도는 것이 가장 나쁘다.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  version: 1,
  updatedAt: "2026-08-21",
  source: "judgement",
  thresholds: {
    maxSections: { value: 15, unit: "count", default: 15 },
    maxSectionChars: { value: 3000, unit: "chars", default: 3000 },
    maxOverviewSeconds: { value: 90, unit: "seconds", default: 90 },
    maxConcurrentJobs: { value: 2, unit: "count", default: 2 },
    minFreeStorageGB: { value: 1, unit: "GB", default: 1 },
  },
  learnerState: {
    maxKnownFacts: { value: 40, unit: "count", default: 40 },
    maxDefinedTerms: { value: 40, unit: "count", default: 40 },
    maxOpenQuestions: { value: 20, unit: "count", default: 20 },
  },
};

export interface LoadedThresholds {
  thresholds: Thresholds;
  usedDefaults: boolean;
  notice: string | null;
}

export function loadThresholds(path: string): LoadedThresholds {
  if (!existsSync(path)) {
    return {
      thresholds: DEFAULT_THRESHOLDS,
      usedDefaults: true,
      notice: `임계치 파일이 없어 기본값으로 돕니다: ${path}`,
    };
  }
  try {
    const parsed = ThresholdsSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    return { thresholds: parsed, usedDefaults: false, notice: null };
  } catch {
    return {
      thresholds: DEFAULT_THRESHOLDS,
      usedDefaults: true,
      notice: `임계치 파일을 읽을 수 없어 기본값으로 돕니다: ${path}`,
    };
  }
}

/** 실행 전 점검 입력 — 다섯 값을 재어 임계치와 비교한다 (docs/10 S4). */
export interface PreflightInput {
  plannedSections: number;
  maxPlannedSectionChars: number;
  plannedOverviewSeconds: number;
  activeJobs: number;
  freeStorageGB: number;
}

export interface PreflightResult {
  ok: boolean;
  violations: string[];
  notice: string | null;
  usedDefaults: boolean;
}

export function preflight(input: PreflightInput, loaded: LoadedThresholds): PreflightResult {
  const t = loaded.thresholds.thresholds;
  const violations: string[] = [];
  if (input.plannedSections > t.maxSections.value) {
    violations.push(
      `섹션 수 ${input.plannedSections}이 상한 ${t.maxSections.value}을 넘습니다 — 교재를 나누십시오`,
    );
  }
  if (input.maxPlannedSectionChars > t.maxSectionChars.value) {
    violations.push(
      `섹션당 목표 분량 ${input.maxPlannedSectionChars}자가 상한 ${t.maxSectionChars.value}자를 넘습니다 — 섹션을 나누십시오`,
    );
  }
  if (input.plannedOverviewSeconds > t.maxOverviewSeconds.value) {
    violations.push(
      `개요 영상 ${input.plannedOverviewSeconds}초가 상한 ${t.maxOverviewSeconds.value}초를 넘습니다 — 길이를 줄이십시오`,
    );
  }
  if (input.activeJobs >= t.maxConcurrentJobs.value) {
    violations.push(
      `동시 실행 작업이 ${input.activeJobs}개라 상한 ${t.maxConcurrentJobs.value}에 찼습니다 — 앞 작업이 끝날 때까지 보류하십시오`,
    );
  }
  if (input.freeStorageGB < t.minFreeStorageGB.value) {
    violations.push(
      `저장소 잔여 용량 ${input.freeStorageGB}GB가 하한 ${t.minFreeStorageGB.value}GB에 못 미칩니다 — 오래된 자산을 정리하십시오`,
    );
  }
  return {
    ok: violations.length === 0,
    violations,
    notice: loaded.notice,
    usedDefaults: loaded.usedDefaults,
  };
}
