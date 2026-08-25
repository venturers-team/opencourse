import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CourseSchema, MediaManifestSchema } from "@opencourse/content";
import { repoPaths } from "../lifecycle.js";

/**
 * 미디어 자산과 저장 용량 (docs/04 화면 12의 몫).
 * 교체·미사용 자산은 정리 대상으로 표시된 뒤 90일이 지나면 지운다.
 * 발행 중이거나 발행된 적 있는 교재가 참조하는 자산은 기간이 지나도 지우지 않는다.
 */
export const CLEANUP_GRACE_DAYS = 90;

export interface AssetRow {
  slug: string;
  chapterId: string;
  id: string;
  kind: string;
  bytes: number | null;
  status: "active" | "cleanup";
  cleanupMarkedAt: string | null;
  purgeEligibleAt: string | null;
  protected: boolean; // 발행 이력 교재의 자산 — 삭제 불가
}

export function listAssets(root: string): { assets: AssetRow[]; totalBytes: number } {
  const paths = repoPaths(root);
  const assets: AssetRow[] = [];
  let totalBytes = 0;
  if (!existsSync(paths.coursesDir)) return { assets, totalBytes };
  for (const entry of readdirSync(paths.coursesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(paths.coursesDir, entry.name);
    const course = CourseSchema.safeParse(
      JSON.parse(readFileSync(join(dir, "course.json"), "utf8")),
    );
    if (!course.success) continue;
    const isProtected = course.data.published_at !== null;
    for (const ch of course.data.chapters) {
      const manifestPath = join(dir, "chapters", ch.id, "media.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = MediaManifestSchema.safeParse(
        JSON.parse(readFileSync(manifestPath, "utf8")),
      );
      if (!manifest.success) continue;
      for (const item of manifest.data.items) {
        totalBytes += item.bytes ?? 0;
        const eligible =
          item.status === "cleanup" && item.cleanup_marked_at
            ? new Date(Date.parse(item.cleanup_marked_at) + CLEANUP_GRACE_DAYS * 86400000)
                .toISOString()
                .replace(/\.\d+Z$/u, "Z")
            : null;
        assets.push({
          slug: entry.name,
          chapterId: ch.id,
          id: item.id,
          kind: item.kind,
          bytes: item.bytes,
          status: item.status,
          cleanupMarkedAt: item.cleanup_marked_at,
          purgeEligibleAt: eligible,
          protected: isProtected,
        });
      }
    }
  }
  return { assets, totalBytes };
}

function editManifest(
  root: string,
  slug: string,
  chapterId: string,
  assetId: string,
  fn: (item: Record<string, unknown>) => void,
): void {
  const paths = repoPaths(root);
  const manifestPath = join(paths.coursesDir, slug, "chapters", chapterId, "media.json");
  const doc = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    items: Record<string, unknown>[];
  };
  const item = doc.items.find((i) => i.id === assetId);
  if (!item) throw new Error(`자산이 없습니다: ${slug}/${chapterId}/${assetId}`);
  fn(item);
  MediaManifestSchema.parse(doc);
  writeFileSync(manifestPath, JSON.stringify(doc, null, 2) + "\n");
}

export function markCleanup(
  root: string,
  slug: string,
  chapterId: string,
  assetId: string,
  now: string,
): void {
  editManifest(root, slug, chapterId, assetId, (item) => {
    item.status = "cleanup";
    item.cleanup_marked_at = now;
  });
}

export function unmarkCleanup(
  root: string,
  slug: string,
  chapterId: string,
  assetId: string,
): void {
  editManifest(root, slug, chapterId, assetId, (item) => {
    item.status = "active";
    item.cleanup_marked_at = null;
  });
}

/**
 * 즉시 삭제 가능 여부 — 발행 이력 교재의 자산은 어떤 경우에도 지우지 않는다.
 * 실제 원격(R2) 삭제는 미디어 백엔드가 하고, 여기는 규칙만 판정한다.
 */
export function canPurge(
  root: string,
  slug: string,
  chapterId: string,
  assetId: string,
): { ok: boolean; reason: string | null } {
  const { assets } = listAssets(root);
  const asset = assets.find(
    (a) => a.slug === slug && a.chapterId === chapterId && a.id === assetId,
  );
  if (!asset) return { ok: false, reason: "자산이 없습니다" };
  if (asset.protected) {
    return {
      ok: false,
      reason: "발행 이력이 있는 교재의 자산은 지우지 않습니다 — 공개 링크가 깨집니다",
    };
  }
  if (asset.status !== "cleanup") {
    return { ok: false, reason: "정리 대상으로 표시된 자산만 지울 수 있습니다" };
  }
  return { ok: true, reason: null };
}
