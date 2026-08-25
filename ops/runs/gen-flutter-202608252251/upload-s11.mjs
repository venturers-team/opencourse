/**
 * S11 — 모든 미디어가 로컬에서 완성·검증된 뒤 일괄 업로드하고 URL을 media.json에만 기록.
 * 백엔드는 환경으로 선택(mediaBackendFromEnv) — 지금은 로컬 폴더, 9단계에서 R2로 전환.
 * timeline.json·captions.vtt는 저장소 파일이므로 챕터 폴더로 복사한다.
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mediaBackendFromEnv } from "../../../packages/pipeline/dist/index.js";
import { MediaManifestSchema } from "../../../packages/content/dist/index.js";

const runDir = new URL(".", import.meta.url).pathname;
const root = join(runDir, "../../..");
const courseDir = join(root, "content/courses/baibeu-kodingeuro-baeuneun-flutter-cheotgeoleum");
const backend = mediaBackendFromEnv(join(root, "ops/media-local"));
const now = new Date().toISOString().replace(/\.\d+Z$/u, "Z");

const FIGS = {
  "01-vibe-coding": [["fig-01", "ch1-fig-01.png",
    "사람이 원하는 화면을 말로 설명하면 AI 코딩 도구가 코드를 만들고 그 코드가 앱이 되는 관계를 나타낸 그림. 학습자는 결과를 읽고 확인한 뒤 고쳐 달라고 다시 말하는 화살표로 되돌아간다.",
    "말로 부탁하고 읽고 고치는 바이브 코딩의 순환을 한눈에 보게 한다"]],
  "02-first-project": [["fig-01", "ch2-fig-01.png",
    "Flutter 프로젝트 폴더의 지도. lib 폴더 안의 main.dart가 우리가 읽고 고치는 파일로 강조되어 있고, pubspec.yaml은 앱의 이름표와 부품 목록, android와 ios 폴더는 지금 열지 않아도 되는 방으로 표시되어 있다.",
    "폴더가 많아도 기억할 곳은 하나뿐임을 지도로 안심시킨다"]],
  "03-widget-tree": [
    ["fig-01", "ch3-fig-01.png",
      "첫 화면의 위젯 트리. MaterialApp이 Scaffold를 품고, Scaffold가 AppBar와 Center를 품으며, AppBar 아래에 Text '나의 첫 앱', Center 아래에 Text '안녕, Flutter!'가 잎으로 매달려 있다.",
      "코드와 같은 구조의 트리를 눈으로 확인하게 한다"],
    ["fig-02", "ch3-fig-02.png",
      "버튼 추가 전후의 트리 비교. 왼쪽(바꾸기 전)은 Center가 Text 하나를 품고, 오른쪽(바꾼 뒤)은 Center가 Column을 품고 Column이 Text와 ElevatedButton 두 자식을 나란히 품는다.",
      "자식이 둘이 될 때 Column이 필요한 이유를 전후 비교로 보게 한다"]],
  "04-state": [["fig-01", "ch4-fig-01.png",
    "setState가 화면을 다시 그리는 흐름. 버튼을 탭하면 setState가 상태를 바꾸고, build가 다시 실행되어 새 화면이 나타나는 네 단계가 화살표로 이어져 있다.",
    "setState에서 새 화면까지의 인과 사슬을 시각화한다"]],
  "05-wrap-up": [["fig-01", "ch5-fig-01.png",
    "프로필 카드의 위젯 트리. Card가 Column을 품고, Column이 CircleAvatar, 이름 Text, 한 줄 소개 Text 세 자식을 세로로 쌓는다.",
    "실습 목표물의 구조를 종이에 옮겨 그릴 수 있게 한다"]],
};

for (const [chapter, figs] of Object.entries(FIGS)) {
  const audioDir = join(runDir, "audio", chapter);
  const timeline = JSON.parse(readFileSync(join(audioDir, "timeline.json"), "utf8"));
  const items = [];

  for (const [id, file, alt, purpose] of figs) {
    const local = join(runDir, "figures", file);
    const up = await backend.upload(local, `media/${chapter}/${id}.png`);
    if (!(await backend.verify(up))) throw new Error(`업로드 검증 실패: ${up.key}`);
    items.push({
      id, kind: "infographic", alt, purpose,
      source: `ops/runs/gen-flutter-202608252251/figures/${file}`,
      r2_key: up.key, url: up.url, bytes: up.bytes, sha256: up.sha256,
      uploaded_at: now, status: "active", cleanup_marked_at: null,
    });
  }

  const aud = await backend.upload(join(audioDir, "aud-01.mp3"), `media/${chapter}/aud-01.mp3`);
  if (!(await backend.verify(aud))) throw new Error(`업로드 검증 실패: ${aud.key}`);
  items.push({
    id: "aud-01", kind: "audio", alt: null, purpose: "챕터 개요 나레이션",
    source: `ops/runs/gen-flutter-202608252251/audio/${chapter}/aud-01.mp3`,
    r2_key: aud.key, url: aud.url, bytes: aud.bytes, sha256: aud.sha256,
    uploaded_at: now, status: "active", cleanup_marked_at: null,
  });

  const manifest = {
    schema_version: 1, chapter_id: chapter, items,
    video: {
      audio_item: "aud-01", timeline_file: "timeline.json",
      captions_file: "captions.vtt", duration_sec: timeline.total_duration_sec,
    },
  };
  const parsed = MediaManifestSchema.safeParse(manifest);
  if (!parsed.success) throw new Error(`${chapter} media.json 스키마 실패: ${JSON.stringify(parsed.error.issues[0])}`);

  const chDir = join(courseDir, "chapters", chapter);
  writeFileSync(join(chDir, "media.json"), JSON.stringify(manifest, null, 2) + "\n");
  copyFileSync(join(audioDir, "timeline.json"), join(chDir, "timeline.json"));
  copyFileSync(join(audioDir, "captions.vtt"), join(chDir, "captions.vtt"));
  console.log(`${chapter}: 미디어 ${items.length}건 업로드·기록 (${timeline.total_duration_sec}s)`);
}
