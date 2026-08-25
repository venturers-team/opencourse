"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "./logo";

/**
 * 개요 영상 플레이어 — 파일이 아니라 브라우저에서 조립해 재생한다 (docs/03·10).
 * timeline.json의 장면을 오디오 재생 위치에 맞춰 전환하는 자체 조립기.
 * 상태 5종: 준비 중 / 일시 정지 / 재생 중 / 종료 / 오류. 다운로드 수단은 없다.
 * UI 정본은 Claude Design 프로젝트의 course.dc.html 플레이어다.
 */
export interface TimelineScene {
  index: number;
  start_sec: number;
  duration_sec: number;
  narration: string;
  visual: { type: string } & Record<string, unknown>;
}

export type PlayerState = "preparing" | "paused" | "playing" | "ended" | "error";

export interface OverviewPlayerProps {
  label: string;
  scenes: TimelineScene[];
  durationSec: number;
  audioUrl?: string | null;
  /** 스타일 가이드·테스트용 상태 고정. */
  forcedState?: PlayerState;
  prepareDelayMs?: number;
}

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function SceneVisual({ visual }: { visual: TimelineScene["visual"] }) {
  if (visual.type === "title") {
    return (
      <p
        style={{
          margin: 0,
          fontSize: "clamp(22px,4vw,34px)",
          fontWeight: 800,
          color: "#fff",
          textAlign: "center",
          padding: "0 24px",
          letterSpacing: "-0.02em",
        }}
      >
        {String(visual.text ?? "")}
      </p>
    );
  }
  if (visual.type === "bullets") {
    const items = Array.isArray(visual.items) ? (visual.items as string[]) : [];
    return (
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {items.map((item) => (
          <li
            key={item}
            style={{
              color: "#fff",
              fontSize: 17,
              fontWeight: 600,
              display: "flex",
              gap: 9,
              alignItems: "center",
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: 99, background: "#8ab2ff", flex: "none" }}
            />
            {item}
          </li>
        ))}
      </ul>
    );
  }
  if (visual.type === "figure" && typeof visual.url === "string") {
    return (
      <img
        src={visual.url}
        alt={String(visual.alt ?? "")}
        style={{
          maxWidth: "70%",
          maxHeight: "70%",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,.3)",
        }}
      />
    );
  }
  if (visual.type === "code") {
    return (
      <pre
        style={{
          margin: 0,
          padding: "14px 18px",
          background: "rgba(8,10,16,.6)",
          borderRadius: 12,
          color: "#d6deeb",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          maxWidth: "80%",
          overflow: "hidden",
        }}
      >
        {String(visual.code ?? "")}
      </pre>
    );
  }
  return (
    <p style={{ margin: 0, color: "rgba(255,255,255,.85)", fontSize: 16, fontWeight: 600 }}>
      {String(visual.text ?? "")}
    </p>
  );
}

export function OverviewPlayer({
  label,
  scenes,
  durationSec,
  audioUrl = null,
  forcedState,
  prepareDelayMs = 1400,
}: OverviewPlayerProps) {
  const [state, setState] = useState<PlayerState>("preparing");
  const [t, setT] = useState(0);
  const [cc, setCc] = useState(true);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 준비: 오디오가 있으면 canplay를, 없으면(시연) 짧은 지연을 기다린다
  useEffect(() => {
    if (forcedState) return;
    if (!audioUrl) {
      const timer = setTimeout(() => {
        if (stateRef.current === "preparing") setState("paused");
      }, prepareDelayMs);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [audioUrl, forcedState, prepareDelayMs]);

  // 시연 모드(오디오 없음)의 시계
  useEffect(() => {
    if (forcedState || audioUrl) return;
    const timer = setInterval(() => {
      if (stateRef.current !== "playing") return;
      setT((prev) => {
        if (prev + 1 >= durationSec) {
          setState("ended");
          return durationSec;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [audioUrl, durationSec, forcedState]);

  const effState = forcedState ?? state;
  const scene = [...scenes].reverse().find((s) => t >= s.start_sec) ?? scenes[0] ?? null;

  const play = useCallback(() => {
    setState("playing");
    void audioRef.current?.play().catch(() => setState("error"));
  }, []);
  const pause = useCallback(() => {
    setState("paused");
    audioRef.current?.pause();
  }, []);
  const seek = (value: number) => {
    setT(value);
    if (audioRef.current) audioRef.current.currentTime = value;
  };

  const showStage = effState === "paused" || effState === "playing" || effState === "ended";
  const showControls = effState === "paused" || effState === "playing";

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        background: "#0f1117",
        aspectRatio: "16/9",
        boxShadow: "var(--sh)",
      }}
    >
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          muted={muted}
          preload="auto"
          onCanPlay={() => {
            if (stateRef.current === "preparing") setState("paused");
          }}
          onTimeUpdate={(e) => setT((e.target as HTMLAudioElement).currentTime)}
          onEnded={() => setState("ended")}
          onError={() => setState("error")}
        />
      ) : null}

      {effState === "preparing" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            color: "#c9cedb",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "grid",
              placeItems: "center",
              animation: "ocbob 1s ease-in-out infinite",
            }}
          >
            <LogoMark size={46} />
          </span>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }} role="status">
            영상을 준비하고 있어요
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#8b93a5" }}>
            브라우저에서 조립해 재생해요 — 보통 몇 초면 끝나요
          </p>
        </div>
      ) : null}

      {showStage ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(135deg,#233a75,#3b6ef5 60%,#8ab2ff)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <p
              style={{
                position: "absolute",
                left: 24,
                top: 22,
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: "rgba(255,255,255,.9)",
              }}
            >
              {label}
            </p>
            {scene ? <SceneVisual visual={scene.visual} /> : null}
          </div>
          {effState === "paused" ? (
            <button
              type="button"
              onClick={play}
              aria-label="재생"
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: 72,
                height: 72,
                borderRadius: "50%",
                border: 0,
                background: "rgba(255,255,255,.94)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 8px 24px rgba(0,0,0,.3)",
              }}
            >
              <svg
                aria-hidden="true"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="#1b2230"
                style={{ marginLeft: 3 }}
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          ) : null}
          {effState === "ended" ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(10,12,20,.72)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
              }}
            >
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#e7eaf2" }}>
                다 봤어요
              </p>
              <button
                type="button"
                onClick={() => {
                  seek(0);
                  play();
                }}
                style={{
                  border: 0,
                  background: "#fff",
                  color: "#1b2230",
                  font: "inherit",
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "11px 22px",
                  borderRadius: 12,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <svg
                  aria-hidden="true"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                다시 보기
              </button>
            </div>
          ) : null}
          {effState === "playing" && cc && scene ? (
            <p
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 56,
                margin: "0 auto",
                width: "fit-content",
                maxWidth: "80%",
                background: "rgba(8,10,16,.78)",
                color: "#fff",
                fontSize: 14.5,
                fontWeight: 500,
                lineHeight: 1.5,
                padding: "7px 14px",
                borderRadius: 8,
                textAlign: "center",
              }}
            >
              {scene.narration}
            </p>
          ) : null}
        </>
      ) : null}

      {effState === "error" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "#c9cedb",
          }}
        >
          <svg
            aria-hidden="true"
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffb020"
            strokeWidth="2"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }} role="alert">
            영상을 불러오지 못했어요
          </p>
          <button
            type="button"
            onClick={() => {
              setState("preparing");
              audioRef.current?.load();
              if (!audioUrl) setTimeout(() => setState("paused"), prepareDelayMs);
            }}
            style={{
              border: 0,
              background: "rgba(255,255,255,.12)",
              color: "#e7eaf2",
              font: "inherit",
              fontSize: 13.5,
              fontWeight: 700,
              padding: "9px 18px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {showControls ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "linear-gradient(transparent, rgba(8,10,16,.82))",
          }}
        >
          <button
            type="button"
            onClick={effState === "playing" ? pause : play}
            aria-label={effState === "playing" ? "일시 정지" : "재생"}
            style={{
              border: 0,
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              width: 32,
              height: 32,
              display: "grid",
              placeItems: "center",
            }}
          >
            {effState === "playing" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <span
            style={{
              fontSize: 12,
              color: "#dfe3ec",
              fontVariantNumeric: "tabular-nums",
              flex: "none",
            }}
          >
            {fmt(t)} / {fmt(durationSec)}
          </span>
          <input
            type="range"
            min={0}
            max={durationSec}
            value={Math.min(t, durationSec)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="재생 위치"
            style={{ flex: 1, accentColor: "#8ab2ff", height: 4, cursor: "pointer" }}
          />
          <button
            type="button"
            onClick={() => setCc((v) => !v)}
            aria-pressed={cc}
            aria-label="자막"
            style={{
              border: 0,
              font: "inherit",
              fontSize: 11.5,
              fontWeight: 800,
              padding: "5px 9px",
              borderRadius: 7,
              cursor: "pointer",
              background: cc ? "#8ab2ff" : "rgba(255,255,255,.14)",
              color: cc ? "#0f1117" : "#cfd5e2",
            }}
          >
            자막
          </button>
          <button
            type="button"
            onClick={() => setMuted((v) => !v)}
            aria-label={muted ? "소리 켜기" : "소리 끄기"}
            style={{
              border: 0,
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              width: 32,
              height: 32,
              display: "grid",
              placeItems: "center",
            }}
          >
            {muted ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <path d="m22 9-6 6m0-6 6 6" />
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
                <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              </svg>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
