import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CourseSchema,
  MediaManifestSchema,
  SourceMapSchema,
  TimelineSchema,
  type Chapter,
  type Course,
  type MediaManifest,
  type Timeline,
} from "@opencourse/content";
import { collect, contentRoot, isPreview } from "./content";

/**
 * 교재·챕터 페이지가 읽는 데이터. 공개 빌드의 목록은 언제나 collectPublishable을
 * 거친 것만 — 초안은 미리보기 모드(OPENCOURSE_PREVIEW=1)의 개발 서버에서만 열린다.
 * 정적 export에서는 generateStaticParams가 발행본만 돌려주므로 초안 파일 자체가 없다.
 */
export interface CoursePage {
  slug: string;
  dir: string;
  course: Course;
  draft: boolean;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function listCoursePages(): CoursePage[] {
  const { published, excluded } = collect();
  const pages: CoursePage[] = published.map(({ slug, dir, course }) => ({
    slug,
    dir,
    course,
    draft: false,
  }));
  if (isPreview()) {
    for (const e of excluded) {
      if (e.status !== "draft") continue;
      const dir = join(contentRoot(), "content", "courses", e.slug);
      const parsed = CourseSchema.safeParse(readJson(join(dir, "course.json")));
      if (parsed.success) pages.push({ slug: e.slug, dir, course: parsed.data, draft: true });
    }
  }
  return pages;
}

export function getCoursePage(slug: string): CoursePage | null {
  return listCoursePages().find((p) => p.slug === slug) ?? null;
}

/** 미디어 세 파일(media.json·timeline.json·captions.vtt)을 담은 폴더를 읽는다. */
export interface VideoBundle {
  media: MediaManifest;
  timeline: Timeline;
  audioUrl: string | null;
  durationSec: number;
}

function loadManifest(dir: string): MediaManifest | null {
  const manifestPath = join(dir, "media.json");
  if (!existsSync(manifestPath)) return null;
  const media = MediaManifestSchema.safeParse(readJson(manifestPath));
  return media.success ? media.data : null;
}

function loadVideoBundle(
  dir: string,
  media: MediaManifest | null = loadManifest(dir),
): VideoBundle | null {
  if (!media?.video) return null;
  const timelinePath = join(dir, media.video.timeline_file);
  if (!existsSync(timelinePath)) return null;
  const timeline = TimelineSchema.safeParse(readJson(timelinePath));
  if (!timeline.success) return null;
  const audioItem = media.items.find(
    (i) => i.id === media.video?.audio_item && i.status === "active",
  );
  return {
    media,
    timeline: timeline.data,
    audioUrl: audioItem?.url ?? null,
    durationSec: media.video.duration_sec,
  };
}

/** 교재 단위 개요 영상 (docs/11 §2 overview/ — 선택). */
export function loadCourseOverview(page: CoursePage): VideoBundle | null {
  return loadVideoBundle(join(page.dir, "overview"));
}

export interface SourceEntry {
  title: string;
  publisher: string;
  url: string;
  license: string;
}

/** 출처 아코디언 데이터 (review/source-map.json). */
export function loadSources(page: CoursePage): SourceEntry[] {
  const path = join(page.dir, "review", "source-map.json");
  if (!existsSync(path)) return [];
  const parsed = SourceMapSchema.safeParse(readJson(path));
  if (!parsed.success) return [];
  return parsed.data.sources.map((s) => ({
    title: s.title,
    publisher: s.publisher,
    url: s.url,
    license: s.license,
  }));
}

export interface SubchapterContent {
  title: string;
  body: string;
}

export interface FigureInfo {
  id: string;
  url: string | null;
  alt: string;
  purpose: string | null;
  number: number;
}

export interface ChapterData {
  page: CoursePage;
  chapter: Chapter;
  number: number;
  total: number;
  prev: { id: string; title: string; number: number } | null;
  next: { id: string; title: string; number: number } | null;
  subs: SubchapterContent[];
  video: VideoBundle | null;
  /** media:<id> 참조 해석용 — 그림 번호는 본문 등장 순서. */
  figures: Record<string, FigureInfo>;
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw.trim();
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return raw.trim();
  return raw.slice(raw.indexOf("\n", end + 1) + 1).trim();
}

const MEDIA_REF = /!\[[^\]]*\]\(media:([a-z0-9-]+)\)/g;

export function loadChapter(slug: string, chapterId: string): ChapterData | null {
  const page = getCoursePage(slug);
  if (!page) return null;
  const idx = page.course.chapters.findIndex((c) => c.id === chapterId);
  if (idx < 0) return null;
  const chapter = page.course.chapters[idx] as Chapter;
  const chapterDir = join(page.dir, "chapters", chapter.id);

  const subs: SubchapterContent[] = chapter.subchapters.map((s) => ({
    title: s.title,
    body: stripFrontmatter(readFileSync(join(chapterDir, s.file), "utf8")),
  }));

  const manifest = loadManifest(chapterDir);
  const video = loadVideoBundle(chapterDir, manifest);

  const figures: Record<string, FigureInfo> = {};
  let n = 0;
  for (const sub of subs) {
    for (const m of sub.body.matchAll(MEDIA_REF)) {
      const id = m[1] as string;
      if (figures[id]) continue;
      const item = manifest?.items.find((i) => i.id === id && i.status === "active");
      if (!item || item.kind !== "infographic") continue;
      n += 1;
      figures[id] = {
        id,
        url: item.url,
        alt: item.alt ?? "",
        purpose: item.purpose,
        number: n,
      };
    }
  }

  const neighbor = (i: number) => {
    const c = page.course.chapters[i];
    return c ? { id: c.id, title: c.title, number: i + 1 } : null;
  };

  return {
    page,
    chapter,
    number: idx + 1,
    total: page.course.chapters.length,
    prev: neighbor(idx - 1),
    next: neighbor(idx + 1),
    subs,
    video,
    figures,
  };
}
