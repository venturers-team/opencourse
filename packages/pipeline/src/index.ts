/**
 * @opencourse/pipeline — 생성 파이프라인의 결정적 부품 (구현 계획 3단계).
 * 글을 쓰는 것은 에이전트의 일이고, 여기는 경로·상태 전환·임계치·기록·검증을 지킨다.
 * 단계 설계의 정본은 docs/10-생성-파이프라인.md다.
 */
export * from "./slug.js";
export * from "./thresholds.js";
export * from "./run-recorder.js";
export * from "./lifecycle.js";
export * from "./draft-register.js";
export * from "./media/backend.js";
export * from "./media/synth.js";
