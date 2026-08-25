import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMachineCheck } from "./machine-check/run.js";
import { writeFixtureCourse } from "./fixture.js";
import { canPublish } from "./can-publish.js";
import type { DefectCode } from "./schemas/machine-check.js";

const NOW = "2026-08-25T13:00:00+09:00";

/** 고정 교재를 만들고, 변형을 가한 뒤, 검사 결과를 돌려준다. */
function check(mutate?: (courseDir: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "oc-mc-"));
  try {
    const { courseDir, standardsDir } = writeFixtureCourse(root);
    if (mutate) mutate(courseDir);
    return runMachineCheck(courseDir, standardsDir, { now: NOW, dryRun: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function editJson(courseDir: string, rel: string, fn: (doc: Record<string, unknown>) => void) {
  const p = join(courseDir, rel);
  const doc = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  fn(doc);
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
}

function codes(result: { defects: { code: DefectCode }[] }): Set<DefectCode> {
  return new Set(result.defects.map((d) => d.code));
}

test("정상 교재는 결함 0건으로 통과한다 (17개 규칙 전부의 통과 픽스처)", () => {
  const r = check();
  assert.deepEqual(r.defects, []);
  assert.equal(r.pass, true);
  assert.equal(r.blocker_count, 0);
  assert.equal(r.warning_count, 0);
});

test("같은 입력에 두 번 돌리면 같은 판정이 나온다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-mc-idem-"));
  try {
    const { courseDir, standardsDir } = writeFixtureCourse(root);
    const a = runMachineCheck(courseDir, standardsDir, { now: NOW, dryRun: true });
    const b = runMachineCheck(courseDir, standardsDir, { now: NOW, dryRun: true });
    assert.deepEqual(a, b);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ST01: 필수 항목이 비면 차단", () => {
  const r = check((d) => editJson(d, "course.json", (c) => (c.title = "")));
  assert.ok(codes(r).has("ST01"));
  assert.equal(r.pass, false);
});

test("ST01: 소단원 머리말에 summary가 없으면 차단", () => {
  const r = check((d) => {
    const p = join(d, "chapters/01-intro/01.mdx");
    writeFileSync(p, readFileSync(p, "utf8").replace(/summary: .*/u, "summary:"));
  });
  assert.ok(codes(r).has("ST01"));
});

test("ST02: 출처 주소가 없으면 차단", () => {
  const r = check((d) =>
    editJson(d, "review/source-map.json", (s) => {
      (s.sources as Record<string, unknown>[])[0]!.url = null;
    }),
  );
  assert.ok(codes(r).has("ST02"));
});

test("ST03: 출처 확인 시각이 없으면 차단", () => {
  const r = check((d) =>
    editJson(d, "review/source-map.json", (s) => {
      (s.sources as Record<string, unknown>[])[0]!.fetched_at = null;
    }),
  );
  assert.ok(codes(r).has("ST03"));
});

test("ST04: 사용 조건이 없으면 차단", () => {
  const r = check((d) =>
    editJson(d, "review/source-map.json", (s) => {
      (s.sources as Record<string, unknown>[])[0]!.license = "";
    }),
  );
  assert.ok(codes(r).has("ST04"));
});

test("ST05: 표기 의무 라이선스인데 attribution_required가 아니면 차단", () => {
  const r = check((d) =>
    editJson(d, "review/source-map.json", (s) => {
      (s.sources as Record<string, unknown>[])[0]!.attribution_required = false;
    }),
  );
  assert.ok(codes(r).has("ST05"));
});

test("ST06: 미디어 사용 사유가 없으면 경고 (발행은 막지 않음)", () => {
  const r = check((d) =>
    editJson(d, "chapters/01-intro/media.json", (m) => {
      (m.items as Record<string, unknown>[])[0]!.purpose = null;
    }),
  );
  assert.ok(codes(r).has("ST06"));
  assert.equal(r.pass, true); // 경고뿐이면 통과
  assert.ok(r.warning_count >= 1);
});

test("ST07: 미확인·추정값 문구가 본문에 남으면 차단", () => {
  const r = check((d) =>
    appendFileSync(join(d, "chapters/01-intro/01.mdx"), "\n이 수치는 추정값이다.\n"),
  );
  assert.ok(codes(r).has("ST07"));
});

test("ST08: 채점 기준이 비면 경고", () => {
  const r = check((d) => editJson(d, "review/rubric.json", (rb) => (rb.criteria = [])));
  assert.ok(codes(r).has("ST08"));
  assert.equal(r.pass, true);
});

test("ST09: 수동 검토 차단 항목이 미처리면 차단", () => {
  const r = check((d) =>
    editJson(d, "review/manual-review.json", (m) => {
      const item = (m.items as Record<string, unknown>[]).find((i) => i.code === "MR02")!;
      item.status = "pending";
      item.actor = null;
      item.at = null;
      item.note = null;
    }),
  );
  assert.ok(codes(r).has("ST09"));
});

test("ST10: 인포그래픽 대체 설명이 없으면 차단", () => {
  const r = check((d) =>
    editJson(d, "chapters/01-intro/media.json", (m) => {
      (m.items as Record<string, unknown>[])[0]!.alt = null;
    }),
  );
  assert.ok(codes(r).has("ST10"));
});

test("ST11: 자막도 나레이션 요약도 없으면 차단", () => {
  const r = check((d) => {
    writeFileSync(join(d, "chapters/01-intro/captions.vtt"), "WEBVTT\n");
    editJson(d, "chapters/01-intro/timeline.json", (t) => {
      (t.scenes as Record<string, unknown>[])[0]!.narration = "";
    });
  });
  assert.ok(codes(r).has("ST11"));
});

test("SC01: 뒤에서 다룬다고 하고 다루지 않으면 차단", () => {
  const r = check((d) =>
    appendFileSync(join(d, "chapters/02-practice/01.mdx"), "\n상태관리는 뒤에서 자세히 다룬다.\n"),
  );
  assert.ok(codes(r).has("SC01"));
});

test("SC01: 예고한 주제를 이후에 실제로 다루면 결함이 아니다", () => {
  const r = check((d) => {
    appendFileSync(join(d, "chapters/01-intro/01.mdx"), "\n상태관리는 뒤에서 자세히 다룬다.\n");
    appendFileSync(
      join(d, "chapters/02-practice/01.mdx"),
      "\n상태관리는 값을 기억하는 방법이다.\n",
    );
  });
  assert.equal(codes(r).has("SC01"), false);
});

test("SC02: 앞서 다뤘다는 회수가 실제 앞이 아니면 차단", () => {
  const r = check((d) =>
    appendFileSync(
      join(d, "chapters/01-intro/01.mdx"),
      "\n앞서 3장에서 배운 내용을 떠올려 보자.\n",
    ),
  );
  assert.ok(codes(r).has("SC02"));
});

test("SC03: 문틀 시제가 미래형과 과거형으로 갈리면 경고", () => {
  const r = check((d) => {
    appendFileSync(
      join(d, "chapters/01-intro/01.mdx"),
      "\n당신은 [문제]와 [고객]을 작성할 것이다.\n",
    );
    appendFileSync(
      join(d, "chapters/02-practice/01.mdx"),
      "\n당신은 [문제]와 [고객]을 작성했다.\n",
    );
  });
  assert.ok(codes(r).has("SC03"));
  assert.equal(r.pass, true);
});

test("SC04: 긴 문장이 다른 파일에 그대로 반복되면 경고", () => {
  const sentence = "\n이 문장은 두 챕터에 똑같이 반복되어 중복 검사에 걸리는 확인용 문장이다.\n";
  const r = check((d) => {
    appendFileSync(join(d, "chapters/01-intro/01.mdx"), sentence);
    appendFileSync(join(d, "chapters/02-practice/01.mdx"), sentence);
  });
  assert.ok(codes(r).has("SC04"));
});

test("SC05: 라틴 용어의 표기가 흔들리면 경고", () => {
  const r = check((d) => {
    appendFileSync(join(d, "chapters/01-intro/01.mdx"), "\nFlutter 프레임워크를 쓴다.\n");
    appendFileSync(join(d, "chapters/02-practice/01.mdx"), "\nflutter 프레임워크를 쓴다.\n");
  });
  assert.ok(codes(r).has("SC05"));
});

test("SC06: 뒤 챕터에서 정의한 용어를 앞 챕터가 먼저 쓰면 차단", () => {
  const r = check((d) =>
    appendFileSync(join(d, "chapters/02-practice/01.mdx"), "\n위젯이란 화면을 이루는 부품이다.\n"),
  );
  // 01장 본문이 "위젯은 …"으로 이미 쓰고 있는데 정의는 02장에 있다
  assert.ok(codes(r).has("SC06"));
});

test("끝에서 끝: 검사기가 쓴 판정으로 canPublish가 통과한다", () => {
  const root = mkdtempSync(join(tmpdir(), "oc-mc-e2e-"));
  try {
    const { courseDir, standardsDir } = writeFixtureCourse(root);
    const result = runMachineCheck(courseDir, standardsDir, { now: NOW }); // 파일로 쓴다
    assert.equal(result.pass, true);
    const gate = canPublish(courseDir, standardsDir);
    assert.deepEqual(gate, { ok: true, reasons: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
