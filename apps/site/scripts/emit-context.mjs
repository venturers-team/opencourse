/**
 * 챗봇 문맥 번들 (docs/08 7단계) — 발행 교재의 본문을 공개 산출물에 담는다.
 * 10단계 챗봇이 읽는 유일한 자료: out/context/<slug>/<chapter>.json + index.json.
 * 수집은 collectPublishable — 초안은 여기 없고, 따라서 챗봇이 알 수도 없다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectPublishable } from "@opencourse/pipeline";

const siteDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(siteDir, "out");
if (!existsSync(outDir)) {
  console.log("문맥 번들: out/ 없음 — 미리보기 빌드이므로 건너뜁니다");
  process.exit(0);
}

function contentRoot() {
  if (process.env.OPENCOURSE_ROOT) return process.env.OPENCOURSE_ROOT;
  let dir = siteDir;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function stripFrontmatter(raw) {
  if (!raw.startsWith("---")) return raw.trim();
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return raw.trim();
  return raw.slice(raw.indexOf("\n", end + 1) + 1).trim();
}

const { published } = collectPublishable(contentRoot());
const index = [];
let files = 0;

for (const { slug, dir, course } of published) {
  const chapterIds = [];
  for (const chapter of course.chapters) {
    const subs = chapter.subchapters.map((s) => ({
      title: s.title,
      body: stripFrontmatter(readFileSync(join(dir, "chapters", chapter.id, s.file), "utf8")),
    }));
    const payload = {
      course_slug: slug,
      course_title: course.title,
      audience: course.audience,
      chapter_id: chapter.id,
      chapter_title: chapter.title,
      chapter_summary: chapter.summary,
      subchapters: subs,
    };
    const target = join(outDir, "context", slug, `${chapter.id}.json`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(payload, null, 2) + "\n");
    files += 1;
    chapterIds.push(chapter.id);
  }
  index.push({ slug, title: course.title, chapters: chapterIds });
}

mkdirSync(join(outDir, "context"), { recursive: true });
writeFileSync(
  join(outDir, "context", "index.json"),
  JSON.stringify({ schema_version: 1, courses: index }, null, 2) + "\n",
);
console.log(`문맥 번들: 교재 ${index.length}권, 챕터 파일 ${files}건`);
