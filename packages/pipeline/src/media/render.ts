import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * S7 — 인포그래픽 HTML을 PNG로 렌더한다 (docs/10, 3단계에서 이월한 실물 연결).
 * HTML은 디자인 시스템 토큰으로 저작한다. 화면 규격은 본문 그림 프레임과 같은 16:9,
 * 선명도를 위해 2배 밀도로 찍는다. `#fig` 요소가 있으면 그 요소만, 없으면 뷰포트를 찍는다.
 * Playwright는 지연 로딩한다 — 렌더가 필요 없는 소비자는 브라우저 없이도 이 패키지를 쓴다.
 */
export interface RenderOptions {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
}

export async function renderInfographicPng(
  html: string,
  outPath: string,
  { width = 1280, height = 720, deviceScaleFactor = 2 }: RenderOptions = {},
): Promise<void> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor,
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    mkdirSync(dirname(outPath), { recursive: true });
    const target = page.locator("#fig");
    if ((await target.count()) > 0) {
      await target.screenshot({ path: outPath });
    } else {
      await page.screenshot({ path: outPath });
    }
  } finally {
    await browser.close();
  }
}
