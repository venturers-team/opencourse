import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Assistant, OverviewPlayer, PageShell } from "@opencourse/ui";
import { collect } from "../../../lib/content";
import { loadChapter, type ChapterData } from "../../../lib/course";
import { IconChevronLeft, IconChevronRight, IconClock } from "../../icons";
import { DesktopToc, InfographicFigure, MarkRead, MobileToc } from "./reader";

/**
 * 화면 3 — 챕터 본문 (docs/04·12, 디자인 원본 section.dc.html).
 * 본문 미디어는 media:<id> 참조만 허용 (docs/11 §1) — 여기서 media.json으로 해석한다.
 */
export function generateStaticParams() {
  const params = collect().published.flatMap(({ slug, course }) =>
    course.chapters.map((c) => ({ slug, chapter: c.id })),
  );
  /* 발행 0권 대비 자리 표시 — [slug]/page.tsx와 같은 이유로 404로 렌더된다. */
  return params.length > 0 ? params : [{ slug: "-", chapter: "-" }];
}

export function generateMetadata({
  params,
}: {
  params: { slug: string; chapter: string };
}): Metadata {
  const data = loadChapter(params.slug, params.chapter);
  return data
    ? {
        title: `${data.chapter.title} — ${data.page.course.title}`,
        description: data.chapter.summary,
      }
    : {};
}

const MEDIA_LINE = /^!\[[^\]]*\]\(media:([a-z0-9-]+)\)\s*$/;

type Segment = { kind: "md"; text: string } | { kind: "figure"; id: string };

function splitBody(body: string): Segment[] {
  const segments: Segment[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) segments.push({ kind: "md", text });
    buffer = [];
  };
  for (const line of body.split("\n")) {
    const m = MEDIA_LINE.exec(line.trim());
    if (m) {
      flush();
      segments.push({ kind: "figure", id: m[1] as string });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return segments;
}

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) => (url.startsWith("media:") ? url : defaultUrlTransform(url))}
      components={{
        table: (props) => (
          <div className="oc-tablewrap">
            <table {...props} />
          </div>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export default function ChapterPage({ params }: { params: { slug: string; chapter: string } }) {
  const data: ChapterData | null = loadChapter(params.slug, params.chapter);
  if (!data) notFound();
  const { page, chapter, number, total, prev, next, subs, video, figures } = data;
  const toc = page.course.chapters.map((c, i) => ({ id: c.id, title: c.title, number: i + 1 }));
  const subAnchors = subs.map((s, i) => ({
    anchor: `#s-${i + 1}`,
    label: `${number}.${i + 1} ${s.title}`,
  }));

  return (
    <PageShell contextLabel={page.course.title}>
      <MarkRead slug={page.slug} chapterId={chapter.id} />
      <div className="oc-reader">
        <DesktopToc
          slug={page.slug}
          chapters={toc}
          currentId={chapter.id}
          subAnchors={subAnchors}
        />
        <article
          style={{
            width: "min(720px,100%)",
            justifySelf: "center",
            padding: "36px 0 80px",
            display: "flex",
            flexDirection: "column",
            gap: 26,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 13,
                fontWeight: 800,
                color: "var(--tint-txt)",
                letterSpacing: "0.02em",
              }}
            >
              챕터 {number} / {total}
            </p>
            <h1
              style={{
                margin: "0 0 10px",
                fontSize: "clamp(24px,3.6vw,32px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.3,
              }}
            >
              {chapter.title}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                color: "var(--mut)",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 5,
                flexWrap: "wrap",
              }}
            >
              {IconClock()}예상 {chapter.estimated_minutes}분 · 소단원 {chapter.subchapters.length}
              개
              {prev ? (
                <>
                  {" "}
                  · 앞 챕터{" "}
                  <a href={`/${page.slug}/${prev.id}/`}>
                    {prev.number} {prev.title}
                  </a>
                  에서 이어져요
                </>
              ) : null}
            </p>
          </div>

          {video ? (
            <section aria-label="챕터 개요 영상">
              <OverviewPlayer
                label={`챕터 개요 — ${chapter.title}`}
                scenes={video.timeline.scenes}
                durationSec={video.durationSec}
                audioUrl={video.audioUrl}
              />
            </section>
          ) : null}

          {subs.map((sub, i) => (
            <section key={sub.title + i} id={`s-${i + 1}`}>
              <h2
                style={{
                  margin: "0 0 12px",
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                }}
              >
                <span style={{ color: "var(--tint-txt)" }}>
                  {number}.{i + 1}
                </span>
                {sub.title}
              </h2>
              <div className="oc-prose">
                {splitBody(sub.body).map((seg, j) =>
                  seg.kind === "md" ? (
                    <Markdown key={j} text={seg.text} />
                  ) : figures[seg.id] ? (
                    <InfographicFigure key={j} figure={figures[seg.id]!} />
                  ) : null,
                )}
              </div>
            </section>
          ))}

          <MobileToc
            slug={page.slug}
            chapters={toc}
            currentId={chapter.id}
            subAnchors={subAnchors}
          />

          <nav
            aria-label="이전 다음 챕터"
            style={{
              display: "grid",
              gridTemplateColumns: prev && next ? "1fr 1fr" : "1fr",
              gap: 12,
              marginTop: 6,
            }}
          >
            {prev ? (
              <a
                href={`/${page.slug}/${prev.id}/`}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: 16,
                  padding: "14px 16px",
                  color: "var(--txt)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--mut)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {IconChevronLeft(12)}이전 챕터
                </span>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>
                  {prev.number} {prev.title}
                </span>
              </a>
            ) : null}
            {next ? (
              <a
                href={`/${page.slug}/${next.id}/`}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: 16,
                  padding: "14px 16px",
                  color: "var(--txt)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  textAlign: "right",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--mut)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    justifyContent: "flex-end",
                  }}
                >
                  다음 챕터{IconChevronRight(12)}
                </span>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>
                  {next.number} {next.title}
                </span>
              </a>
            ) : (
              <a
                href={`/${page.slug}/`}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: 16,
                  padding: "14px 16px",
                  color: "var(--txt)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  textAlign: "right",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--mut)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    justifyContent: "flex-end",
                  }}
                >
                  마지막 챕터예요{IconChevronRight(12)}
                </span>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>교재 표지로 돌아가기</span>
              </a>
            )}
          </nav>
        </article>
      </div>
      <Assistant contextLabel={`챕터 ${number} ${chapter.title}`} />
    </PageShell>
  );
}
