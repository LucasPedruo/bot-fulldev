import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../config/env.js";
import { getGroupCapacity, parseCapacityOverrides } from "./capacity.js";

const vagas1 = "120363391901542507@g.us";
const networking = "120363306015581649@g.us";

void test("parses a list of per-group ceilings", () => {
  const overrides = parseCapacityOverrides(`${vagas1}:2000, ${networking}:1024`);

  assert.equal(overrides.get(vagas1), 2000);
  assert.equal(overrides.get(networking), 1024);
});

void test("keeps the jid intact even though it is split on a colon", () => {
  // A JID has no colon of its own, but splitting on the last one is what makes that safe.
  const overrides = parseCapacityOverrides("120363391901542507@g.us:1500");

  assert.equal(overrides.get("120363391901542507@g.us"), 1500);
});

void test("skips malformed entries instead of throwing", () => {
  // A typo in one override must not stop the bot from booting.
  const overrides = parseCapacityOverrides(`nonsense, ${vagas1}:2000, other:, :50, ${networking}:abc`);

  assert.equal(overrides.size, 1);
  assert.equal(overrides.get(vagas1), 2000);
});

void test("rejects non-positive ceilings", () => {
  assert.equal(parseCapacityOverrides(`${vagas1}:0`).size, 0);
  assert.equal(parseCapacityOverrides(`${vagas1}:-5`).size, 0);
});

void test("an empty setting yields no overrides", () => {
  assert.equal(parseCapacityOverrides("").size, 0);
  assert.equal(parseCapacityOverrides("   ").size, 0);
});

void test("falls back to the global default for a group with no override", () => {
  const original = { ...env };
  Object.assign(env, { GROUP_CAPACITY_OVERRIDES: `${vagas1}:2000`, NETWORKING_GROUP_CAPACITY: 1024 });

  try {
    // Vagas 1 already holds 1025 members; without the override the bot would refuse to approve
    // anyone and start posting the "group is full" notice.
    assert.equal(getGroupCapacity(vagas1), 2000);
    assert.equal(getGroupCapacity(networking), 1024);
  } finally {
    Object.assign(env, original);
  }
});
