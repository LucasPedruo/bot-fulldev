import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDevToMessage } from "./devto.provider.js";

void test("formatDevToMessage includes the title and url", () => {
  const message = formatDevToMessage({ title: "Why TypeScript Rocks", url: "https://dev.to/example/why-typescript-rocks" });

  assert.match(message, /Why TypeScript Rocks/);
  assert.match(message, /https:\/\/dev\.to\/example\/why-typescript-rocks/);
});
