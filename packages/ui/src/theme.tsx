"use client";
import { useEffect, useState } from "react";

/**
 * 라이트·다크 테마 — 정본은 디자인 프로젝트의 [data-theme] 토큰.
 * 초기값: localStorage → 시스템 선호. html[data-theme]에 박는다.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("oc-theme");if(!t){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => setTheme(currentTheme()), []);
  const toggle = () => {
    const next = currentTheme() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("oc-theme", next);
    } catch {
      /* 저장 실패는 무시 — 세션 안에서는 유지된다 */
    }
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="테마 전환"
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        border: "1px solid var(--line)",
        background: "var(--card)",
        color: "var(--mut)",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        flex: "none",
      }}
    >
      {theme === "light" ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
