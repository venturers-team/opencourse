"use client";
import { useState } from "react";
import {
  Assistant,
  Badge,
  CtaLink,
  EmptyState,
  OverviewPlayer,
  PageShell,
  type AssistantForcedState,
  type PlayerState,
} from "@opencourse/ui";

/**
 * 디자인 시스템 인벤토리 — docs/12의 컴포넌트 목록을 빠짐없이 렌더한다.
 * 사용자가 이 페이지를 보고 Claude Design 원본과 어긋나지 않는지 승인한다 (7단계 STOP).
 */
const TOKENS = [
  ["--bg", "바탕"],
  ["--bg2", "옅은 바탕"],
  ["--card", "카드"],
  ["--line", "선"],
  ["--txt", "본문"],
  ["--mut", "보조"],
  ["--blue", "파랑(주 색)"],
  ["--tint", "옅은 파랑"],
  ["--chip", "칩"],
  ["--warn-bg", "경고 배경"],
  ["--err-bg", "오류 배경"],
] as const;

const DEMO_SCENES = [
  {
    index: 0,
    start_sec: 0,
    duration_sec: 5,
    narration: "이 챕터의 개요를 소개할게요.",
    visual: { type: "title", text: "위젯 트리 이해하기" },
  },
  {
    index: 1,
    start_sec: 5,
    duration_sec: 5,
    narration: "모든 것이 위젯이고, 위젯은 트리로 쌓여요.",
    visual: { type: "bullets", items: ["모든 것이 위젯", "트리로 쌓인다", "코드가 화면이 된다"] },
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          borderBottom: "1px solid var(--line)",
          paddingBottom: 8,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function StyleGuide() {
  const [playerState, setPlayerState] = useState<PlayerState | "auto">("auto");
  const [assistantState, setAssistantState] = useState<AssistantForcedState | "auto">("ready");

  return (
    <PageShell contextLabel="스타일 가이드 — 미리보기 전용">
      <div
        style={{
          width: "min(880px,100%)",
          margin: "0 auto",
          padding: "36px 20px 96px",
          display: "flex",
          flexDirection: "column",
          gap: 40,
        }}
      >
        <div>
          <h1
            style={{ margin: "0 0 8px", fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}
          >
            디자인 시스템
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "var(--mut)" }}>
            정본은 Claude Design 프로젝트다. 이 페이지는 추출된 토큰·컴포넌트 전수를 두 테마로
            렌더한다 — 우상단 토글로 확인.
          </p>
        </div>

        <Section title="색 토큰">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
              gap: 10,
            }}
          >
            {TOKENS.map(([token, label]) => (
              <div
                key={token}
                style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}
              >
                <div style={{ height: 44, background: `var(${token})` }} />
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
                  <code style={{ fontSize: 11, color: "var(--mut)" }}>{token}</code>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="타이포그래피">
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em" }}>
            제목 1 — Pretendard 800
          </h1>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>제목 2 — 챕터 목차</h2>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.75, maxWidth: "40em" }}>
            본문 16px/1.75 — 처음 배우는 사람이 읽는 글이므로 줄 길이는 65자 안팎을 지킨다.{" "}
            <a href="#">링크는 파랑</a>이고,{" "}
            <code
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 14,
                background: "var(--chip)",
                padding: "2px 6px",
                borderRadius: 6,
              }}
            >
              코드는 고정폭
            </code>
            으로 적는다.
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--mut)" }}>
            보조 텍스트 13.5px — 메타 정보와 설명.
          </p>
        </Section>

        <Section title="배지 · 버튼 · 칩">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <Badge kind="tint">입문</Badge>
            <Badge>비전공자</Badge>
            <Badge>초안</Badge>
            <CtaLink href="#">첫 챕터부터 시작하기</CtaLink>
            <button
              type="button"
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
              보조 버튼
            </button>
            <button
              type="button"
              style={{
                font: "inherit",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--mut)",
                background: "transparent",
                border: 0,
                cursor: "pointer",
              }}
            >
              텍스트 버튼
            </button>
          </div>
        </Section>

        <Section title="입력 · 셀렉트 · 아코디언">
          <div
            style={{
              display: "flex",
              gap: 10,
              maxWidth: 480,
              background: "var(--card)",
              border: "1.5px solid var(--line)",
              borderRadius: 16,
              padding: "6px 6px 6px 18px",
              boxShadow: "var(--sh)",
              alignItems: "center",
            }}
          >
            <input
              type="search"
              placeholder="배우고 싶은 주제 검색"
              aria-label="검색"
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
          <select
            aria-label="정렬"
            style={{
              font: "inherit",
              fontSize: 14,
              fontWeight: 600,
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "8px 10px",
              background: "var(--card)",
              color: "var(--txt)",
              width: "fit-content",
            }}
          >
            <option>최신 발행순</option>
            <option>제목순</option>
          </select>
          <details
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
              Flutter 공식 문서
              <span
                style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--mut)", fontWeight: 500 }}
              >
                Google
              </span>
            </summary>
            <div
              style={{
                padding: "0 18px 16px",
                fontSize: 13.5,
                color: "var(--mut)",
                lineHeight: 1.6,
              }}
            >
              사용 조건: CC BY 4.0
            </div>
          </details>
        </Section>

        <Section title="빈 상태">
          <EmptyState
            title="아직 발행된 교재가 없어요"
            description="검수를 통과한 교재가 준비되는 대로 이곳에 올라와요."
          />
        </Section>

        <Section title="영상 플레이어 (상태 5종)">
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--mut)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            상태
            <select
              value={playerState}
              onChange={(e) => setPlayerState(e.target.value as PlayerState | "auto")}
              style={{
                font: "inherit",
                fontSize: 13,
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "6px 8px",
                background: "var(--card)",
                color: "var(--txt)",
              }}
            >
              {["auto", "preparing", "paused", "playing", "ended", "error"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <OverviewPlayer
            label="챕터 개요 — 위젯 트리, 90초 미리보기"
            scenes={DEMO_SCENES}
            durationSec={10}
            {...(playerState !== "auto" ? { forcedState: playerState } : {})}
          />
        </Section>

        <Section title="AI 학습 도우미 (상태 6종)">
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--mut)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            상태
            <select
              value={assistantState}
              onChange={(e) => setAssistantState(e.target.value as AssistantForcedState | "auto")}
              style={{
                font: "inherit",
                fontSize: 13,
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "6px 8px",
                background: "var(--card)",
                color: "var(--txt)",
              }}
            >
              {["auto", "closed", "login", "ready", "responding", "exhausted", "error"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <span>— 우하단 런처·패널로 나타난다</span>
          </label>
          <Assistant
            contextLabel="챕터 3 위젯 트리 이해하기"
            suggests={["Column과 Row는 뭐가 달라요?", "setState는 왜 필요해요?"]}
            demo
            {...(assistantState !== "auto" ? { forcedState: assistantState } : {})}
          />
        </Section>
      </div>
    </PageShell>
  );
}
