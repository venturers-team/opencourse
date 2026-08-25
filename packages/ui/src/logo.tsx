/** 오픈코스 로고 — 정본은 Claude Design 프로젝트 (책+얼굴). */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M3 6.5C6 4.8 9 4.8 12 6.5c3-1.7 6-1.7 9 0v11c-3-1.7-6-1.7-9 0-3-1.7-6-1.7-9 0z"
        fill="var(--blue)"
      />
      <circle cx="9" cy="11.6" r="1" fill="var(--bg)" />
      <circle cx="15" cy="11.6" r="1" fill="var(--bg)" />
      <path
        d="M10.6 13.9c.9.8 1.9.8 2.8 0"
        stroke="var(--bg)"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="6.6" cy="13.4" r="1" fill="#ff9db1" opacity=".85" />
      <circle cx="17.4" cy="13.4" r="1" fill="#ff9db1" opacity=".85" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span
      style={{
        fontSize: 23,
        fontWeight: 800,
        letterSpacing: "-0.02em",
        color: "var(--txt)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <LogoMark />
      <span>
        OPEN<span style={{ color: "var(--blue)" }}>COURSE</span>
      </span>
    </span>
  );
}
