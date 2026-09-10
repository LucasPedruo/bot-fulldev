import { eq } from "drizzle-orm";
import { db } from "../database/client.js";
import { appMetadata } from "../database/schema.js";

// Which version the groups have already been told about. Stored in Postgres rather than in memory
// because the announcement must survive restarts - the bot reboots on every deploy, and announcing
// the same version again on each restart is exactly the failure mode to avoid.
const LAST_ANNOUNCED_VERSION_KEY = "last_announced_version";

export class ReleaseRepository {
  async getLastAnnouncedVersion(): Promise<string | undefined> {
    const [row] = await db
      .select({ value: appMetadata.value })
      .from(appMetadata)
      .where(eq(appMetadata.key, LAST_ANNOUNCED_VERSION_KEY))
      .limit(1);

    return row?.value;
  }

  async setLastAnnouncedVersion(version: string, at: Date = new Date()): Promise<void> {
    await db
      .insert(appMetadata)
      .values({ key: LAST_ANNOUNCED_VERSION_KEY, value: version, updatedAt: at })
      .onConflictDoUpdate({
        target: appMetadata.key,
        set: { value: version, updatedAt: at }
      });
  }
}

export const releaseRepository = new ReleaseRepository();
