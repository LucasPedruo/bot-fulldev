import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../config/env.js";
import { buildGroupIntroduction, resolveGroupRole } from "./group-introduction.js";

const eixoGroup = "120363162047367350@g.us";
const eventsGroup = "120363413125773406@g.us";
const networkingGroup = "120363306015581649@g.us";
const outsideGroup = "120363000000000099@g.us";

function withGroups(run: () => void): void {
  const original = { ...env };
  Object.assign(env, {
    WHATSAPP_EIXO_REPRESENTATIVES_GROUP: eixoGroup,
    WHATSAPP_FACULTY_EVENTS_GROUP: eventsGroup,
    WHATSAPP_NETWORKING_GROUP_1: networkingGroup
  });

  try {
    run();
  } finally {
    Object.assign(env, original);
  }
}

void test("resolves each group to its role", () => {
  withGroups(() => {
    assert.equal(resolveGroupRole(eixoGroup), "relay_source");
    assert.equal(resolveGroupRole(eventsGroup), "relay_destination");
    assert.equal(resolveGroupRole(networkingGroup), "community");
    assert.equal(resolveGroupRole(outsideGroup), "external");
  });
});

void test("an unconfigured group never resolves to a relay role by accident", () => {
  const original = { ...env };
  Object.assign(env, { WHATSAPP_EIXO_REPRESENTATIVES_GROUP: "", WHATSAPP_FACULTY_EVENTS_GROUP: "" });

  try {
    // An empty setting must not make the empty string match anything.
    assert.equal(resolveGroupRole(""), "external");
  } finally {
    Object.assign(env, original);
  }
});

void test("tells the professors their announcements are forwarded elsewhere", () => {
  const text = buildGroupIntroduction("relay_source");

  // The whole reason the bot is in that group; leaving it implicit would be wrong.
  assert.match(text, /resumo/i);
  assert.match(text, /Eventos e oportunidades/);
  assert.match(text, /admin/i);
  // It must also say it will not chat there, since the relay only ever reads.
  assert.match(text, /única mensagem/i);
});

void test("tells the students where the summaries come from and not to trust invented data", () => {
  const text = buildGroupIntroduction("relay_destination");

  assert.match(text, /representantes de eixo/i);
  assert.match(text, /data, horário, local, link/i);
  assert.match(text, /não invento/i);
  // The mention-reply listener only runs in the networking groups, so the introduction must not
  // promise a reply it will never give.
  assert.ok(!/marcar com @/i.test(text));
  assert.match(text, /não respondo mensagens/i);
});

void test("the community greeting stays short and skips the pitch", () => {
  const text = buildGroupIntroduction("community");

  assert.match(text, /Quackson/);
  assert.ok(!text.includes("grupo independente de desenvolvedores"));
});

void test("an outside group gets the full community presentation", () => {
  const text = buildGroupIntroduction("external");

  assert.match(text, /Quackson/);
  assert.ok(text.includes("grupo independente de desenvolvedores"));
});

void test("every introduction names the bot and uses no markdown", () => {
  for (const role of ["relay_source", "relay_destination", "community", "external"] as const) {
    const text = buildGroupIntroduction(role);

    assert.match(text, /Quackson/, `role ${role} does not name the bot`);
    assert.ok(!text.includes("**"), `role ${role} leaks markdown`);
    assert.ok(text.length > 0);
  }
});
