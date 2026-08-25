"use client";
import { useEffect, useState } from "react";
import type { FigureInfo } from "../../../lib/course";

/**
 * 챕터 본문의 클라이언트 부품 (디자인 원본 section.dc.html).
 * 읽음 표시는 이 브라우저에만 저장한다 — 서버로 가는 학습 기록은 없다 (docs/07).
 */
export interface TocChapter {
  id: string;
  title: string;
  number: number;
}

/** 현재 챕터의 소제목 앵커 — 목차의 현재 챕터 아래에 들여써 그린다. */
export interface TocSub {
  anchor: string;
  label: string;
}

const readKey = (slug: string) => `oc-read:${slug}`;

function loadRead(slug: string): string[] {
  try {
    const raw = localStorage.getItem(readKey(slug));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** 현재 챕터를 읽음 목록에 더한다 — 본문에 도착한 것 자체가 기준. */
export function MarkRead({ slug, chapterId }: { slug: string; chapterId: string }) {
  useEffect(() => {
    try {
      const read = loadRead(slug);
      if (!read.includes(chapterId)) {
        localStorage.setItem(readKey(slug), JSON.stringify([...read, chapterId]));
        window.dispatchEvent(new CustomEvent("oc-read-changed"));
      }
    } catch {
      /* 저장이 막힌 브라우저에서는 표시만 없다 */
    }
  }, [slug, chapterId]);
  return null;
}

function TocList({
  slug,
  chapters,
  currentId,
  read,
  subAnchors = [],
}: {
  slug: string;
  chapters: TocChapter[];
  currentId: string;
  read: string[];
  subAnchors?: TocSub[];
}) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {chapters.map((c) => {
        const current = c.id === currentId;
        return (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <a
              href={`/${slug}/${c.id}/`}
              {...(current ? { "aria-current": "page" as const } : {})}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "9px 10px",
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: current ? 700 : 500,
                color: current ? "var(--tint-txt)" : "var(--txt)",
                background: current ? "var(--tint)" : "transparent",
              }}
            >
              <span
                style={{
                  flex: "none",
                  width: 26,
                  fontSize: 12,
                  fontWeight: 700,
                  color: current ? "var(--tint-txt)" : "var(--mut)",
                }}
              >
                {c.number}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.title}
              </span>
              {read.includes(c.id) ? (
                <svg
                  aria-label="읽음"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--tint-txt)"
                  strokeWidth="3"
                  style={{ flex: "none" }}
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : null}
            </a>
            {current
              ? subAnchors.map((s) => (
                  <a
                    key={s.anchor}
                    href={s.anchor}
                    style={{
                      display: "block",
                      padding: "5px 10px 5px 40px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--mut)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.label}
                  </a>
                ))
              : null}
          </div>
        );
      })}
    </nav>
  );
}

function Progress({ read, chapters }: { read: string[]; chapters: TocChapter[] }) {
  const done = chapters.filter((c) => read.includes(c.id)).length;
  return (
    <div style={{ background: "var(--bg2)", borderRadius: 14, padding: "14px 16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12.5,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          읽은 챕터
        </span>
        <span style={{ color: "var(--tint-txt)" }}>
          {done} / {chapters.length}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
        <div
          style={{
            width: `${chapters.length ? Math.round((done / chapters.length) * 100) : 0}%`,
            height: "100%",
            borderRadius: 999,
            background: "var(--blue)",
          }}
        />
      </div>
    </div>
  );
}

function useRead(slug: string): string[] {
  const [read, setRead] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setRead(loadRead(slug));
    update();
    window.addEventListener("oc-read-changed", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("oc-read-changed", update);
      window.removeEventListener("storage", update);
    };
  }, [slug]);
  return read;
}

/** 데스크톱 사이드 목차 — 좁은 화면에서는 CSS로 숨는다. */
export function DesktopToc({
  slug,
  chapters,
  currentId,
  subAnchors,
}: {
  slug: string;
  chapters: TocChapter[];
  currentId: string;
  subAnchors?: TocSub[];
}) {
  const read = useRead(slug);
  return (
    <aside
      aria-label="교재 목차"
      className="oc-toc-desktop"
      style={{
        position: "sticky",
        top: 81,
        maxHeight: "calc(100vh - 81px)",
        overflowY: "auto",
        overflowX: "hidden",
        padding: "28px 0 40px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <a
        href={`/${slug}/`}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--mut)",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <svg
          aria-hidden="true"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        교재 표지로
      </a>
      <Progress read={read} chapters={chapters} />
      <TocList
        slug={slug}
        chapters={chapters}
        currentId={currentId}
        read={read}
        {...(subAnchors ? { subAnchors } : {})}
      />
    </aside>
  );
}

/** 좁은 화면의 "전체 목차 보기" 버튼 + 하단 시트. */
export function MobileToc({
  slug,
  chapters,
  currentId,
  subAnchors,
}: {
  slug: string;
  chapters: TocChapter[];
  currentId: string;
  subAnchors?: TocSub[];
}) {
  const [open, setOpen] = useState(false);
  const read = useRead(slug);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="oc-toc-mobile-btn"
        style={{
          border: "1px solid var(--line)",
          background: "var(--card)",
          color: "var(--txt)",
          font: "inherit",
          fontSize: 14,
          fontWeight: 700,
          padding: 13,
          borderRadius: 14,
          cursor: "pointer",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <svg
          aria-hidden="true"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 6h18" />
          <path d="M3 12h18" />
          <path d="M3 18h18" />
        </svg>
        전체 목차 보기
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="교재 목차"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(10,12,20,.6)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "78vh",
              overflowY: "auto",
              background: "var(--card)",
              borderRadius: "20px 20px 0 0",
              padding: "16px 16px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              animation: "ocrise .18s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 14.5, fontWeight: 800 }}>교재 목차</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                style={{
                  marginLeft: "auto",
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: 0,
                  background: "transparent",
                  color: "var(--mut)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <Progress read={read} chapters={chapters} />
            <TocList
              slug={slug}
              chapters={chapters}
              currentId={currentId}
              read={read}
              {...(subAnchors ? { subAnchors } : {})}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 인포그래픽 프레임 — 캡션·대체 설명 토글·크게 보기 (docs/12 접근성 요건). */
export function InfographicFigure({ figure }: { figure: FigureInfo }) {
  const [altOpen, setAltOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const caption = `그림 ${figure.number}${figure.purpose ? ` — ${figure.purpose}` : ""}`;

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const image = figure.url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={figure.url}
      alt={figure.alt}
      style={{ display: "block", width: "100%", height: "auto" }}
    />
  ) : (
    <div
      role="img"
      aria-label={figure.alt}
      style={{
        aspectRatio: "16/9",
        display: "grid",
        placeItems: "center",
        background: "var(--bg2)",
        color: "var(--mut)",
        fontSize: 13.5,
        fontWeight: 600,
        padding: 20,
        textAlign: "center",
      }}
    >
      그림을 준비하고 있어요 — 아래 "설명 펼치기"로 내용을 읽을 수 있어요
    </div>
  );

  return (
    <figure
      style={{
        margin: 0,
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "var(--sh)",
      }}
    >
      {image}
      <figcaption
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderTop: "1px solid var(--line)",
          fontSize: 12.5,
          color: "var(--mut)",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>{caption}</span>
        <button
          type="button"
          onClick={() => setAltOpen((v) => !v)}
          aria-expanded={altOpen}
          style={{
            border: 0,
            background: "var(--chip)",
            color: "var(--chip-txt)",
            font: "inherit",
            fontSize: 12,
            fontWeight: 700,
            padding: "6px 11px",
            borderRadius: 8,
            cursor: "pointer",
            flex: "none",
          }}
        >
          설명 {altOpen ? "접기" : "펼치기"}
        </button>
        {figure.url ? (
          <button
            type="button"
            onClick={() => setZoom(true)}
            style={{
              border: 0,
              background: "var(--chip)",
              color: "var(--chip-txt)",
              font: "inherit",
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 11px",
              borderRadius: 8,
              cursor: "pointer",
              flex: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
              <path d="M11 8v6" />
              <path d="M8 11h6" />
            </svg>
            크게
          </button>
        ) : null}
      </figcaption>
      {altOpen ? (
        <p
          style={{
            margin: 0,
            padding: "12px 16px",
            borderTop: "1px solid var(--line)",
            background: "var(--bg2)",
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--txt)",
          }}
        >
          <strong>대체 설명:</strong> {figure.alt}
        </p>
      ) : null}
      {zoom && figure.url ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${caption} 크게 보기`}
          onClick={() => setZoom(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(10,12,20,.8)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            animation: "ocrise .18s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(920px,100%)",
              background: "var(--card)",
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{caption}</span>
              <button
                type="button"
                onClick={() => setZoom(false)}
                aria-label="닫기"
                style={{
                  marginLeft: "auto",
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: 0,
                  background: "transparent",
                  color: "var(--mut)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={figure.url}
              alt={figure.alt}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                maxHeight: "80vh",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      ) : null}
    </figure>
  );
}
