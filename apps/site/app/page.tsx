import { PageShell, EmptyState } from "@opencourse/ui";
import { collect, isPreview } from "../lib/content";
import { CourseExplorer, type CourseCardData } from "./explorer";

/** 화면 1 — 발행 교재 목록 (docs/04·12). 검색·필터·정렬은 클라이언트 사이드. */
export default function HomePage() {
  const { published, excluded } = collect();
  const preview = isPreview();
  const drafts = preview ? excluded.filter((e) => e.status === "draft") : [];

  const cards: CourseCardData[] = published.map(({ slug, course }) => ({
    slug,
    title: course.title,
    summary: course.summary,
    audience: course.audience,
    difficulty: course.difficulty,
    chapters: course.chapters.length,
    hours: Math.max(1, Math.round(course.estimated_minutes / 60)),
    publishedAt: course.published_at?.slice(0, 10) ?? "",
    topic: course.topic,
  }));

  return (
    <PageShell>
      {preview ? (
        <p
          style={{
            margin: 0,
            padding: "8px 20px",
            background: "var(--warn-bg)",
            color: "var(--warn-txt)",
            fontSize: 13,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          미리보기 모드 — 초안 {drafts.length}권이 함께 보입니다. 공개 산출물에는 실리지 않습니다.
        </p>
      ) : null}
      <section style={{ background: "var(--bg2)" }}>
        <div style={{ width: "min(1140px,100%)", margin: "0 auto", padding: "64px 20px 48px" }}>
          <h1
            style={{
              margin: "0 0 12px",
              fontSize: "clamp(28px,4.5vw,42px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.25,
            }}
          >
            처음 배우는 과목,
            <br />
            오늘 바로 시작해요
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              color: "var(--mut)",
              fontWeight: 500,
              lineHeight: 1.6,
            }}
          >
            이번 학기 눈높이에 맞춘 무료 웹 교재 — 로그인 없이 읽어요.
          </p>
        </div>
      </section>
      <section style={{ width: "min(1140px,100%)", margin: "0 auto", padding: "28px 20px 72px" }}>
        {cards.length === 0 && drafts.length === 0 ? (
          <EmptyState
            title="아직 발행된 교재가 없어요"
            description="검수를 통과한 교재가 준비되는 대로 이곳에 올라와요."
          />
        ) : (
          <CourseExplorer courses={cards} draftSlugs={drafts.map((d) => d.slug)} />
        )}
      </section>
    </PageShell>
  );
}
