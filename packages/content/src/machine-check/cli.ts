#!/usr/bin/env node
import { resolve } from "node:path";
import { runMachineCheck } from "./run.js";

/** 사용법: pnpm check <교재-슬러그> — 저장소 루트에서 실행한다. */
const slug = process.argv[2];
if (!slug) {
  console.error("사용법: pnpm check <교재-슬러그>");
  process.exit(1);
}
const root = process.cwd();
const courseDir = resolve(root, "content", "courses", slug);
const standardsDir = resolve(root, "content", "standards");

const result = runMachineCheck(courseDir, standardsDir);
console.log(
  `${slug}: ${result.pass ? "기계 검사 통과" : "기계 검사 실패"} (차단 ${result.blocker_count}건, 경고 ${result.warning_count}건)`,
);
for (const d of result.defects) {
  const where = d.line ? `${d.path}:${d.line}` : d.path;
  console.log(`  [${d.grade}] ${d.code} ${where} — ${d.message}`);
}
console.log(`판정을 review/machine-check.json에 남겼습니다.`);
if (!result.pass) process.exit(1);
