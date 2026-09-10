import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../config/env.js";
import { getAllConfiguredGroupJids, getBroadcastGroupJids, isConfiguredGroup } from "./groups.js";

const eixoGroup = "120363162047367350@g.us";
const networkingGroup = "120363306015581649@g.us";
const jobsGroup = "120363391901542507@g.us";

// getConfiguredWhatsAppGroups reads the shared env object, so the tests set it directly and put
// it back afterwards.
function withGroups(overrides: Partial<typeof env>, run: () => void): void {
  const original = { ...env };
  Object.assign(env, overrides);

  try {
    run();
  } finally {
    Object.assign(env, original);
  }
}

void test("collects every configured group, read-only ones included", () => {
  withGroups(
    {
      WHATSAPP_NETWORKING_GROUP_1: networkingGroup,
      WHATSAPP_JOBS_GROUP_1: jobsGroup,
      WHATSAPP_EIXO_REPRESENTATIVES_GROUP: eixoGroup
    },
    () => {
      const all = getAllConfiguredGroupJids();

      assert.ok(all.includes(networkingGroup));
      assert.ok(all.includes(jobsGroup));
      assert.ok(all.includes(eixoGroup));
    }
  );
});

void test("never broadcasts into the representatives group", () => {
  withGroups(
    {
      WHATSAPP_NETWORKING_GROUP_1: networkingGroup,
      WHATSAPP_JOBS_GROUP_1: jobsGroup,
      WHATSAPP_EIXO_REPRESENTATIVES_GROUP: eixoGroup
    },
    () => {
      const broadcast = getBroadcastGroupJids();

      // The bot only ever reads the professors' group - posting a release announcement there
      // would be writing somewhere it was never meant to write.
      assert.ok(!broadcast.includes(eixoGroup));
      assert.ok(broadcast.includes(networkingGroup));
      assert.ok(broadcast.includes(jobsGroup));
    }
  );
});

void test("the representatives group still counts as a known group", () => {
  withGroups({ WHATSAPP_EIXO_REPRESENTATIVES_GROUP: eixoGroup }, () => {
    // So it gets the short greeting rather than the full community pitch.
    assert.equal(isConfiguredGroup(eixoGroup), true);
    assert.equal(isConfiguredGroup("120363000000000099@g.us"), false);
  });
});

void test("skips groups that are not configured and de-duplicates the rest", () => {
  withGroups(
    {
      WHATSAPP_NETWORKING_GROUP_1: networkingGroup,
      WHATSAPP_NETWORKING_GROUP_2: "",
      // The same group wired into two roles must be listed once.
      WHATSAPP_JOBS_GROUP_1: networkingGroup,
      WHATSAPP_JOBS_GROUP_2: "",
      WHATSAPP_FACULTY_JOBS_GROUP: "",
      WHATSAPP_EVENTS_GROUP: "",
      WHATSAPP_EIXO_REPRESENTATIVES_GROUP: "",
      WHATSAPP_FACULTY_EVENTS_GROUP: ""
    },
    () => {
      assert.deepEqual(getAllConfiguredGroupJids(), [networkingGroup]);
    }
  );
});
