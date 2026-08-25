import type { CSSProperties } from "react";

/** 본문 곳곳에서 반복되는 작은 스트로크 아이콘 (디자인 원본의 인라인 SVG). */
function stroke(size: number, width: number, style: CSSProperties | undefined, paths: string[]) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      {...(style ? { style } : {})}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const IconBook = (size = 13, style?: CSSProperties) =>
  stroke(size, 2, style, [
    "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z",
    "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  ]);

export const IconClock = (size = 13, style?: CSSProperties) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    {...(style ? { style } : {})}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

export const IconCalendar = (size = 13, style?: CSSProperties) =>
  stroke(size, 2, style, [
    "M8 2v4",
    "M16 2v4",
    "M3 10h18",
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  ]);

export const IconChevronRight = (size = 16, style?: CSSProperties) =>
  stroke(size, 2.5, style, ["m9 18 6-6-6-6"]);

export const IconChevronLeft = (size = 14, style?: CSSProperties) =>
  stroke(size, 2.5, style, ["m15 18-6-6 6-6"]);

export const IconCheck = (size = 17, style?: CSSProperties) =>
  stroke(size, 2.5, style, ["M20 6 9 17l-5-5"]);

export const IconExternal = (size = 12, style?: CSSProperties) =>
  stroke(size, 2, style, [
    "M15 3h6v6",
    "M10 14 21 3",
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  ]);

export const IconChevronDown = (size = 15, style?: CSSProperties) =>
  stroke(size, 2.5, style, ["m6 9 6 6 6-6"]);

export const IconTarget = (size = 14, style?: CSSProperties) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--tint-txt)"
    strokeWidth="2"
    {...(style ? { style } : {})}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);
