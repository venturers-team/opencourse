/**
 * @opencourse/content — 콘텐츠 계약의 스키마·검증기·지문·canPublish.
 * 계약 설계의 정본은 docs/11-콘텐츠-계약-스키마.md이며,
 * 이 패키지는 그 문서를 코드로 옮긴 것이다 (구현 계획 1단계).
 */
export const SCHEMA_VERSION = 1;

export * from "./fingerprint.js";
export * from "./ids.js";
export * from "./severity.js";
export * from "./schemas/course.js";
export * from "./schemas/media.js";
export * from "./schemas/machine-check.js";
export * from "./schemas/sentence-review.js";
export * from "./schemas/section-review.js";
export * from "./schemas/manual-review.js";
export * from "./schemas/misc.js";
export * from "./can-publish.js";
export * from "./fixture.js";
export * from "./units.js";
export * from "./machine-check/static-rules.js";
export * from "./machine-check/structure-rules.js";
export * from "./machine-check/run.js";
