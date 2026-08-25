"use client";
import { useMemo, useState } from "react";
import { Badge, DIFFICULTY_LABELS, EmptyState, MetaItem, cardStyle } from "@opencourse/ui";

/**
 * 목록 화면의 검색·필터·정렬 (docs/12 — 2026-08-24 결정으로 만들기로 함).
 * 정적 사이트이므로 전부 클라이언트 사이드다.
 */
export interface CourseCardData {
  slug: string;
  title: string;
  summary: string;
  audience: string;
  difficulty: string;
  chapters: number;
  hours: number;
  publishedAt: string;
  topic: string;
}

const THUMBS = [
  "linear-gradient(135deg,#3b6ef5,#8ab2ff)",
  "linear-gradient(135deg,#6a5cff,#a99bff)",
  "linear-gradient(135deg,#12b3a8,#7fd8cf)",
  "linear-gradient(135deg,#f08c3c,#ffbe7a)",
  "linear-gradient(135deg,#2e9e5b,#8fd6a8)",
  "linear-gradient(135deg,#5b6b8c,#9aa8c4)",
];

const chipBase = {
  font: "inherit",
  fontSize: 14,
  fontWeight: 600,
  border: 0,
  borderRadius: 999,
  padding: "10px 16px",
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
  flex: "none" as const,
};

export function CourseExplorer({
  courses,
  draftSlugs = [],
}: {
  courses: CourseCardData[];
  draftSlugs?: string[];
}) {
  const [q, setQ] = useState("");
  const [aud, setAud] = useState("전체");
  const [lv, setLv] = useState("전체 난이도");
  const [sort, setSort] = useState<"latest" | "title">("latest");

  const audiences = useMemo(() => ["전체", ...new Set(courses.map((c) => c.audience))], [courses]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return courses
      .filter(
        (c) =>
          (aud === "전체" || c.audience === aud) &&
          (lv === "전체 난이도" || DIFFICULTY_LABELS[c.difficulty] === lv) &&
          (!needle || `${c.title} ${c.summary} ${c.topic}`.toLowerCase().includes(needle)),
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title, "ko")
          : b.publishedAt.localeCompare(a.publishedAt),
      );
  }, [courses, q, aud, lv, sort]);

  const reset = () => {
    setQ("");
    setAud("전체");
    setLv("전체 난이도");
    setSort("latest");
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 10,
          maxWidth: 560,
          background: "var(--card)",
          border: "1.5px solid var(--line)",
          borderRadius: 16,
          padding: "6px 6px 6px 18px",
          boxShadow: "var(--sh)",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: "var(--mut)", flex: "none" }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          placeholder="배우고 싶은 주제 검색"
          aria-label="교재 검색"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            background: "transparent",
            font: "inherit",
            fontSize: 15,
            color: "var(--txt)",
            minWidth: 0,
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div
          role="group"
          aria-label="대상 학습자 필터"
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          {audiences.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setAud(label)}
              style={{
                ...chipBase,
                background: aud === label ? "var(--txt)" : "var(--chip)",
                color: aud === label ? "var(--bg)" : "var(--chip-txt)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <label
          style={{
            fontSize: 13,
            color: "var(--mut)",
            fontWeight: 600,
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          난이도
          <select
            value={lv}
            onChange={(e) => setLv(e.target.value)}
            style={{
              font: "inherit",
              fontSize: 14,
              fontWeight: 600,
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "8px 10px",
              background: "var(--card)",
              color: "var(--txt)",
            }}
          >
            {["전체 난이도", "입문", "중급", "심화"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label
          style={{
            fontSize: 13,
            color: "var(--mut)",
            fontWeight: 600,
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          정렬
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "latest" | "title")}
            style={{
              font: "inherit",
              fontSize: 14,
              fontWeight: 600,
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "8px 10px",
              background: "var(--card)",
              color: "var(--txt)",
            }}
          >
            <option value="latest">최신 발행순</option>
            <option value="title">제목순</option>
          </select>
        </label>
        <button
          type="button"
          onClick={reset}
          style={{
            font: "inherit",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--mut)",
            background: "transparent",
            border: 0,
            padding: "10px 6px",
            cursor: "pointer",
          }}
        >
          초기화
        </button>
      </div>

      <p
        aria-live="polite"
        style={{ margin: "0 0 16px", fontSize: 13, color: "var(--mut)", fontWeight: 500 }}
      >
        교재 {filtered.length}권
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m13.5 8.5-5 5" />
              <path d="m8.5 8.5 5 5" />
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          }
          title="조건에 맞는 교재가 없어요"
          description="검색어나 필터를 바꿔보세요."
          action={
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                background: "var(--tint)",
                color: "var(--tint-txt)",
                font: "inherit",
                fontSize: 14,
                fontWeight: 700,
                padding: "11px 22px",
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              조건 초기화
            </button>
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))",
            gap: "24px 20px",
          }}
        >
          {filtered.map((c, i) => (
            <a
              key={c.slug}
              href={`/${c.slug}/`}
              aria-label={c.title}
              style={{ ...cardStyle, display: "flex", flexDirection: "column" }}
            >
              <div
                style={{
                  height: 136,
                  background: THUMBS[i % THUMBS.length],
                  display: "flex",
                  alignItems: "flex-end",
                  padding: "14px 16px",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".12em",
                    color: "rgba(255,255,255,.95)",
                    textTransform: "uppercase",
                  }}
                >
                  {c.topic}
                </span>
              </div>
              <div
                style={{
                  padding: "18px 18px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  flex: 1,
                }}
              >
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge kind="tint">{DIFFICULTY_LABELS[c.difficulty] ?? c.difficulty}</Badge>
                  <Badge>{c.audience}</Badge>
                  {draftSlugs.includes(c.slug) ? <Badge>초안</Badge> : null}
                </div>
                <h3
                  style={{
                    margin: "2px 0 0",
                    fontSize: 17,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.35,
                  }}
                >
                  {c.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    color: "var(--mut)",
                    lineHeight: 1.55,
                    flex: 1,
                  }}
                >
                  {c.summary}
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 12px",
                    fontSize: 12.5,
                    color: "var(--mut)",
                    fontWeight: 500,
                    borderTop: "1px solid var(--line)",
                    paddingTop: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  <MetaItem
                    icon={
                      <svg
                        aria-hidden="true"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                    }
                  >
                    챕터 {c.chapters}
                  </MetaItem>
                  <MetaItem
                    icon={
                      <svg
                        aria-hidden="true"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    }
                  >
                    약 {c.hours}시간
                  </MetaItem>
                  {c.publishedAt ? (
                    <span style={{ marginLeft: "auto" }}>
                      <MetaItem
                        icon={
                          <svg
                            aria-hidden="true"
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M8 2v4" />
                            <path d="M16 2v4" />
                            <rect width="18" height="18" x="3" y="4" rx="2" />
                            <path d="M3 10h18" />
                          </svg>
                        }
                      >
                        {c.publishedAt} 발행
                      </MetaItem>
                    </span>
                  ) : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
