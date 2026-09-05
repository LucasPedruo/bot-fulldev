import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";

void test("GET /health returns ok", async () => {
  const app = buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json<{ status: string }>();
  assert.equal(payload.status, "ok");

  await app.close();
});
