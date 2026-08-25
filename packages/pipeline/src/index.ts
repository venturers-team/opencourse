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
// media/render.js는 여기서 내보내지 않는다 — Playwright를 끌고 오므로 사이트 빌드(webpack)가
// 배럴을 통해 번들하려 든다. 소비자는 CLI(pnpm course render) 또는 딥 임포트로 쓴다.
export * from "./review/state.js";
export * from "./review/sentence-session.js";
export * from "./review/section-session.js";
export * from "./review/edit-impact.js";
export * from "./publishing.js";
export * from "./chat/logic.js";
export * from "./ops/metrics.js";
export * from "./ops/board.js";
export * from "./ops/manual.js";
export * from "./ops/assets.js";
export * from "./ops/styles.js";
export * from "./ops/builds.js";
