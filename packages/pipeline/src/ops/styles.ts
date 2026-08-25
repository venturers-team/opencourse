import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CourseSchema, StyleActiveSchema, StyleVersionSchema } from "@opencourse/content";
import { repoPaths } from "../lifecycle.js";

/**
 * 스타일 버전 관리 (docs/04 화면 10의 몫, docs/11 §10).
 * 버전은 파일 하나씩 쌓이고, 어느 교재가 어느 버전을 썼는지는 저장하지 않고
 * course.json.style_version 스캔으로 계산한다 (정본 중복 금지).
 */
export interface StyleInfo {
  version: string;
  createdAt: string;
  createdBy: string;
  active: boolean;
  referencedBy: string[];
}

function stylesDir(root: string): string {
  return join(repoPaths(root).standardsDir, "styles");
}

export function listStyles(root: string): StyleInfo[] {
  const dir = stylesDir(root);
  if (!existsSync(dir)) return [];
  const activePath = join(dir, "active.json");
  const active = existsSync(activePath)
    ? StyleActiveSchema.parse(JSON.parse(readFileSync(activePath, "utf8"))).active
    : null;

  const references = new Map<string, string[]>();
  const coursesDir = repoPaths(root).coursesDir;
  if (existsSync(coursesDir)) {
    for (const entry of readdirSync(coursesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const parsed = CourseSchema.safeParse(
        JSON.parse(readFileSync(join(coursesDir, entry.name, "course.json"), "utf8")),
      );
      if (!parsed.success) continue;
      const v = parsed.data.style_version;
      references.set(v, [...(references.get(v) ?? []), entry.name]);
    }
  }

  const styles: StyleInfo[] = [];
  for (const entry of readdirSync(dir)) {
    if (!/^v\d+\.json$/u.test(entry)) continue;
    const doc = StyleVersionSchema.parse(JSON.parse(readFileSync(join(dir, entry), "utf8")));
    styles.push({
      version: doc.version,
      createdAt: doc.created_at,
      createdBy: doc.created_by,
      active: doc.version === active,
      referencedBy: references.get(doc.version) ?? [],
    });
  }
  return styles.sort((a, b) => a.version.localeCompare(b.version, "en", { numeric: true }));
}

export function activateStyle(root: string, version: string, by: string, now: string): void {
  const dir = stylesDir(root);
  if (!existsSync(join(dir, `${version}.json`))) {
    throw new Error(`스타일 버전이 없습니다: ${version}`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "active.json"),
    JSON.stringify(
      StyleActiveSchema.parse({
        schema_version: 1,
        active: version,
        activated_at: now,
        activated_by: by,
      }),
      null,
      2,
    ) + "\n",
  );
}

/** 참조하는 결과물이 없는 버전만 지울 수 있다 — 규칙 판정만 한다. */
export function canDeleteStyle(
  root: string,
  version: string,
): { ok: boolean; reason: string | null } {
  const styles = listStyles(root);
  const style = styles.find((s) => s.version === version);
  if (!style) return { ok: false, reason: "버전이 없습니다" };
  if (style.active) return { ok: false, reason: "활성 버전은 지울 수 없습니다" };
  if (style.referencedBy.length > 0) {
    return { ok: false, reason: `참조하는 교재가 있습니다: ${style.referencedBy.join(", ")}` };
  }
  return { ok: true, reason: null };
}
