import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_VERSION } from "./index.js";

test("계약 스키마 버전은 1이다", () => {
  assert.equal(SCHEMA_VERSION, 1);
});
