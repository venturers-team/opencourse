# 오픈코스 — 에이전트 하네스

주제를 입력하면 AI가 웹 교재를 만들고, 세 검수를 통과한 것만 발행되는 서비스다.

## 세션을 시작하면 먼저

1. `ops/STATUS.md`를 읽는다 — 교재별 상태, 진행 중 작업, 다음 할 일이 담긴 자동 생성 보드다. **아직 없으면 구현 계획 6단계 전이라는 뜻이니 `docs/08-구현-계획.md`의 변경 기록으로 현재 위치를 파악한다.**
2. 상태 요약을 사용자에게 먼저 보인다.

## 지도

| 자리 | 무엇 |
| --- | --- |
| `docs/01`~`07` | 제품·아키텍처·화면·게이트·운영·보안 설계 |
| `docs/08-구현-계획.md` | 개발 12작업과 통과 조건. **변경 기록이 프로젝트 연대기다** |
| `docs/10-생성-파이프라인.md` | 교재 생성 12단계 (S1~S12) |
| `docs/11-콘텐츠-계약-스키마.md` | **모든 JSON 파일의 필드 정의 정본.** 코드가 이 문서를 따른다 |
| `docs/12-공개-사이트-IA.md` | 공개 사이트 IA. 디자인 정본은 Claude Design 프로젝트 |
| `content/standards/` | 검수 기준 다섯 문서 — 게이트가 판정에 쓰는 실제 입력 |
| `content/courses/<슬러그>/` | 교재 한 권 (본문 `chapters/`, 검수 기록 `review/`) |
| `packages/content` | 계약 스키마·검증기·지문·`canPublish` |
| `apps/site` | 공개 사이트 (Next.js 정적 출력) — 8단계 |
| `skills/opencourse` | 생성 스킬 — 3단계 |
| `ops/runs/` | 작업 기록. 지표 셋의 원천 |

## 규칙

- 검수 판정 파일(`review/*.json`)을 손으로 고치지 않는다. 도구가 쓴다
- `course.json`의 `status`를 직접 발행으로 바꾸지 않는다. 발행 명령이 게이트를 확인한 뒤 바꾼다 (빌드가 어차피 거른다)
- 본문에 R2 URL을 직접 쓰지 않는다. 미디어는 식별자로 참조하고 URL은 `media.json`에만 둔다
- 계약(스키마)을 바꾸려면 `docs/11`을 먼저 고치고 08 변경 기록에 남긴다

## 명령

```bash
pnpm install / build / test / typecheck        # 개발 기본
pnpm status [슬러그]    # 교재·게이트·지표·미커밋 요약 (+보드 갱신)
pnpm metrics            # 세 지표 JSON
pnpm board              # ops/STATUS.md 재생성
pnpm board:check        # 보드가 낡았는지 검사 (CI에서도 돈다)
pnpm course create|status|preflight|register|publish|hide|render   # 생성 파이프라인 (S1~S12, render=S7 PNG)
pnpm check <슬러그>     # 기계 검사 (정적+구조)
pnpm ops manual|exception|media|styles|builds   # 수동 검토·예외 승인·자산·스타일·월별 빌드
pnpm e2e                # 공개 사이트 E2E (미리보기 차단 증명 + Playwright 11건)
```

상태를 바꾸는 명령은 보드를 자동 재생성한다. 보드가 낡으면 CI가 실패한다.
