import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { getAllConfiguredGroupJids } from "../whatsapp/groups.js";
import { formatReleaseAnnouncement, readCurrentVersion, readReleaseNote, type ReleaseNote } from "./release-notes.js";
import { releaseRepository, type ReleaseRepository } from "./release.repository.js";

export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type ReleaseAnnouncerOptions = {
  groups?: string[];
  queue?: QueueServiceLike;
  repository?: Pick<ReleaseRepository, "getLastAnnouncedVersion" | "setLastAnnouncedVersion">;
  getVersion?: () => Promise<string>;
  getReleaseNote?: (version: string) => Promise<ReleaseNote | undefined>;
};

export type AnnounceResult = {
  announced: boolean;
  version?: string;
  groups: string[];
  reason?: "already_announced" | "no_changelog_entry" | "no_groups";
};

export class ReleaseAnnouncerService {
  constructor(private readonly options: ReleaseAnnouncerOptions = {}) {}

  // Runs once per boot. Every branch that decides not to announce returns a reason instead of
  // throwing: a broken changelog must never be able to stop the bot from starting.
  async announceIfNeeded(): Promise<AnnounceResult> {
    const version = await (this.options.getVersion ?? readCurrentVersion)();
    const repository = this.options.repository ?? releaseRepository;
    const lastAnnounced = await repository.getLastAnnouncedVersion();

    if (lastAnnounced === version) {
      return { announced: false, version, groups: [], reason: "already_announced" };
    }

    const note = await (this.options.getReleaseNote ?? ((v: string) => readReleaseNote(v)))(version);

    if (!note) {
      // No entry means the release was not written up. Record the version anyway, otherwise every
      // later restart would keep re-checking and the next real entry could be announced twice.
      await repository.setLastAnnouncedVersion(version);
      logger.warn({ version }, "No changelog entry for the current version - nothing announced");
      return { announced: false, version, groups: [], reason: "no_changelog_entry" };
    }

    const groups = this.options.groups ?? getAllConfiguredGroupJids();

    if (groups.length === 0) {
      return { announced: false, version, groups: [], reason: "no_groups" };
    }

    const queue = this.options.queue ?? queueService;
    const text = formatReleaseAnnouncement(note);

    for (const groupJid of groups) {
      await queue.enqueue({
        type: "networking",
        destinationGroup: groupJid,
        payload: { text }
        // Not bypassing quiet hours: a deploy at 3am should not wake every group up. The queue
        // holds it until the window opens.
      });
    }

    // Marked as announced only after every message is queued, so a crash midway through retries
    // the whole thing on the next boot rather than silently skipping the remaining groups.
    await repository.setLastAnnouncedVersion(version);
    logger.info({ version, groups: groups.length }, "Release announcement queued");

    return { announced: true, version, groups };
  }
}

export const releaseAnnouncerService = new ReleaseAnnouncerService();
