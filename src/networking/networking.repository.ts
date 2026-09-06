import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../database/client.js";
import { groupActivity, mentionReplyLog, networkingTopicHistory } from "../database/schema.js";

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

  async getMentionMuteUntil(groupJid: string): Promise<Date | undefined> {
    const [row] = await db.select().from(groupActivity).where(eq(groupActivity.groupJid, groupJid)).limit(1);
    return row?.mentionMuteUntil ?? undefined;
  }

  async setMentionMuteUntil(groupJid: string, until: Date): Promise<void> {
    await db
      .insert(groupActivity)
      .values({ groupJid, mentionMuteUntil: until })
      .onConflictDoUpdate({ target: groupActivity.groupJid, set: { mentionMuteUntil: until } });
  }

  async recordMentionReply(groupJid: string, at: Date = new Date()): Promise<void> {
    await db.insert(mentionReplyLog).values({ groupJid, repliedAt: at });
  }

  async countRecentMentionReplies(groupJid: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(mentionReplyLog)
      .where(and(eq(mentionReplyLog.groupJid, groupJid), gte(mentionReplyLog.repliedAt, since)));

    return row?.value ?? 0;
  }
}

export const networkingRepository = new NetworkingRepository();
