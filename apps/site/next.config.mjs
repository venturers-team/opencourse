/** 정적 출력 — 서버 없이 파일만 내보낸다 (docs/03).
 *  OPENCOURSE_PREVIEW=1 이면 로컬 미리보기 모드: 초안·숨김을 배너와 함께 보여 준다.
 *  미리보기 모드에서는 정적 출력(export)을 켜지 않는다 — 초안이 산출물에 들어갈 수 없다. */
const preview = process.env.OPENCOURSE_PREVIEW === "1";
const nextConfig = {
  ...(preview ? {} : { output: "export" }),
  images: { unoptimized: true },
  transpilePackages: ["@opencourse/ui"],
  env: { OPENCOURSE_PREVIEW: preview ? "1" : "" },
};
export default nextConfig;
