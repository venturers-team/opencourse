// 오픈코스 챗봇 Edge Function (구현 계획 10단계 — 유일한 서버).
// 순서가 곧 안전장치다: 세션 검증 → 주입 1차 필터(한도 소모 없음) →
// 원자적 한도 소비(consume_quota) → 문맥 번들(공개 산출물)만 읽기 → OpenRouter(ZDR).
// 순수 로직은 packages/pipeline/src/chat/logic.ts의 사본 ./logic.ts를 쓴다 —
// 함수 번들은 폴더 밖을 못 가져가므로 사본을 두고, 동기화는 파이프라인 테스트가 강제한다.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildMessages,
  GLOBAL_DAILY_LIMIT,
  INJECTION_REFUSAL,
  looksLikeInjection,
  openRouterBody,
  USER_DAILY_LIMIT,
  type ChatTurn,
} from "./logic.ts";

const SITE_ORIGIN = Deno.env.get("OPENCOURSE_SITE_ORIGIN") ?? "";
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OPENROUTER_BASE = Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai"; // 통합 시험용 모의 서버 주입점
const MODEL = Deno.env.get("OPENCOURSE_CHAT_MODEL") ?? "anthropic/claude-haiku-4.5";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // 1. 세션 검증 — 로그인은 횟수 세기용이다 (docs/04 화면 5)
  const authHeader = req.headers.get("Authorization") ?? "";
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await anon.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "login_required" });
  const user = userData.user;

  let payload: {
    course_slug?: string;
    chapter_id?: string;
    question?: string;
    conversation_id?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "bad_request" });
  }
  const { course_slug, chapter_id, question, conversation_id } = payload;
  if (
    !course_slug ||
    !chapter_id ||
    !question ||
    !/^[a-z0-9-]+$/.test(course_slug) ||
    !/^[a-z0-9-]+$/.test(chapter_id)
  ) {
    return json(400, { error: "bad_request" });
  }

  // 2. 주입·문맥 이탈 1차 필터 — 한도를 소모하지 않고 거절한다
  if (looksLikeInjection(question)) {
    return json(200, { reply: INJECTION_REFUSAL, filtered: true });
  }

  // 3. 모델 호출 전에 원자적 이중 한도 (service_role 전용 RPC)
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: quotaRows, error: quotaError } = await service.rpc("consume_quota", {
    p_user: user.id,
    p_user_limit: USER_DAILY_LIMIT,
    p_global_limit: GLOBAL_DAILY_LIMIT,
  });
  if (quotaError) return json(500, { error: "quota_check_failed" });
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
  if (!quota?.allowed) {
    return json(429, { error: quota?.reason ?? "quota_exhausted", remaining: 0 });
  }

  // 4. 문맥은 공개 산출물의 챗봇 번들만 — 초안은 여기 없으므로 구조적으로 답할 수 없다
  const contextRes = await fetch(`${SITE_ORIGIN}/context/${course_slug}/${chapter_id}.json`);
  if (!contextRes.ok) return json(404, { error: "context_not_found" });
  const context = await contextRes.json();
  const contextText = (context.subchapters as { title: string; body: string }[])
    .map((s) => `## ${s.title}\n${s.body}`)
    .join("\n\n");

  // 5. 대화 이력 (선택) — 자기 것만 (RLS + user_id 확인의 이중 방어)
  let history: ChatTurn[] = [];
  let convId = conversation_id ?? null;
  if (convId) {
    const { data: rows } = await service
      .from("messages")
      .select("role, content, user_id")
      .eq("conversation_id", convId)
      .eq("user_id", user.id)
      .order("id", { ascending: true })
      .limit(16);
    history = (rows ?? []).map((r) => ({ role: r.role as "user" | "ai", text: r.content }));
  } else {
    const { data: conv } = await service
      .from("conversations")
      .insert({ user_id: user.id, course_slug, chapter_id })
      .select("id")
      .single();
    convId = conv?.id ?? null;
  }

  // 6. OpenRouter — ZDR을 계정 설정과 요청 파라미터 양쪽에서 강제
  const messages = buildMessages({
    courseTitle: context.course_title ?? course_slug,
    chapterTitle: context.chapter_title ?? chapter_id,
    contextText,
    question,
    history,
  });
  const orRes = await fetch(`${OPENROUTER_BASE}/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(openRouterBody(MODEL, messages)),
  });
  if (!orRes.ok) return json(502, { error: "model_unavailable" });
  const orBody = await orRes.json();
  const reply: string = orBody.choices?.[0]?.message?.content ?? "";
  if (!reply) return json(502, { error: "model_unavailable" });

  // 7. 기록 + 대화 시계 갱신 (3일 자동 삭제의 기준)
  if (convId) {
    await service.from("messages").insert([
      { conversation_id: convId, user_id: user.id, role: "user", content: question },
      { conversation_id: convId, user_id: user.id, role: "ai", content: reply },
    ]);
    await service
      .from("conversations")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", convId)
      .eq("user_id", user.id);
  }

  return json(200, {
    reply,
    conversation_id: convId,
    remaining: quota.user_remaining,
  });
});
