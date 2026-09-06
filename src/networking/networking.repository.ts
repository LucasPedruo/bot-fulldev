import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../database/client.js";
import { groupActivity, groupMembershipLog, mentionReplyLog, networkingSpotlightLog, networkingTopicHistory } from "../database/schema.js";

export type NetworkingTopicType = "joke" | "poll" | "critique" | "news";
export type GroupMembershipAction = "add" | "remove";
export type NetworkingSpotlightSlot = "morning" | "lunch" | "night";

export class NetworkingRepository {
  async getLastMessageAt(groupJid: string): Promise<Date | undefined> {
    const [row] = await db.select().from(groupActivity).where(eq(groupActivity.groupJid, groupJid)).limit(1);
    return row?.lastMessageAt;
  }

  async touchActivity(groupJid: string, at: Date = new Date()): Promise<void> {
    const dateStr = toDateOnly(at);

    await db
      .insert(groupActivity)
      .values({ groupJid, lastMessageAt: at, messagesToday: 1, messagesTodayDate: dateStr })
      .onConflictDoUpdate({
        target: groupActivity.groupJid,
        set: {
          lastMessageAt: at,
          messagesToday: sql`CASE WHEN ${groupActivity.messagesTodayDate} = ${dateStr} THEN ${groupActivity.messagesToday} + 1 ELSE 1 END`,
          messagesTodayDate: dateStr
        }
      });
  }

  async getMessagesToday(groupJid: string, at: Date = new Date()): Promise<number> {
    const dateStr = toDateOnly(at);
    const [row] = await db.select().from(groupActivity).where(eq(groupActivity.groupJid, groupJid)).limit(1);

    if (!row || row.messagesTodayDate !== dateStr) {
      return 0;
    }

    return row.messagesToday;
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

  async recordMembershipEvent(groupJid: string, participantJid: string, action: GroupMembershipAction): Promise<void> {
    await db.insert(groupMembershipLog).values({ groupJid, participantJid, action });
  }

  async countMembershipEventsToday(groupJid: string, since: Date): Promise<{ joined: number; left: number }> {
    const rows = await db
      .select({ action: groupMembershipLog.action, value: sql<number>`count(*)::int` })
      .from(groupMembershipLog)
      .where(and(eq(groupMembershipLog.groupJid, groupJid), gte(groupMembershipLog.occurredAt, since)))
      .groupBy(groupMembershipLog.action);

    return {
      joined: rows.find((row) => row.action === "add")?.value ?? 0,
      left: rows.find((row) => row.action === "remove")?.value ?? 0
    };
  }

  async getRecentSpotlightJids(groupJid: string, since: Date): Promise<string[]> {
    const rows = await db
      .select({ participantJid: networkingSpotlightLog.participantJid })
      .from(networkingSpotlightLog)
      .where(and(eq(networkingSpotlightLog.groupJid, groupJid), gte(networkingSpotlightLog.usedAt, since)));

    return rows.map((row) => row.participantJid);
  }

  async recordSpotlight(input: { groupJid: string; participantJid: string; slot: NetworkingSpotlightSlot }): Promise<void> {
    await db.insert(networkingSpotlightLog).values(input);
  }
}

export const networkingRepository = new NetworkingRepository();

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
