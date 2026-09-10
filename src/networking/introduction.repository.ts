import { eq } from "drizzle-orm";
import { db } from "../database/client.js";
import { appMetadata } from "../database/schema.js";

// Which groups have already heard the introduction. Persisted rather than kept in memory: the bot
// restarts on every deploy, and re-introducing itself in someone else's group on each restart
// would be embarrassing. Stored as a JSON array under one key in the existing metadata table,
// which avoids a migration for what is a short list of group JIDs.
const INTRODUCED_GROUPS_KEY = "introduced_groups";

export class IntroductionRepository {
  async getIntroducedGroups(): Promise<string[]> {
    const [row] = await db
      .select({ value: appMetadata.value })
      .from(appMetadata)
      .where(eq(appMetadata.key, INTRODUCED_GROUPS_KEY))
      .limit(1);

    if (!row) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(row.value);
      return Array.isArray(parsed) ? parsed.filter((jid): jid is string => typeof jid === "string") : [];
    } catch {
      // Corrupt value behaves like "nobody was introduced yet" rather than crashing the boot.
      return [];
    }
  }

  async markIntroduced(groupJid: string, at: Date = new Date()): Promise<void> {
    const current = await this.getIntroducedGroups();

    if (current.includes(groupJid)) {
      return;
    }

    const value = JSON.stringify([...current, groupJid]);

    await db
      .insert(appMetadata)
      .values({ key: INTRODUCED_GROUPS_KEY, value, updatedAt: at })
      .onConflictDoUpdate({ target: appMetadata.key, set: { value, updatedAt: at } });
  }
}

export const introductionRepository = new IntroductionRepository();
