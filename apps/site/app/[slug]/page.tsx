import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, CtaLink, DIFFICULTY_LABELS, OverviewPlayer, PageShell } from "@opencourse/ui";
import { collect } from "../../lib/content";
import { getCoursePage, loadCourseOverview, loadSources } from "../../lib/course";
import {
  IconBook,
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconExternal,
  IconTarget,
} from "../icons";

/**
 * 화면 2 — 교재 상세 (docs/04·12, 디자인 원본 course.dc.html).
 * 정적 export에서는 여기 열거된 slug만 파일이 되므로, 초안은 페이지 자체가 없다.
 */
export function generateStaticParams() {
  const params = collect().published.map(({ slug }) => ({ slug }));
  /* 발행 0권이어도 export가 성립해야 한다 — Next는 빈 목록을 거부하므로
     404로 렌더되는 자리 표시 하나를 둔다. "-"는 로마자 슬러그 규칙상 나올 수 없다. */
  return params.length > 0 ? params : [{ slug: "-" }];
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = getCoursePage(params.slug);
  return page ? { title: page.course.title, description: page.course.summary } : {};
}

export default function CoursePage({ params }: { params: { slug: string } }) {
  const page = getCoursePage(params.slug);
  if (!page) notFound();
  const { course } = page;
  const overview = loadCourseOverview(page);
  const sources = loadSources(page);
  const subCount = course.chapters.reduce((n, c) => n + c.subchapters.length, 0);
  const firstChapter = course.chapters[0];

  return (
    <PageShell contextLabel={course.title}>
      <section style={{ background: "var(--bg2)" }}>
        <div style={{ width: "min(880px,100%)", margin: "0 auto", padding: "40px 20px 36px" }}>
          <a
            href="/"
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--mut)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginBottom: 18,
            }}
          >
            {IconChevronLeft()}교재 목록
          </a>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <Badge kind="tint">{DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty}</Badge>
            <Badge>{course.audience}</Badge>
            {page.draft ? <Badge>초안 — 미리보기</Badge> : null}
          </div>
          <h1
            style={{
              margin: "0 0 10px",
              fontSize: "clamp(26px,4vw,36px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.3,
            }}
          >
            {course.title}
          </h1>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: 15.5,
              color: "var(--mut)",
              fontWeight: 500,
              lineHeight: 1.6,
              maxWidth: "38em",
            }}
          >
            {course.summary}
          </p>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 16,
              padding: "18px 20px",
              boxShadow: "var(--sh)",
              maxWidth: 560,
            }}
          >
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--mut)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {IconTarget()}이 교재를 마치면
            </p>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {course.learning_outcomes.map((g) => (
                <li
                  key={g}
                  style={{
                    display: "flex",
                    gap: 9,
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    fontWeight: 500,
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--blue)"
                    strokeWidth="2.5"
                    style={{ flex: "none", marginTop: 2 }}
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 14px",
              marginTop: 20,
              fontSize: 13,
              color: "var(--mut)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {IconBook()}챕터 {course.chapters.length} · 소단원 {subCount}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {IconClock()}예상 약 {Math.max(1, Math.round(course.estimated_minutes / 60))}시간
            </span>
            {course.published_at ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {IconCalendar()}
                {course.published_at.slice(0, 10).replaceAll("-", ".")} 발행
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div
        style={{
          width: "min(880px,100%)",
          margin: "0 auto",
          padding: "32px 20px 72px",
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}
      >
        {overview ? (
          <section aria-label="개요 영상">
            <OverviewPlayer
              label="개요 — 이 교재는 이렇게 진행돼요"
              scenes={overview.timeline.scenes}
              durationSec={overview.durationSec}
              audioUrl={overview.audioUrl}
            />
          </section>
        ) : null}

        {firstChapter ? (
          <CtaLink href={`/${page.slug}/${firstChapter.id}/`} block>
            첫 챕터부터 시작하기
          </CtaLink>
        ) : null}

        <section aria-label="챕터 목차">
          <h2
            style={{ margin: "0 0 16px", fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}
          >
            챕터 목차
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {course.chapters.map((c, i) => (
              <a
                key={c.id}
                href={`/${page.slug}/${c.id}/`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: 16,
                  padding: "16px 18px",
                  color: "var(--txt)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: "var(--tint)",
                    color: "var(--tint-txt)",
                    fontSize: 15,
                    fontWeight: 800,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 15.5,
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {c.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      color: "var(--mut)",
                      marginTop: 3,
                      lineHeight: 1.5,
                    }}
                  >
                    {c.summary}
                  </span>
                </span>
                <span
                  style={{
                    flex: "none",
                    fontSize: 12.5,
                    color: "var(--mut)",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {IconClock(12)}
                  {c.estimated_minutes}분
                </span>
                {IconChevronRight(16, { flex: "none", color: "var(--mut)" })}
              </a>
            ))}
          </div>
        </section>

        {sources.length > 0 ? (
          <section aria-label="출처와 참고 자료">
            <h2
              style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}
            >
              출처와 참고 자료
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--mut)" }}>
              이 교재가 참고한 자료예요. 링크에서 원문을 볼 수 있어요.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sources.map((s) => (
                <details
                  key={s.url}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--line)",
                    borderRadius: 14,
                    overflow: "hidden",
                  }}
                >
                  <summary
                    style={{
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "15px 18px",
                      cursor: "pointer",
                      fontSize: 14.5,
                      fontWeight: 700,
                    }}
                  >
                    {IconChevronDown(15, { color: "var(--mut)", flex: "none" })}
                    {s.title}
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 12.5,
                        color: "var(--mut)",
                        fontWeight: 500,
                      }}
                    >
                      {s.publisher}
                    </span>
                  </summary>
                  <div
                    style={{
                      padding: "0 18px 16px 43px",
                      fontSize: 13.5,
                      color: "var(--mut)",
                      lineHeight: 1.6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <span>사용 조건: {s.license}</span>
                    <a
                      href={s.url}
                      rel="noopener noreferrer"
                      target="_blank"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        width: "fit-content",
                      }}
                    >
                      {s.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      {IconExternal()}
                    </a>
                  </div>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
