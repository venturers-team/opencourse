/** 공개 주소 — 9단계에서 실제 도메인으로 바꾼다 (OPENCOURSE_SITE_ORIGIN). */
export function siteOrigin(): string {
  return process.env.OPENCOURSE_SITE_ORIGIN ?? "https://opencourse-537.pages.dev";
}
