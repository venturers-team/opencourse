import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SentenceReviewSession } from "./sentence-session.js";
import { SectionReviewSession } from "./section-session.js";

/**
 * 저장이 검수에 미치는 영향 (docs/04 화면 8 요구사항).
 * 본문을 고쳐 저장한 직후, 몇 개의 판정이 무효가 되었고 어디부터 다시
 * 검수해야 하는지를 알려 준다 — 이 안내가 없으면 관리자는 작은 수정 하나가
 * 검수 회차 전체를 되돌린다는 사실을 모른 채 여러 번 고치게 된다.
 */
export interface EditImpact {
  sentenceInvalidated: number;
  sectionInvalidated: number;
  resumeFromUnit: string | null;
  resumeFromChapter: string | null;
  messages: string[];
}

function countInvalidated(courseDir: string, file: string): number {
  const p = join(courseDir, "review", file);
  if (!existsSync(p)) return 0;
  const doc = JSON.parse(readFileSync(p, "utf8")) as { reviews?: { invalidated?: boolean }[] };
  return (doc.reviews ?? []).filter((r) => r.invalidated).length;
}

export function editImpact(courseDir: string, standardsDir: string): EditImpact {
  const beforeSentence = countInvalidated(courseDir, "sentence-review.json");
  const beforeSection = countInvalidated(courseDir, "section-review.json");

  const hasSentence = existsSync(join(courseDir, "review", "sentence-review.json"));
  const hasSection = existsSync(join(courseDir, "review", "section-review.json"));

  let resumeFromUnit: string | null = null;
  let sentenceInvalidated = 0;
  if (hasSentence) {
    const session = SentenceReviewSession.open(courseDir, standardsDir);
    sentenceInvalidated = session.invalidatedCount() - beforeSentence;
    const progress = session.progress();
    if (progress.reviewed < progress.total) {
      // 다음 판정 대상이 재개 지점이다 (회차가 없어도 위치는 알 수 있다)
      resumeFromUnit = `판정 ${progress.reviewed + 1}번째 문장부터 (${progress.total}개 중)`;
    }
  }

  let resumeFromChapter: string | null = null;
  let sectionInvalidated = 0;
  if (hasSection) {
    const session = SectionReviewSession.open(courseDir, standardsDir);
    sectionInvalidated = session.invalidatedCount() - beforeSection;
    const progress = session.progress();
    if (progress.reviewed < progress.total) {
      resumeFromChapter = `섹션 검수 ${progress.reviewed + 1}번째 챕터부터`;
    }
  }

  const messages: string[] = [];
  if (sentenceInvalidated > 0) {
    messages.push(`문장 판정 ${sentenceInvalidated}건이 무효가 되었습니다`);
  }
  if (sectionInvalidated > 0) {
    messages.push(`섹션 판정 ${sectionInvalidated}건이 무효가 되었습니다`);
  }
  if (resumeFromUnit) messages.push(`${resumeFromUnit} 다시 검수해야 합니다`);
  if (resumeFromChapter) messages.push(`${resumeFromChapter} 다시 검수해야 합니다`);
  if (messages.length === 0) messages.push("무효가 된 판정이 없습니다");

  return { sentenceInvalidated, sectionInvalidated, resumeFromUnit, resumeFromChapter, messages };
}
