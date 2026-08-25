import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * 공개 사이트 E2E (구현 계획 8단계).
 * 대상은 정적 산출물 그 자체다 — 발행 교재만 있고, 모든 조작이 키보드로 되고,
 * 없는 주소·초안·숨김 페이지가 같은 404라는 것을 실제 브라우저로 증명한다.
 */
const outDir = join(__dirname, "..", "apps", "site", "out");

/** 미디어 주소(가짜 R2 도메인)를 차단해 플레이어 오류 상태를 결정적으로 만든다. */
async function blockMedia(page: Page) {
  await page.route("https://media.example.com/**", (route) => route.abort());
}

test("화면 1 — 목록: 발행 교재가 보이고 검색·필터가 동작한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /고정 교재/ })).toBeVisible();
  await expect(page.getByText("교재 1권")).toBeVisible();

  await page.getByRole("searchbox").fill("존재하지 않는 주제");
  await expect(page.getByText("교재 0권")).toBeVisible();
  await expect(page.getByText("조건에 맞는 교재가 없어요")).toBeVisible();

  await page.getByRole("button", { name: "초기화" }).first().click();
  await expect(page.getByText("교재 1권")).toBeVisible();
});

test("이동: 목록 → 교재 상세 → 챕터 본문 → 다음 챕터", async ({ page }) => {
  await blockMedia(page);
  await page.goto("/");
  await page.getByRole("link", { name: /고정 교재/ }).click();
  await expect(page).toHaveURL(/\/fixture-course\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "고정 교재" })).toBeVisible();
  await expect(page.getByText("이 교재를 마치면")).toBeVisible();
  await expect(page.getByText("출처와 참고 자료")).toBeVisible();

  await page
    .getByRole("link", { name: /위젯이 뭐예요/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/fixture-course\/01-intro\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "위젯이 뭐예요" })).toBeVisible();
  await expect(page.getByText("챕터 1 / 2")).toBeVisible();
  await expect(page.getByText("위젯은 화면을 이루는 가장 작은 부품이다.")).toBeVisible();

  await page.getByRole("link", { name: /다음 챕터/ }).click();
  await expect(page).toHaveURL(/\/fixture-course\/02-practice\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "실습" })).toBeVisible();
});

test("챕터 본문: 플레이어가 마운트되어 설계된 상태를 그린다", async ({ page }) => {
  await blockMedia(page);
  await page.goto("/fixture-course/01-intro/");
  const player = page.getByRole("region", { name: "챕터 개요 영상" });
  await expect(player).toBeVisible();
  // 준비 중 → (가짜 오디오 차단으로) 오류 상태 — 어느 쪽이든 설계된 화면이어야 한다
  await expect(player.getByText(/영상을 준비하고 있어요|영상을 불러오지 못했어요/)).toBeVisible();
});

test("챕터 본문: 인포그래픽 프레임 — 그림 번호·대체 설명 토글", async ({ page }) => {
  await blockMedia(page);
  await page.goto("/fixture-course/01-intro/");
  await expect(page.getByText(/그림 1/)).toBeVisible();
  await page.getByRole("button", { name: "설명 펼치기" }).click();
  await expect(page.getByText("위젯 트리를 나타낸 그림")).toBeVisible();
  await page.getByRole("button", { name: "설명 접기" }).click();
});

test("키보드만으로: 목록에서 교재를 열고, 도우미를 열고 닫는다", async ({ page }) => {
  await blockMedia(page);
  await page.goto("/");
  // Tab 순회로 교재 카드 링크에 도달해 Enter로 연다
  let reached = false;
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    const text = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (text.includes("고정 교재")) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fixture-course\/$/);

  // 챕터 본문에서 도우미 런처까지 키보드로 — 열림(백엔드 없음 → 정직한 장애 화면)과 Esc 닫힘
  await page.goto("/fixture-course/01-intro/");
  const launcher = page.getByRole("button", { name: /질문하기/ });
  await launcher.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("지금은 도우미를 쓸 수 없는 상태예요")).toBeVisible();
  await expect(page.getByText("교재는 계속 읽을 수 있어요.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("지금은 도우미를 쓸 수 없는 상태예요")).toBeHidden();
});

test("404 무구분: 없는 주소와 초안 주소가 같은 안내, 같은 404 상태", async ({ page }) => {
  const r1 = await page.goto("/no-such-course/");
  expect(r1?.status()).toBe(404);
  await expect(page.getByText("여기엔 교재가 없어요")).toBeVisible();
  const h1 = await page.getByRole("heading", { level: 1 }).textContent();

  const r2 = await page.goto("/draft-course/");
  expect(r2?.status()).toBe(404);
  const h2 = await page.getByRole("heading", { level: 1 }).textContent();
  expect(h2).toBe(h1);
});

test("스타일 가이드는 공개 산출물에서 404다", async ({ page }) => {
  await page.goto("/styleguide/");
  await expect(page.getByText("여기엔 교재가 없어요")).toBeVisible();
});

test("사이트맵·robots: 발행 교재만 실린다", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/fixture-course/");
  expect(sitemap).toContain("/fixture-course/01-intro/");
  expect(sitemap).not.toContain("draft-course");

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("sitemap.xml");
});

test("챗봇 문맥 번들: 발행 교재의 본문만 담긴다", async ({ request }) => {
  const index = await (await request.get("/context/index.json")).json();
  expect(index.courses).toHaveLength(1);
  expect(index.courses[0].slug).toBe("fixture-course");

  const ch = await (await request.get("/context/fixture-course/01-intro.json")).json();
  expect(ch.subchapters[0].body).toContain("위젯은 화면을 이루는 가장 작은 부품이다.");

  // 산출물 폴더 수준에서도 초안 부재를 확인
  expect(existsSync(join(outDir, "context", "draft-course"))).toBe(false);
  expect(readdirSync(join(outDir, "context")).sort()).toEqual(["fixture-course", "index.json"]);
});

test("좁은 화면: 전체 목차 시트가 열리고 소제목 앵커가 있다", async ({ page }) => {
  await blockMedia(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/fixture-course/01-intro/");
  await page.getByRole("button", { name: "전체 목차 보기" }).click();
  const dialog = page.getByRole("dialog", { name: "교재 목차" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("읽은 챕터")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /실습/ })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /1\.1 위젯이 뭐예요/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("테마 전환이 동작하고 새로 고침에도 남는다", async ({ page }) => {
  await page.goto("/");
  const before = await page.evaluate(() => document.documentElement.dataset.theme ?? "light");
  await page.getByRole("button", { name: "테마 전환" }).click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await page.reload();
  const kept = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(kept).toBe(after);
});

test("키보드만으로: 404·처리방침·챕터 목차까지 전 화면 도달", async ({ page }) => {
  // 404 — Tab으로 복귀 링크에 닿고 Enter로 홈에 돌아온다
  await page.goto("/no-such-course/");
  let reached = false;
  for (let i = 0; i < 15; i += 1) {
    await page.keyboard.press("Tab");
    const text = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (text.includes("교재 목록 보러 가기")) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);

  // 처리방침 — 푸터 링크가 키보드로 열린다
  reached = false;
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press("Tab");
    const text = await page.evaluate(() => document.activeElement?.textContent ?? "");
    if (text.includes("개인정보 처리방침")) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/privacy\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "개인정보 처리방침" })).toBeVisible();

  // 챕터 본문 — 사이드 목차의 소제목 앵커에 키보드로 닿고, 포커스가 보인다
  await page.goto("/fixture-course/01-intro/");
  const anchor = page.getByRole("link", { name: "1.1 위젯이 뭐예요" });
  await anchor.focus();
  const outline = await anchor.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none"); // :focus-visible 규칙이 실제로 작동한다
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#s-1$/);

  // 테마 토글도 키보드로 조작된다
  const toggle = page.getByRole("button", { name: "테마 전환" });
  await toggle.focus();
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.keyboard.press("Enter");
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
});
