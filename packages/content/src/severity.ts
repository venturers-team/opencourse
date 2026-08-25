/**
 * 등급 판정표 (content/standards/review-protocol.md).
 * 검수자가 등급을 임의로 정하지 않는다 — 점수에서 등급이 기계적으로 나온다.
 */
export type Severity = "pass" | "minor" | "major" | "critical";
export type Score = 0 | 1 | 2;

export interface SentenceDimensions {
  clarity: Score;
  consistency: Score;
  flow: Score;
  logic: Score;
  novice_comprehension: Score;
}

export interface SectionDimensions {
  completeness: Score;
  sequence: Score;
  frame_consistency: Score;
  evidence: Score;
  learner_exit: Score;
}

function table(values: Score[], criticalAxis: Score): Severity {
  const zeros = values.filter((v) => v === 0).length;
  const ones = values.filter((v) => v === 1).length;
  if (zeros >= 2 || criticalAxis === 0) return "critical";
  if (zeros === 1) return "major";
  if (ones >= 2) return "minor";
  return "pass";
}

/** 문장 검수: 초보자 이해도 0점은 곧바로 심각. */
export function expectedSentenceSeverity(d: SentenceDimensions): Severity {
  return table(
    [d.clarity, d.consistency, d.flow, d.logic, d.novice_comprehension],
    d.novice_comprehension,
  );
}

/** 섹션 검수: 같은 표, 다섯째 차원(학습자 도달 상태)이 초보자 이해도의 자리 (docs/11 §6). */
export function expectedSectionSeverity(d: SectionDimensions): Severity {
  return table(
    [d.completeness, d.sequence, d.frame_consistency, d.evidence, d.learner_exit],
    d.learner_exit,
  );
}

export const BLOCKING_SEVERITIES: ReadonlySet<Severity> = new Set(["major", "critical"]);
