import { eq, sql } from "drizzle-orm";
import { db } from "../database/client.js";
import { memes } from "../database/schema.js";

export type Meme = {
  id: string;
  category: string;
  filename: string;
  caption: string | null;
  lastUsedAt: Date | null;
};

export class MemeRepository {
  async pickLeastRecentlyUsed(): Promise<Meme | undefined> {
    const [row] = await db
      .select()
      .from(memes)
      // Never-used memes (NULL) come first, then oldest-used - keeps rotation even without a
      // separate history table since each meme tracks its own last-used timestamp.
      .orderBy(sql`${memes.lastUsedAt} ASC NULLS FIRST`)
      .limit(1);

    return row;
  }

  async markUsed(id: string, at: Date = new Date()): Promise<void> {
    await db.update(memes).set({ lastUsedAt: at }).where(eq(memes.id, id));
  }

  async count(): Promise<number> {
    const [row] = await db.select({ value: sql<number>`count(*)::int` }).from(memes);
    return row?.value ?? 0;
  }
}

export const memeRepository = new MemeRepository();
