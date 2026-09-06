import { desc, eq } from "drizzle-orm";
import { db } from "../database/client.js";
import { groupActivity, networkingTopicHistory } from "../database/schema.js";

export type NetworkingTopicType = "joke" | "poll" | "critique" | "news";

export class NetworkingRepository {
  async getLastMessageAt(groupJid: string): Promise<Date | undefined> {
    const [row] = await db.select().from(groupActivity).where(eq(groupActivity.groupJid, groupJid)).limit(1);
    return row?.lastMessageAt;
  }

  async touchActivity(groupJid: string, at: Date = new Date()): Promise<void> {
    await db
      .insert(groupActivity)
      .values({ groupJid, lastMessageAt: at })
      .onConflictDoUpdate({ target: groupActivity.groupJid, set: { lastMessageAt: at } });
  }

  async recordTopicUsed(input: { groupJid: string; type: NetworkingTopicType; content: string }): Promise<void> {
    await db.insert(networkingTopicHistory).values(input);
  }

  async getRecentlyUsedContent(groupJid: string, limit = 10): Promise<string[]> {
    const rows = await db
      .select({ content: networkingTopicHistory.content })
      .from(networkingTopicHistory)
      .where(eq(networkingTopicHistory.groupJid, groupJid))
      .orderBy(desc(networkingTopicHistory.usedAt))
      .limit(limit);

    return rows.map((row) => row.content);
  }
}

export const networkingRepository = new NetworkingRepository();
