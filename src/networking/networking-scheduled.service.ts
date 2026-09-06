import { jidNormalizedUser } from "@whiskeysockets/baileys";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { statsService, type StatsService } from "../stats/stats.service.js";
import { whatsapp } from "../whatsapp/client.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { NetworkingRepository } from "./networking.repository.js";
import { buildDailySummary, pickSpotlightMessage, type SpotlightSlot } from "./scheduled-content.js";

export type NetworkingRepositoryLike = Pick<NetworkingRepository, "getRecentSpotlightJids" | "recordSpotlight" | "getMessagesToday">;
export type StatsServiceLike = Pick<StatsService, "computeDailyStats">;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

const SPOTLIGHT_LOOKBACK_HOURS = 24;

export class NetworkingScheduledService {
  constructor(
    private readonly repository: NetworkingRepositoryLike = new NetworkingRepository(),
    private readonly stats: StatsServiceLike = statsService,
    private readonly queue: QueueServiceLike = queueService,
    private readonly now: () => Date = () => new Date(),
    private readonly groups: string[] = getConfiguredWhatsAppGroups().networkingGroups,
    private readonly listParticipants: (groupJid: string) => Promise<string[]> = (groupJid) => whatsapp.listParticipants(groupJid),
    private readonly getBotJids: () => string[] = () => {
      const user = whatsapp.getSocket()?.user;
      return [user?.id, user?.lid].filter((jid): jid is string => Boolean(jid));
    }
  ) {}

  async postSpotlight(slot: SpotlightSlot): Promise<void> {
    for (const groupJid of this.groups) {
      await this.postSpotlightForGroup(groupJid, slot);
    }
  }

  async postDailySummary(): Promise<void> {
    for (const groupJid of this.groups) {
      await this.postSummaryForGroup(groupJid);
    }
  }

  private async postSpotlightForGroup(groupJid: string, slot: SpotlightSlot): Promise<void> {
    let participants: string[];

    try {
      participants = await this.listParticipants(groupJid);
    } catch (error) {
      logger.error({ groupJid, err: error }, "Failed to list participants for networking spotlight");
      return;
    }

    const normalizedBotJids = new Set(this.getBotJids().map(jidNormalizedUser));
    const eligible = participants.filter((jid) => !normalizedBotJids.has(jidNormalizedUser(jid)));

    if (eligible.length === 0) {
      logger.warn({ groupJid, slot }, "No eligible participants for networking spotlight");
      return;
    }

    const since = new Date(this.now().getTime() - SPOTLIGHT_LOOKBACK_HOURS * 60 * 60_000);
    const recentlyUsed = new Set(await this.repository.getRecentSpotlightJids(groupJid, since));
    // If everyone eligible was already spotlighted in the last 24h (small group), fall back to the
    // full pool rather than skipping the slot - avoiding repeats is best-effort, not a hard block.
    const pool = eligible.filter((jid) => !recentlyUsed.has(jid));
    const candidates = pool.length > 0 ? pool : eligible;

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const tag = `@${chosen.split("@")[0]}`;
    const text = pickSpotlightMessage(slot, tag, this.now().getDay());

    await this.queue.enqueue({
      type: "networking",
      destinationGroup: groupJid,
      payload: { text, mentions: [chosen] }
    });
    await this.repository.recordSpotlight({ groupJid, participantJid: chosen, slot });
    logger.info({ groupJid, slot, chosen }, "Networking spotlight queued");
  }

  private async postSummaryForGroup(groupJid: string): Promise<void> {
    const startOfToday = new Date(this.now());
    startOfToday.setHours(0, 0, 0, 0);

    const [dailyStats, messagesToday] = await Promise.all([
      this.stats.computeDailyStats(startOfToday),
      this.repository.getMessagesToday(groupJid, this.now())
    ]);

    const text = buildDailySummary({
      jobsDiscovered: dailyStats.jobsDiscovered,
      jobsSent: dailyStats.jobsSent,
      eventsDiscovered: dailyStats.eventsDiscovered,
      eventsSent: dailyStats.eventsSent,
      eventRemindersSent: dailyStats.eventRemindersSent,
      messagesToday,
      weekday: this.now().getDay()
    });

    await this.queue.enqueue({ type: "networking", destinationGroup: groupJid, payload: { text } });
    logger.info({ groupJid }, "Networking daily summary queued");
  }
}

export const networkingScheduledService = new NetworkingScheduledService();
