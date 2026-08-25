"use client";
import { Assistant, type AssistantMessage } from "@opencourse/ui";

/**
 * AI 학습 도우미 실연결 (구현 계획 10단계 준비).
 * 빌드 시점 환경 변수 세 개가 전부 있으면 Google 로그인 + Edge Function 호출이 켜지고,
 * 하나라도 없으면 도우미는 여는 순간 정직한 장애 화면을 보인다 (교재는 계속 읽힌다).
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_CHAT_URL
 * 한도의 정본은 서버(consume_quota)다 — 패널의 남은 횟수 표시는 안내일 뿐이다.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL ?? "";

const enabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && CHAT_URL);

async function client() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export function LiveAssistant({
  contextLabel,
  courseSlug,
  chapterId,
}: {
  contextLabel: string;
  courseSlug: string;
  chapterId: string;
}) {
  if (!enabled) return <Assistant contextLabel={contextLabel} />;

  const login = async (): Promise<boolean> => {
    const supabase = await client();
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    return false; // 리다이렉트로 떠난다 — 돌아오면 위의 getSession이 참이 된다
  };

  const ask = async (question: string): Promise<AssistantMessage> => {
    const supabase = await client();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("login_required");
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ course_slug: courseSlug, chapter_id: chapterId, question }),
    });
    if (!res.ok) throw new Error(`chat_${res.status}`);
    const body = (await res.json()) as { reply?: string };
    if (!body.reply) throw new Error("empty_reply");
    return { role: "ai", text: body.reply };
  };

  return <Assistant contextLabel={contextLabel} ask={ask} login={login} />;
}
