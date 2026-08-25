import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectPublishable, type CollectResult } from "@opencourse/pipeline";

/**
 * 빌드가 읽는 콘텐츠의 뿌리. OPENCOURSE_ROOT로 재지정할 수 있다 (E2E가 쓴다).
 * 산출물 수집은 언제나 collectPublishable — 유일한 관문 — 을 거친다 (docs/05).
 */
export function contentRoot(): string {
  const override = process.env.OPENCOURSE_ROOT;
  if (override) return override;
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

export const isPreview = (): boolean => process.env.OPENCOURSE_PREVIEW === "1";

export function collect(): CollectResult {
  return collectPublishable(contentRoot());
}
