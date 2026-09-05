import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnv } from "./env.js";

const baseEnv = {
  DATABASE_URL: "postgres://fulldev:fulldev@localhost:5432/fulldev_bot"
};

void test("loadEnv applies defaults and timezone", () => {
  const env = loadEnv(baseEnv);

  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.TZ, "America/Sao_Paulo");
  assert.equal(env.PORT, 3000);
  assert.equal(process.env.TZ, "America/Sao_Paulo");
});

void test("loadEnv validates HH:mm schedule values", () => {
  assert.throws(
    () =>
      loadEnv({
        ...baseEnv,
        NETWORKING_MORNING_TIME: "8:00"
      }),
    /Invalid environment configuration/
  );
});

void test("loadEnv parses boolean env flags explicitly", () => {
  const env = loadEnv({
    ...baseEnv,
    WHATSAPP_AUTO_CONNECT: "false"
  });

  assert.equal(env.WHATSAPP_AUTO_CONNECT, false);
});

void test("loadEnv requires DATABASE_URL in production", () => {
  assert.throws(
    () =>
      loadEnv({
        NODE_ENV: "production"
      }),
    /Invalid environment configuration/
  );
});
