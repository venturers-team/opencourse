"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { LogoMark } from "./logo";

/**
 * AI 학습 도우미 패널 — 상태 6종: 닫힘/비로그인/대기/응답 중/한도 소진/장애.
 * UI 정본은 Claude Design 프로젝트의 section.dc.html이다.
 * 안 될 때의 화면이 될 때만큼 중요하다: 장애는 "질문 탓이 아니"라고 말하고,
 * 로그인 안내는 "읽기는 로그인 불필요"를 그대로 적는다 (docs/04 화면 5 규칙).
 */
export interface AssistantMessage {
  role: "user" | "ai";
  text?: string;
  code?: string;
  codeLabel?: string;
  list?: string[];
}

export type AssistantForcedState =
  "closed" | "login" | "ready" | "responding" | "exhausted" | "error";

export interface AssistantProps {
  contextLabel: string;
  suggests?: string[];
  quotaMax?: number;
  /** 실제 백엔드(10단계 Supabase). 없으면 열 때 장애 상태를 보인다 — 챗봇이 꺼져도 교재는 읽힌다. */
  ask?: (question: string) => Promise<AssistantMessage>;
  login?: () => Promise<boolean>;
  /** 스타일 가이드·테스트용 상태 고정. */
  forcedState?: AssistantForcedState;
  demo?: boolean;
}

const DEMO_SEED: AssistantMessage[] = [
  { role: "user", text: "부모가 자식 위젯을 '만든다'는 게 무슨 뜻이에요?" },
  {
    role: "ai",
    text: "부모의 build()가 반환하는 위젯이 곧 자식이라는 뜻이에요. 코드로 보면 이래요:",
    code: "Widget build(BuildContext context) {\n  return Center(\n    child: Text('안녕, Flutter!'),\n  );\n}",
    codeLabel: "DART",
    list: ["build()가 반환한 위젯 = 자식", "자식이 바뀌면 그 부분만 다시 그려요"],
  },
];

const DEMO_REPLIES: AssistantMessage[] = [
  {
    role: "ai",
    text: "좋은 질문이에요. Column은 자식을 세로로, Row는 가로로 늘어놓아요. 축만 다르고 쓰는 법은 같아요.",
    list: ["세로 나열 → Column", "가로 나열 → Row", "겹쳐 쌓기 → Stack"],
  },
  {
    role: "ai",
    text: "setState를 부르면 이 위젯의 build()를 다시 실행해서, 바뀐 부분만 새로 그려요.",
    code: "setState(() {\n  count = count + 1;\n});",
    codeLabel: "DART",
  },
];

function Bubble({ m }: { m: AssistantMessage }) {
  const isUser = m.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={
          isUser
            ? {
                maxWidth: "85%",
                background: "var(--blue)",
                color: "#fff",
                borderRadius: "16px 16px 4px 16px",
                padding: "10px 14px",
              }
            : {
                maxWidth: "92%",
                background: "var(--chip)",
                color: "var(--txt)",
                borderRadius: "16px 16px 16px 4px",
                padding: "11px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }
        }
      >
        {m.text ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, fontWeight: 500 }}>{m.text}</p>
        ) : null}
        {m.code ? (
          <div style={{ borderRadius: 10, overflow: "hidden", background: "#101321" }}>
            <div
              style={{
                padding: "6px 10px",
                fontSize: 10.5,
                fontWeight: 800,
                color: "#8b93a5",
                borderBottom: "1px solid rgba(255,255,255,.08)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {m.codeLabel ?? "CODE"}
            </div>
            <pre
              style={{
                margin: 0,
                padding: "10px 12px",
                overflowX: "auto",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "#d6deeb",
                whiteSpace: "pre",
              }}
            >
              {m.code}
            </pre>
          </div>
        ) : null}
        {m.list ? (
          <ul
            style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, fontWeight: 500 }}
          >
            {m.list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

const PRIVACY_NOTE = "대화 내용은 평가나 성적에 쓰이지 않습니다";

export function Assistant({
  contextLabel,
  suggests = [],
  quotaMax = 10,
  ask,
  login,
  forcedState,
  demo = false,
}: AssistantProps) {
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState<"out" | "in">("out");
  const [phase, setPhase] = useState<"ready" | "responding" | "exhausted" | "error">("ready");
  const [quota, setQuota] = useState(quotaMax);
  const [msgs, setMsgs] = useState<AssistantMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const forced = (() => {
    switch (forcedState) {
      case "closed":
        return { open: false as const };
      case "login":
        return { open: true, mode: "login" as const };
      case "ready":
        return {
          open: true,
          mode: "chat" as const,
          phase: "ready" as const,
          quota: 7,
          msgs: DEMO_SEED,
        };
      case "responding":
        return {
          open: true,
          mode: "chat" as const,
          phase: "responding" as const,
          quota: 6,
          msgs: [...DEMO_SEED, { role: "user" as const, text: "Stack은 언제 쓰는 게 좋아요?" }],
        };
      case "exhausted":
        return {
          open: true,
          mode: "chat" as const,
          phase: "exhausted" as const,
          quota: 0,
          msgs: DEMO_SEED,
        };
      case "error":
        return { open: true, mode: "error" as const };
      default:
        return null;
    }
  })();

  /* 백엔드(ask·login)가 아직 연결되지 않았고 데모도 아니면, 여는 순간 장애 화면 —
     "질문 탓이 아니"라고 말하고 교재는 계속 읽게 한다 (10단계 전의 정직한 상태). */
  const backendMissing = !ask && !login && !demo;
  const view = forced ?? {
    open,
    mode: backendMissing
      ? ("error" as const)
      : auth === "out"
        ? ("login" as const)
        : phase === "error"
          ? ("error" as const)
          : ("chat" as const),
    phase: quota <= 0 ? ("exhausted" as const) : phase,
    quota,
    msgs: msgs ?? [],
  };

  const focusPanel = useCallback((selector?: string) => {
    setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        selector ?? "textarea:not([disabled]),button",
      );
      el?.focus();
    }, 60);
  }, []);

  const doLogin = async () => {
    if (forced) return;
    const ok = login ? await login() : demo;
    if (ok) {
      setAuth("in");
      setMsgs((prev) => prev ?? (demo ? DEMO_SEED : []));
      focusPanel("textarea:not([disabled])");
    }
  };

  const send = async () => {
    if (forced) return;
    const text = input.trim();
    if (!text || view.phase === "responding" || view.phase === "exhausted") return;
    setMsgs((prev) => [...(prev ?? []), { role: "user", text }]);
    setInput("");
    setPhase("responding");
    try {
      let reply: AssistantMessage;
      if (ask) reply = await ask(text);
      else if (demo)
        reply = await new Promise<AssistantMessage>((resolve) =>
          setTimeout(
            () =>
              resolve(DEMO_REPLIES[(msgs ?? []).length % DEMO_REPLIES.length] as AssistantMessage),
            1200,
          ),
        );
      else throw new Error("backend");
      setMsgs((prev) => [...(prev ?? []), reply]);
      const next = quota - 1;
      setQuota(next);
      setPhase(next <= 0 ? "exhausted" : "ready");
      if (next > 0) focusPanel("textarea:not([disabled])");
    } catch {
      setPhase("error");
    }
  };

  const close = useCallback(() => {
    if (forced) return;
    setOpen(false);
    setTimeout(() => launcherRef.current?.focus(), 40);
  }, [forced]);

  /* Esc는 포커스가 패널 밖(런처 등)에 있어도 닫는다 — 패널 안 핸들러는 전파를 멈추므로 중복 없음. */
  useEffect(() => {
    if (!open || forced) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, forced, close]);

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = [
      ...panelRef.current.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled])",
      ),
    ];
    if (focusables.length === 0) return;
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const isOpen = view.open;
  const quotaValue = "quota" in view ? (view.quota ?? 0) : 0;
  const near = quotaValue > 0 && quotaValue <= 2;
  const exhausted = "phase" in view && view.phase === "exhausted";
  const responding = "phase" in view && view.phase === "responding";
  const shownMsgs = "msgs" in view ? (view.msgs ?? []) : [];
  const inputDisabled = responding || exhausted;

  return (
    <>
      {!(isOpen && isMobile) ? (
        <button
          type="button"
          ref={launcherRef}
          onClick={() => {
            if (forced) return;
            const opening = !open;
            setOpen(opening);
            if (opening) focusPanel();
            else launcherRef.current?.focus();
          }}
          aria-expanded={isOpen}
          aria-controls="oc-assistant"
          {...(isMobile ? { "aria-label": "질문하기" } : {})}
          style={{
            position: "fixed",
            zIndex: 40,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: isOpen ? "1.5px solid var(--blue)" : 0,
            cursor: "pointer",
            font: "inherit",
            fontSize: 14,
            fontWeight: 700,
            boxShadow: "var(--sh-panel)",
            background: isOpen ? "var(--card)" : "var(--blue)",
            color: isOpen ? "var(--tint-txt)" : "#fff",
            ...(isMobile
              ? {
                  right: 16,
                  bottom: 16,
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  justifyContent: "center" as const,
                }
              : { right: 22, bottom: 22, padding: "14px 20px", borderRadius: 999 }),
          }}
        >
          <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24">
            <path
              d="M3 6.5C6 4.8 9 4.8 12 6.5c3-1.7 6-1.7 9 0v11c-3-1.7-6-1.7-9 0-3-1.7-6-1.7-9 0z"
              fill="currentColor"
            />
          </svg>
          {!isMobile ? <span>질문하기</span> : null}
        </button>
      ) : null}

      {isOpen ? (
        <div
          id="oc-assistant"
          role="dialog"
          aria-modal="false"
          aria-label="AI 학습 도우미"
          ref={panelRef}
          onKeyDown={onPanelKeyDown}
          style={{
            position: "fixed",
            zIndex: 41,
            background: "var(--card)",
            border: "1px solid var(--line)",
            boxShadow: "var(--sh-panel)",
            display: "flex",
            flexDirection: "column",
            animation: "ocrise .22s ease",
            ...(isMobile
              ? {
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "min(68vh, 560px)",
                  borderRadius: "22px 22px 0 0",
                }
              : {
                  right: 18,
                  top: 78,
                  bottom: 18,
                  width: "min(384px, calc(100vw - 36px))",
                  borderRadius: 22,
                }),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 16px",
              borderBottom: "1px solid var(--line)",
              flex: "none",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "var(--tint)",
                color: "var(--tint-txt)",
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              <LogoMark size={19} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14.5, fontWeight: 800 }}>
                AI 학습 도우미
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 11.5,
                  color: "var(--mut)",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                지금 읽는 중 · {contextLabel}
              </span>
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="도우미 닫기"
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
                flex: "none",
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

          {view.mode === "login" ? (
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                textAlign: "center",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 18,
                  background: "var(--tint)",
                  color: "var(--tint-txt)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <p style={{ margin: 0, fontSize: 16.5, fontWeight: 800, letterSpacing: "-0.01em" }}>
                로그인하고 물어보세요
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--mut)",
                  fontWeight: 500,
                  maxWidth: "26em",
                }}
              >
                질문 횟수를 세기 위한 로그인이에요.
                <br />
                로그인 없이도 교재는 전부 읽을 수 있어요.
              </p>
              <button
                type="button"
                onClick={() => void doLogin()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid #dadce0",
                  background: "#fff",
                  color: "#3c4043",
                  font: "inherit",
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "11px 20px",
                  borderRadius: 12,
                  cursor: "pointer",
                  boxShadow: "var(--sh)",
                }}
              >
                <svg aria-hidden="true" width="17" height="17" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.2 0 11.4-2 15.4-5.5l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-3.9-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
                  />
                </svg>
                Google로 계속하기
              </button>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12,
                  color: "var(--mut)",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                {PRIVACY_NOTE}
              </p>
            </div>
          ) : null}

          {view.mode === "error" ? (
            <div
              role="alert"
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                textAlign: "center",
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
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14.5 17H7a4 4 0 1 1 .6-7.96A5.5 5.5 0 0 1 18 7.5c0 .5-.07 1-.19 1.45" />
                  <path d="m3 3 18 18" />
                  <path d="M21 15.5A3.5 3.5 0 0 0 17.5 12" />
                </svg>
              </span>
              <p style={{ margin: 0, fontSize: 16.5, fontWeight: 800, letterSpacing: "-0.01em" }}>
                지금은 도우미를 쓸 수 없는 상태예요
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--mut)",
                  fontWeight: 500,
                  maxWidth: "26em",
                }}
              >
                저희 쪽 문제예요 — 질문 탓이 아니에요.
                <br />
                잠시 뒤에 다시 열어 보세요.{" "}
                <strong style={{ color: "var(--txt)" }}>교재는 계속 읽을 수 있어요.</strong>
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!forced) setPhase("ready");
                }}
                style={{
                  border: 0,
                  background: "var(--chip)",
                  color: "var(--txt)",
                  font: "inherit",
                  fontSize: 13.5,
                  fontWeight: 700,
                  padding: "10px 18px",
                  borderRadius: 11,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                다시 확인
              </button>
            </div>
          ) : null}

          {view.mode === "chat" ? (
            <>
              <div
                aria-live="polite"
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {shownMsgs.length === 0 && !responding ? (
                  <div
                    style={{
                      margin: "auto",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      alignItems: "center",
                      padding: 12,
                    }}
                  >
                    <LogoMark size={46} />
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--mut)" }}>
                      이 챕터에 대해 무엇이든 물어보세요
                    </p>
                    <div
                      style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}
                    >
                      {suggests.map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            setInput(label);
                            focusPanel("textarea:not([disabled])");
                          }}
                          style={{
                            border: "1px solid var(--line)",
                            background: "var(--card)",
                            color: "var(--txt)",
                            font: "inherit",
                            fontSize: 13,
                            fontWeight: 600,
                            padding: "10px 14px",
                            borderRadius: 12,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {shownMsgs.map((m, i) => (
                  <Bubble key={i} m={m} />
                ))}
                {responding ? (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div
                      role="status"
                      aria-label="답변을 만드는 중"
                      style={{
                        background: "var(--chip)",
                        borderRadius: "16px 16px 16px 4px",
                        padding: "9px 14px",
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          animation: "ocbob 1s ease-in-out infinite",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <LogoMark size={26} />
                      </span>
                      {[0, 0.18, 0.36].map((delay) => (
                        <span
                          key={delay}
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--mut)",
                            animation: `ocdot 1.2s ease-in-out ${delay}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {exhausted ? (
                  <div
                    style={{
                      background: "var(--warn-bg)",
                      borderRadius: 14,
                      padding: "14px 16px",
                      display: "flex",
                      gap: 11,
                      alignItems: "flex-start",
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--warn-txt)"
                      strokeWidth="2"
                      style={{ flex: "none", marginTop: 1 }}
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    <div>
                      <p
                        style={{
                          margin: "0 0 3px",
                          fontSize: 13.5,
                          fontWeight: 800,
                          color: "var(--warn-txt)",
                        }}
                      >
                        오늘 질문 한도를 다 썼어요
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: "var(--warn-txt)",
                          fontWeight: 500,
                        }}
                      >
                        내일 다시 물어볼 수 있어요. 그때까지 교재는 계속 읽을 수 있어요.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  borderTop: "1px solid var(--line)",
                  padding: "10px 14px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                  flex: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: exhausted
                        ? "var(--err-bg)"
                        : near
                          ? "var(--warn-bg)"
                          : "var(--chip)",
                      color: exhausted
                        ? "var(--err-txt)"
                        : near
                          ? "var(--warn-txt)"
                          : "var(--chip-txt)",
                    }}
                  >
                    오늘 {quotaValue}/{quotaMax}
                    {exhausted ? " · 다 썼어요" : near ? " · 얼마 안 남았어요" : ""}
                  </span>
                  <span style={{ flex: 1 }} />
                  {shownMsgs.length > 0 && !responding ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!forced) setMsgs([]);
                      }}
                      style={{
                        border: 0,
                        background: "transparent",
                        color: "var(--mut)",
                        font: "inherit",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: "5px 8px",
                        borderRadius: 8,
                      }}
                    >
                      대화 지우기
                    </button>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    disabled={inputDisabled}
                    placeholder={
                      exhausted
                        ? "내일 다시 물어볼 수 있어요"
                        : responding
                          ? "답변을 만드는 중이에요…"
                          : "이 챕터에 대해 물어보세요"
                    }
                    aria-label="질문 입력"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      resize: "none",
                      border: "1.5px solid var(--line)",
                      background: inputDisabled ? "var(--bg2)" : "var(--bg)",
                      color: "var(--txt)",
                      font: "inherit",
                      fontSize: 14,
                      fontWeight: 500,
                      lineHeight: 1.5,
                      padding: "11px 14px",
                      borderRadius: 13,
                      cursor: inputDisabled ? "not-allowed" : "text",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={inputDisabled || !input.trim()}
                    aria-label="질문 보내기"
                    style={{
                      flex: "none",
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      border: 0,
                      display: "grid",
                      placeItems: "center",
                      background: inputDisabled || !input.trim() ? "var(--chip)" : "var(--blue)",
                      color: inputDisabled || !input.trim() ? "var(--mut)" : "#fff",
                      cursor: inputDisabled || !input.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M12 19V5" />
                      <path d="m5 12 7-7 7 7" />
                    </svg>
                  </button>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: "var(--mut)",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  {PRIVACY_NOTE}
                </p>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
