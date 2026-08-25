import { PageShell } from "@opencourse/ui";

/**
 * 접근 불가 안내 (docs/04 화면 4, docs/12).
 * 없는 주소·숨김·초안이 구분되지 않는 하나의 화면 — 정적 출력에서는 셋 다
 * 파일이 존재하지 않으므로 같은 404가 나오는 것이 구조적으로 보장된다.
 */
export default function NotFound() {
  return (
    <PageShell>
      <div
        style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "48px 20px" }}
      >
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            maxWidth: 420,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              background: "var(--tint)",
              color: "var(--tint-txt)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m16.2 7.8-2 6.3-6.4 2.1 2-6.3z" />
            </svg>
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(22px,3.5vw,28px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            여기엔 교재가 없어요
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.7,
              color: "var(--mut)",
              fontWeight: 500,
            }}
          >
            주소가 잘못됐거나, 아직 준비 중인 교재예요.
            <br />
            준비가 끝난 교재는 목록에 올라와요.
          </p>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--blue)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              padding: "13px 24px",
              borderRadius: 13,
              boxShadow: "var(--sh)",
              marginTop: 6,
            }}
          >
            교재 목록 보러 가기
            <svg
              aria-hidden="true"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </PageShell>
  );
}
