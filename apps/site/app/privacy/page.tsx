import type { Metadata } from "next";
import { PageShell } from "@opencourse/ui";

export const metadata: Metadata = { title: "개인정보 처리방침" };

/**
 * 개인정보 처리방침 (docs/12, docs/07).
 * 아래 문안은 시안이다 — 실제 게시 전에 10단계에서 법률 검토와 함께 확정한다.
 */
const cell = { padding: "11px 14px", fontSize: 13.5 } as const;

export default function PrivacyPage() {
  return (
    <PageShell>
      <div
        style={{
          width: "min(720px,100%)",
          margin: "0 auto",
          padding: "48px 20px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 10px",
              fontSize: "clamp(24px,3.6vw,32px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
            }}
          >
            개인정보 처리방침
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--mut)", fontWeight: 500 }}>
            시행일 2026년 --월 --일 · 버전 v1 (시안)
          </p>
        </div>
        <div style={{ background: "var(--tint)", borderRadius: 14, padding: "14px 16px" }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, fontWeight: 500 }}>
            교재는 <strong>로그인 없이</strong> 읽을 수 있고, 그때는 개인정보를 수집하지 않아요.
            아래 내용은 <strong>AI 학습 도우미에 질문할 때만</strong> 해당돼요. 도우미를 쓰지 않아도
            수업이나 성적에 어떤 불이익도 없어요.
          </p>
        </div>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>1. 무엇을, 왜 수집하나요</h2>
          <div style={{ border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr" }}>
              <span style={{ ...cell, background: "var(--bg2)", fontWeight: 700 }}>항목</span>
              <span style={{ ...cell, background: "var(--bg2)", fontWeight: 700 }}>목적</span>
              <span style={{ ...cell, background: "var(--bg2)", fontWeight: 700 }}>보관</span>
              <span style={{ ...cell, borderTop: "1px solid var(--line)" }}>
                이름, 이메일 (Google 로그인)
              </span>
              <span style={{ ...cell, borderTop: "1px solid var(--line)", color: "var(--mut)" }}>
                사용자별 질문 횟수 관리
              </span>
              <span style={{ ...cell, borderTop: "1px solid var(--line)", color: "var(--mut)" }}>
                탈퇴 시 삭제
              </span>
              <span style={{ ...cell, borderTop: "1px solid var(--line)" }}>대화 내용</span>
              <span style={{ ...cell, borderTop: "1px solid var(--line)", color: "var(--mut)" }}>
                질문에 답하고 대화를 이어가기 위해
              </span>
              <span style={{ ...cell, borderTop: "1px solid var(--line)", color: "var(--mut)" }}>
                마지막 접속 후 3일
              </span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: "var(--mut)" }}>
            동의는 목적별로 받고, 동의한 시각과 문서 버전을 함께 기록해요.
          </p>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>2. 어디로 가나요 (국외 이전)</h2>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75 }}>
            계정 정보와 대화는 서울 리전의 서버(Supabase)에 저장돼요. 다만 질문 내용은 답을 만들기
            위해 해외의 AI 모델 제공자(OpenRouter와 그 하위 제공자)로 전송돼요. 데이터를 보관하지
            않는 제공자만 쓰도록 설정하고 있어요.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--mut)" }}>
            [국외 이전 상세 표 — 법률 검토와 함께 확정]
          </p>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>3. 이용자의 권리</h2>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75 }}>
            언제든 자신의 정보 열람·정정·삭제·처리정지를 요청할 수 있어요. 계정을 삭제하면 대화와
            사용 기록도 함께 지워져요.
          </p>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>4. 개인정보 보호책임자</h2>
          <div
            style={{
              background: "var(--bg2)",
              borderRadius: 14,
              padding: "14px 16px",
              fontSize: 14,
              lineHeight: 1.8,
            }}
          >
            <span style={{ display: "block" }}>
              <strong>성명</strong> [담당자 이름]
            </span>
            <span style={{ display: "block" }}>
              <strong>소속</strong> [연구실 이름]
            </span>
            <span style={{ display: "block" }}>
              <strong>연락처</strong> [이메일 주소]
            </span>
          </div>
        </section>
        <p
          style={{
            margin: 0,
            paddingTop: 8,
            borderTop: "1px solid var(--line)",
            fontSize: 12.5,
            color: "var(--mut)",
            lineHeight: 1.7,
          }}
        >
          이 문안은 시안이에요. 실제 게시 전에 수집 항목·국외 이전 근거·보호책임자 정보를 법률
          검토와 함께 확정해요.
        </p>
      </div>
    </PageShell>
  );
}
