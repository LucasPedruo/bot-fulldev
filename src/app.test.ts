import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";
import type { DailyStats } from "./stats/stats.service.js";

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

void test("GET /public/status reports connection state and today's activity", async () => {
  const dailyStats: DailyStats = {
    jobsDiscovered: 3,
    jobsSent: 2,
    eventsDiscovered: 1,
    eventsSent: 1,
    eventRemindersSent: 0,
    networkingMessagesSent: 4,
    failedMessages: 0
  };

  const app = buildApp({
    getWhatsAppStatus: () => "connected",
    computeDailyStats: () => Promise.resolve(dailyStats)
  });

  const response = await app.inject({
    method: "GET",
    url: "/public/status"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json<{
    whatsapp: { status: string; online: boolean };
    today: DailyStats;
  }>();
  assert.equal(payload.whatsapp.status, "connected");
  assert.equal(payload.whatsapp.online, true);
  assert.deepEqual(payload.today, dailyStats);

  await app.close();
});

void test("GET /public/status reports offline when WhatsApp is logged out", async () => {
  const app = buildApp({
    getWhatsAppStatus: () => "logged_out",
    computeDailyStats: () =>
      Promise.resolve({
        jobsDiscovered: 0,
        jobsSent: 0,
        eventsDiscovered: 0,
        eventsSent: 0,
        eventRemindersSent: 0,
        networkingMessagesSent: 0,
        failedMessages: 0
      })
  });

  const response = await app.inject({
    method: "GET",
    url: "/public/status"
  });

  const payload = response.json<{ whatsapp: { status: string; online: boolean } }>();
  assert.equal(payload.whatsapp.status, "logged_out");
  assert.equal(payload.whatsapp.online, false);

  await app.close();
});
