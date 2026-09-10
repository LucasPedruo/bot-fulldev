import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../database/client.js";
import { groupBlocklist, moderationStrikes } from "../database/schema.js";

export class ModerationRepository {
  /** Increments and returns the new strike count for this person in this group. */
  async addStrike(groupJid: string, participantJid: string, at: Date = new Date()): Promise<number> {
    const [row] = await db
      .insert(moderationStrikes)
      .values({ groupJid, participantJid, strikes: 1, lastStrikeAt: at })
      .onConflictDoUpdate({
        target: [moderationStrikes.groupJid, moderationStrikes.participantJid],
        set: { strikes: sql`${moderationStrikes.strikes} + 1`, lastStrikeAt: at }
      })
      .returning({ strikes: moderationStrikes.strikes });

    return row?.strikes ?? 1;
  }

  async getStrikes(groupJid: string, participantJid: string): Promise<number> {
    const [row] = await db
      .select({ strikes: moderationStrikes.strikes })
      .from(moderationStrikes)
      .where(and(eq(moderationStrikes.groupJid, groupJid), eq(moderationStrikes.participantJid, participantJid)))
      .limit(1);

    return row?.strikes ?? 0;
  }

  // Called when someone is removed: the count restarts, so if they come back after the block
  // they get the full three chances again rather than being removed on their first slip.
  async resetStrikes(groupJid: string, participantJid: string): Promise<void> {
    await db
      .delete(moderationStrikes)
      .where(and(eq(moderationStrikes.groupJid, groupJid), eq(moderationStrikes.participantJid, participantJid)));
  }

  async block(input: {
    groupJid: string;
    participantJid: string;
    blockedUntil: Date;
    reason: string;
  }): Promise<void> {
    await db
      .insert(groupBlocklist)
      .values(input)
      .onConflictDoUpdate({
        target: [groupBlocklist.groupJid, groupBlocklist.participantJid],
        set: { blockedUntil: input.blockedUntil, reason: input.reason }
      });
  }

  // An expired row is simply not a block any more - the person may rejoin. Rows are kept rather
  // than deleted so there is a history of who was removed and when.
  async isBlocked(groupJid: string, participantJid: string, at: Date = new Date()): Promise<boolean> {
    const [row] = await db
      .select({ id: groupBlocklist.id })
      .from(groupBlocklist)
      .where(
        and(
          eq(groupBlocklist.groupJid, groupJid),
          eq(groupBlocklist.participantJid, participantJid),
          gt(groupBlocklist.blockedUntil, at)
        )
      )
      .limit(1);

    return Boolean(row);
  }
}

export const moderationRepository = new ModerationRepository();
