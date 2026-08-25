/**
 * 단순 정적 파일 서버 — "서버 의존 없음"의 증명 도구 (구현 계획 8단계).
 * apps/site/out을 그대로 서빙하고, 없는 주소는 404.html을 404 상태로 돌려준다
 * (Cloudflare Pages와 같은 동작).
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "site", "out");
const port = Number(process.argv[2] ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const candidates = clean.endsWith("/")
    ? [join(outDir, clean, "index.html")]
    : [join(outDir, clean), join(outDir, `${clean}.html`), join(outDir, clean, "index.html")];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

createServer((req, res) => {
  const file = resolve(req.url ?? "/");
  if (file) {
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
    return;
  }
  const notFound = join(outDir, "404.html");
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  res.end(existsSync(notFound) ? readFileSync(notFound) : "not found");
}).listen(port, () => {
  console.log(`serving ${outDir} on http://127.0.0.1:${port}`);
});
