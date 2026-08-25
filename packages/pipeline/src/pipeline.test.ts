import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFixtureCourse, CourseSchema } from "@opencourse/content";
import { slugify } from "./slug.js";
import { DEFAULT_THRESHOLDS, loadThresholds, preflight } from "./thresholds.js";
import { RunRecorder } from "./run-recorder.js";
import { createCourse, courseStatus, repoPaths, setStatus } from "./lifecycle.js";
import { registerDraft } from "./draft-register.js";
import { LocalMediaBackend } from "./media/backend.js";
import { synthesizeVerified, transcriptSimilarity, type SynthAdapter } from "./media/synth.js";

const NOW = "2026-08-25T14:00:00+09:00";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("슬러그: 한글 제목을 로마자 표기법으로 옮긴다", () => {
  assert.equal(slugify("위젯 트리 이해"), "wijet-teuri-ihae");
  assert.equal(slugify("Flutter 앱개발"), "flutter-aepgaebal");
  assert.equal(slugify("완전 초보!"), "wanjeon-chobo");
});

test("슬러그: 같은 슬러그가 있으면 연번을 붙인다", () => {
  const existing = new Set(["wijet-teuri-ihae", "wijet-teuri-ihae-2"]);
  assert.equal(slugify("위젯 트리 이해", existing), "wijet-teuri-ihae-3");
});

test("임계치: 파일이 없으면 기본값으로 돌되 그 사실을 알린다", () => {
  const loaded = loadThresholds("/없는/경로/thresholds.json");
  assert.equal(loaded.usedDefaults, true);
  assert.ok(loaded.notice?.includes("기본값"));
  assert.deepEqual(loaded.thresholds, DEFAULT_THRESHOLDS);
});

test("실행 전 점검: 다섯 값 각각의 초과가 보류 사유가 된다", () => {
  const loaded = { thresholds: DEFAULT_THRESHOLDS, usedDefaults: false, notice: null };
  const base = {
    plannedSections: 8,
    maxPlannedSectionChars: 2500,
    plannedOverviewSeconds: 80,
    activeJobs: 0,
    freeStorageGB: 5,
  };
  assert.equal(preflight(base, loaded).ok, true);
  assert.ok(preflight({ ...base, plannedSections: 16 }, loaded).violations[0]?.includes("섹션 수"));
  assert.ok(
    preflight({ ...base, maxPlannedSectionChars: 3500 }, loaded).violations[0]?.includes("분량"),
  );
  assert.ok(
    preflight({ ...base, plannedOverviewSeconds: 91 }, loaded).violations[0]?.includes("영상"),
  );
  assert.ok(preflight({ ...base, activeJobs: 2 }, loaded).violations[0]?.includes("동시 실행"));
  assert.ok(preflight({ ...base, freeStorageGB: 0.5 }, loaded).violations[0]?.includes("용량"));
});

test("작업 기록: 단계별 시각과 실패한 단계가 파일로 남는다", async () => {
  const root = tmp("oc-run-");
  try {
    let tick = 0;
    const clock = () => new Date(Date.parse(NOW) + tick++ * 1000);
    const recorder = new RunRecorder(root, "01J0000000000000000000000A", "generate", "test", clock);
    await recorder.stage("S1", () => "ok");
    await assert.rejects(
      recorder.stage("S2", () => {
        throw new Error("고의 실패");
      }),
    );
    const doc = recorder.finish();
    assert.equal(doc.status, "failed");
    assert.equal(doc.failed_stage, "S2");
    assert.equal(doc.stages.length, 2);
    assert.equal(doc.stages[0]?.status, "success");
    assert.equal(doc.stages[1]?.error, "고의 실패");
    assert.ok(existsSync(join(root, `${doc.run_id}.json`)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeRepo(): { root: string; paths: ReturnType<typeof repoPaths> } {
  const root = tmp("oc-repo-");
  const paths = repoPaths(root);
  mkdirSync(paths.coursesDir, { recursive: true });
  mkdirSync(paths.standardsDir, { recursive: true });
  // 기준 문서 최소본
  writeFileSync(join(paths.standardsDir, "review-protocol.md"), "# p\n");
  writeFileSync(join(paths.standardsDir, "beginner-baseline.md"), "# b\n");
  writeFileSync(join(paths.standardsDir, "scoring-rules.md"), "# s\n");
  writeFileSync(join(paths.standardsDir, "manual-review-items.md"), "# m\n");
  writeFileSync(
    join(paths.standardsDir, "thresholds.json"),
    JSON.stringify(DEFAULT_THRESHOLDS, null, 2),
  );
  return { root, paths };
}

const CREATE_INPUT = {
  title: "위젯 트리 이해",
  topic: "Flutter 위젯 트리",
  audience: "비전공자",
  difficulty: "beginner" as const,
  contentStyle: "차분한 설명체",
  learningOutcomes: ["위젯 트리를 읽을 수 있다"],
  prerequisites: [],
  estimatedMinutes: 60,
  styleVersion: "v1",
  runId: "gen-test-202608251400",
  now: NOW,
};

test("수명주기: 생성 → 상태 요약 → 발행 거부(증거 없음) → 숨김", () => {
  const { root, paths } = makeRepo();
  try {
    const { slug, dir } = createCourse(paths, CREATE_INPUT);
    assert.equal(slug, "wijet-teuri-ihae");
    const course = CourseSchema.parse(JSON.parse(readFileSync(join(dir, "course.json"), "utf8")));
    assert.equal(course.status, "generating");
    assert.equal(course.prerequisites[0], "없음");

    const status = courseStatus(paths, slug);
    assert.equal(status.status, "generating");
    assert.equal(status.gate.ok, false);
    assert.ok(status.nextActions.length > 0 && status.recommended.length > 0);

    // 검수 증거 없이 발행 시도 → 이유와 함께 거부
    const publish = setStatus(paths, slug, "published", NOW);
    assert.equal(publish.ok, false);
    assert.ok(publish.reasons.length >= 3);
    const after = CourseSchema.parse(JSON.parse(readFileSync(join(dir, "course.json"), "utf8")));
    assert.equal(after.status, "generating"); // 바뀌지 않았다

    // 숨김은 게이트와 무관
    assert.equal(setStatus(paths, slug, "hidden", NOW).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("수명주기: 같은 제목을 두 번 만들면 슬러그에 연번이 붙는다", () => {
  const { root, paths } = makeRepo();
  try {
    assert.equal(createCourse(paths, CREATE_INPUT).slug, "wijet-teuri-ihae");
    assert.equal(createCourse(paths, CREATE_INPUT).slug, "wijet-teuri-ihae-2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("초안 등록: 전부 아니면 무 — 산출물이 빠지면 상태가 바뀌지 않는다", () => {
  const root = tmp("oc-reg-");
  try {
    const { courseDir, standardsDir } = writeFixtureCourse(root, {
      statusOverride: "generating",
    });
    rmSync(join(courseDir, "chapters/01-intro/timeline.json"));
    const refused = registerDraft(courseDir, standardsDir, { now: NOW });
    assert.equal(refused.ok, false);
    assert.ok(refused.missing.some((m) => m.includes("timeline.json")));
    const course = CourseSchema.parse(
      JSON.parse(readFileSync(join(courseDir, "course.json"), "utf8")),
    );
    assert.equal(course.status, "generating"); // 등록되지 않았다
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("초안 등록: 산출물이 완비되면 draft로 바뀌고 기계 검사가 자동으로 돈다", () => {
  const root = tmp("oc-reg2-");
  try {
    const { courseDir, standardsDir } = writeFixtureCourse(root, {
      statusOverride: "generating",
    });
    const result = registerDraft(courseDir, standardsDir, { now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.machineCheck?.pass, true);
    const course = CourseSchema.parse(
      JSON.parse(readFileSync(join(courseDir, "course.json"), "utf8")),
    );
    assert.equal(course.status, "draft");
    assert.ok(existsSync(join(courseDir, "review/machine-check.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("미디어 백엔드: 업로드 후 URL·지문·응답 확인", async () => {
  const root = tmp("oc-media-");
  try {
    const src = join(root, "fig.png");
    writeFileSync(src, "png-bytes");
    const backend = new LocalMediaBackend(join(root, "store"));
    const uploaded = await backend.upload(src, "media/01-intro/fig-01.png");
    assert.ok(uploaded.url.startsWith("https://"));
    assert.equal(uploaded.bytes, 9);
    assert.equal(await backend.verify(uploaded), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("재전사 유사도: 문장부호·공백에 강인하고 다른 문장은 낮다", () => {
  assert.equal(transcriptSimilarity("위젯은 부품이다.", "위젯은 부품이다"), 1);
  assert.ok(transcriptSimilarity("위젯은 부품이다.", "위젯은, 부품이다!") > 0.9);
  assert.ok(transcriptSimilarity("위젯은 부품이다.", "전혀 다른 이야기") < 0.3);
});

test("음성 검증: 불합격 장면만 재합성하고 상한을 넘으면 실패한다", async () => {
  let calls = 0;
  const flaky: SynthAdapter = {
    synthesize: async () => {
      calls += 1;
    },
    transcribe: async () => (calls >= 2 ? "위젯은 부품이다" : "웅얼웅얼"),
  };
  const ok = await synthesizeVerified(flaky, "위젯은 부품이다.", "/tmp/x.mp3", 3);
  assert.equal(ok.attempts, 2);
  assert.ok(ok.similarity >= 0.65);

  const broken: SynthAdapter = {
    synthesize: async () => {},
    transcribe: async () => "완전히 다른 소리",
  };
  await assert.rejects(
    synthesizeVerified(broken, "위젯은 부품이다.", "/tmp/x.mp3", 2),
    /음성 검증 실패/u,
  );
});
