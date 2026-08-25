import { notFound } from "next/navigation";
import { StyleGuide } from "./guide";

/**
 * 스타일 가이드 (구현 계획 7단계 통과 조건).
 * 미리보기 모드에서만 열린다 — 공개 산출물에는 실리지 않는다.
 */
export default function StyleGuidePage() {
  if (process.env.OPENCOURSE_PREVIEW !== "1") notFound();
  return <StyleGuide />;
}
