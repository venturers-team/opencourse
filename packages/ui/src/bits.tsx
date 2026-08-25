import type { CSSProperties, ReactNode } from "react";

/** 배지 — 난이도(tint)와 대상(chip) (디자인 원본의 카드 배지). */
export function Badge({
  kind = "chip",
  children,
}: {
  kind?: "tint" | "chip";
  children: ReactNode;
}) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: kind === "tint" ? 700 : 600,
        padding: "4px 10px",
        borderRadius: 999,
        background: kind === "tint" ? "var(--tint)" : "var(--chip)",
        color: kind === "tint" ? "var(--tint-txt)" : "var(--chip-txt)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "입문",
  intermediate: "중급",
  advanced: "심화",
};

/** 주 행동 링크 — "첫 챕터부터 시작하기" 류. */
export function CtaLink({
  href,
  children,
  block = false,
}: {
  href: string;
  children: ReactNode;
  block?: boolean;
}) {
  return (
    <a
      href={href}
      style={{
        display: block ? "flex" : "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: "var(--blue)",
        color: "#fff",
        fontSize: block ? 16 : 15,
        fontWeight: 700,
        padding: block ? 16 : "13px 24px",
        borderRadius: block ? 14 : 13,
        boxShadow: "var(--sh)",
      }}
    >
      {children}
      <svg
        aria-hidden="true"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </a>
  );
}

/** 빈 상태 — 발행 0건·필터 결과 0건 등 (디자인 원본의 점선 카드). */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "72px 20px",
        border: "1.5px dashed var(--line)",
        borderRadius: 20,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 52,
          height: 52,
          borderRadius: 18,
          background: "var(--chip)",
          color: "var(--mut)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 14px",
        }}
      >
        {icon ?? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        )}
      </span>
      <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>{title}</p>
      <p style={{ margin: action ? "0 0 20px" : 0, fontSize: 14, color: "var(--mut)" }}>
        {description}
      </p>
      {action}
    </div>
  );
}

/** 메타 항목 — 카드 하단의 아이콘+텍스트 짝. */
export function MetaItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {icon}
      {children}
    </span>
  );
}

export const cardStyle: CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 20,
  overflow: "hidden",
  color: "var(--txt)",
  boxShadow: "var(--sh)",
};
