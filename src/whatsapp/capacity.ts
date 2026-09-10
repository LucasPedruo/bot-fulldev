import { env } from "../config/env.js";

// 1024 is the classic WhatsApp group limit and the sane default, but it is not universal: groups
// linked to a Community hold more, and this bot is already in groups of 1025 and 1114 members.
// Treating the default as a hard ceiling would make it refuse to approve anyone into those - and
// worse, post the "group is full" notice while seats remain.
export function parseCapacityOverrides(raw: string): Map<string, number> {
  const overrides = new Map<string, number>();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();

    if (trimmed.length === 0) {
      continue;
    }

    // A JID contains no colon, so splitting on the last one separates it from the number.
    const separator = trimmed.lastIndexOf(":");
    if (separator <= 0) {
      continue;
    }

    const jid = trimmed.slice(0, separator).trim();
    const capacity = Number.parseInt(trimmed.slice(separator + 1).trim(), 10);

    // A malformed entry is skipped rather than throwing: a typo in one override must not stop
    // the bot from booting, and the default still applies to that group.
    if (jid.length > 0 && Number.isInteger(capacity) && capacity > 0) {
      overrides.set(jid, capacity);
    }
  }

  return overrides;
}

export function getGroupCapacity(groupJid: string): number {
  return parseCapacityOverrides(env.GROUP_CAPACITY_OVERRIDES).get(groupJid) ?? env.NETWORKING_GROUP_CAPACITY;
}
