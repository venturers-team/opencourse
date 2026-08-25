import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 상태 전수 검사 (구현 계획 11단계 QA — "플레이어 5종·도우미 6종이 디자인과 일치").
 * 미리보기 서버의 /styleguide가 상태 강제 셀렉터를 제공하므로, 열한 상태 전부를
 * 실제 브라우저에서 렌더해 각 상태의 설계된 문구·조작이 존재하는지 확인한다.
 */
function section(page: Page, title: string): Locator {
  return page.locator("section", { has: page.getByRole("heading", { name: title }) });
}

test("스타일 가이드는 미리보기 서버에서 열린다", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { name: "디자인 시스템" })).toBeVisible();
});

test("영상 플레이어 — 다섯 상태 전부 설계대로 그려진다", async ({ page }) => {
  await page.goto("/styleguide");
  const sec = section(page, "영상 플레이어 (상태 5종)");
  const pick = (state: string) => sec.getByRole("combobox").selectOption(state);

  await pick("preparing");
  await expect(sec.getByText("영상을 준비하고 있어요")).toBeVisible();
  await expect(sec.getByText("브라우저에서 조립해 재생해요 — 보통 몇 초면 끝나요")).toBeVisible();

  await pick("paused");
  // 중앙 오버레이와 컨트롤 바 — 재생 버튼이 둘 다 있는 것이 설계다
  await expect(sec.getByRole("button", { name: "재생", exact: true })).toHaveCount(2);

  await pick("playing");
  await expect(sec.getByRole("button", { name: "일시 정지" })).toBeVisible();
  await expect(sec.getByText("이 챕터의 개요를 소개할게요.")).toBeVisible(); // 자막 기본 켬
  await expect(sec.getByRole("slider", { name: "재생 위치" })).toBeVisible();

  await pick("ended");
  await expect(sec.getByText("다 봤어요")).toBeVisible();
  await expect(sec.getByRole("button", { name: /다시 보기/ })).toBeVisible();

  await pick("error");
  await expect(sec.getByText("영상을 불러오지 못했어요")).toBeVisible();
  await expect(sec.getByRole("button", { name: /다시 시도/ })).toBeVisible();

  // 다운로드·전체화면 저장 수단이 없어야 한다 (docs/12 플레이어 명세)
  await expect(sec.locator("a[download], [aria-label*='다운로드']")).toHaveCount(0);
});

test("AI 학습 도우미 — 여섯 상태 전부 설계대로 그려진다", async ({ page }) => {
  await page.goto("/styleguide");
  const sec = section(page, "AI 학습 도우미 (상태 6종)");
  const pick = (state: string) => sec.getByRole("combobox").selectOption(state);
  const panel = page.locator("#oc-assistant");

  await pick("closed");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: /질문하기/ })).toBeVisible();

  await pick("login");
  await expect(panel.getByText("로그인하고 물어보세요")).toBeVisible();
  await expect(panel.getByText("질문 횟수를 세기 위한 로그인이에요.")).toBeVisible();
  await expect(panel.getByText("로그인 없이도 교재는 전부 읽을 수 있어요.")).toBeVisible();

  await pick("ready");
  await expect(panel.getByRole("textbox", { name: "질문 입력" })).toBeEnabled();
  await expect(panel.getByText("오늘 7/10")).toBeVisible(); // 남은 횟수 표시
  await expect(panel.getByText("대화 내용은 평가나 성적에 쓰이지 않습니다")).toBeVisible();

  await pick("responding");
  await expect(panel.getByRole("status", { name: "답변을 만드는 중" })).toBeVisible();

  await pick("exhausted");
  await expect(panel.getByText("오늘 질문 한도를 다 썼어요")).toBeVisible();

  await pick("error");
  await expect(panel.getByText("지금은 도우미를 쓸 수 없는 상태예요")).toBeVisible();
  await expect(panel.getByText("교재는 계속 읽을 수 있어요.")).toBeVisible();
});

test("두 테마 — 토글로 다크·라이트 모두 렌더된다", async ({ page }) => {
  await page.goto("/styleguide");
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: "테마 전환" }).click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await expect(page.getByRole("heading", { name: "디자인 시스템" })).toBeVisible();
});
