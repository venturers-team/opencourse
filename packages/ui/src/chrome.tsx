import type { ReactNode } from "react";
import { Wordmark } from "./logo";
import { ThemeToggle } from "./theme";

/** 상단 헤더 — 로고(홈 링크)와 최소 요소만 (docs/12 전역 구조). */
export function SiteHeader({
  contextLabel,
  sticky = true,
  maxWidth = 1140,
}: {
  contextLabel?: string;
  sticky?: boolean;
  maxWidth?: number;
}) {
  return (
    <header
      style={{
        ...(sticky
          ? { position: "sticky" as const, top: 0, zIndex: 10, backdropFilter: "blur(12px)" }
          : {}),
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          width: `min(${maxWidth}px, 100%)`,
          margin: "0 auto",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <a href="/" style={{ flex: "none" }} aria-label="OPENCOURSE 홈">
          <Wordmark />
        </a>
        {contextLabel ? (
          <span
            style={{
              fontSize: 13,
              color: "var(--mut)",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {contextLabel}
          </span>
        ) : null}
        <span style={{ marginLeft: "auto" }} />
        <ThemeToggle />
      </div>
    </header>
  );
}

/** 하단 푸터 — 처리방침·저장소 링크와 저작권 표기 (docs/12). */
export function SiteFooter({
  repoUrl = "https://github.com",
  maxWidth = 1140,
}: {
  repoUrl?: string;
  maxWidth?: number;
}) {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
      <div
        style={{
          width: `min(${maxWidth}px, 100%)`,
          margin: "0 auto",
          padding: "24px 20px",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
          fontSize: 13,
          color: "var(--mut)",
        }}
      >
        <span>© 2026 오픈코스</span>
        <span style={{ display: "flex", gap: 20 }}>
          <a href="/privacy" style={{ color: "var(--mut)" }}>
            개인정보 처리방침
          </a>
          <a href={repoUrl} style={{ color: "var(--mut)" }}>
            GitHub 저장소
          </a>
        </span>
      </div>
    </footer>
  );
}

/** 페이지 셸 — 헤더·본문·푸터 세로 배치. */
export function PageShell({
  children,
  contextLabel,
  maxWidth,
}: {
  children: ReactNode;
  contextLabel?: string;
  maxWidth?: number;
}) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader
        {...(contextLabel !== undefined ? { contextLabel } : {})}
        {...(maxWidth !== undefined ? { maxWidth } : {})}
      />
      <main style={{ flex: 1 }}>{children}</main>
      <SiteFooter {...(maxWidth !== undefined ? { maxWidth } : {})} />
    </div>
  );
}
