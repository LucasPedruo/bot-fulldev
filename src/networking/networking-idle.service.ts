import { jidNormalizedUser } from "@whiskeysockets/baileys";
import { env } from "../config/env.js";
import { memeService, type MemeContent, type MemeService } from "../memes/meme.service.js";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { isQuietHours } from "../shared/quiet-hours.js";
import { whatsapp } from "../whatsapp/client.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { fetchTopDevToArticle, formatDevToMessage, type DevToArticle } from "./devto.provider.js";
import { pickDirectQuestion, pickIdleContent } from "./idle-content.js";
import { NetworkingRepository, type NetworkingTopicType } from "./networking.repository.js";

export type NetworkingRepositoryLike = Pick<
  NetworkingRepository,
  "getLastMessageAt" | "touchActivity" | "recordTopicUsed" | "getRecentlyUsedContent"
>;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

const NEWS_CHANCE = 0.2;
const DIRECT_QUESTION_CHANCE = 0.2;

export class NetworkingIdleService {
  constructor(
    private readonly repository: NetworkingRepositoryLike = new NetworkingRepository(),
    private readonly queue: QueueServiceLike = queueService,
    private readonly now: () => Date = () => new Date(),
    private readonly groups: string[] = getConfiguredWhatsAppGroups().networkingGroups,
    private readonly random: () => number = () => Math.random(),
    private readonly newsProvider: () => Promise<DevToArticle | undefined> = fetchTopDevToArticle,
    private readonly memeProvider: Pick<MemeService, "pickMemeContent"> = memeService,
    private readonly listParticipants: (groupJid: string) => Promise<string[]> = (groupJid) => whatsapp.listParticipants(groupJid),
    private readonly getBotJids: () => string[] = () => {
      const user = whatsapp.getSocket()?.user;
      return [user?.id, user?.lid].filter((jid): jid is string => Boolean(jid));
    }
  ) {}

  async checkAndPost(): Promise<{ posted: number }> {
    if (isQuietHours(this.now())) {
      return { posted: 0 };
    }

    let posted = 0;

    for (const groupJid of this.groups) {
      if (await this.isIdle(groupJid)) {
        await this.postTopic(groupJid);
        posted += 1;
      }
    }

    return { posted };
  }

  private async isIdle(groupJid: string): Promise<boolean> {
    const lastMessageAt = await this.repository.getLastMessageAt(groupJid);
    if (!lastMessageAt) {
      return false;
    }

    const idleMs = this.now().getTime() - lastMessageAt.getTime();
    return idleMs >= env.NETWORKING_IDLE_THRESHOLD_MINUTES * 60_000;
  }

  private async postTopic(groupJid: string): Promise<void> {
    // Reset the clock before enqueueing, not after sending, so a message still sitting in the
    // queue (retry, quiet hours) doesn't let the next scheduler tick fire a second one.
    await this.repository.touchActivity(groupJid, this.now());

    const memeContent = this.random() < env.MEMES_CHANCE ? await this.memeProvider.pickMemeContent() : undefined;

    if (memeContent) {
      await this.enqueueImage(groupJid, memeContent);
      return;
    }

    if (this.random() < DIRECT_QUESTION_CHANCE) {
      const participant = await this.pickRandomParticipant(groupJid);
      if (participant) {
        await this.enqueueDirectQuestion(groupJid, participant);
        return;
      }
    }

    const recentlyUsed = await this.repository.getRecentlyUsedContent(groupJid);
    const newsArticle = this.random() < NEWS_CHANCE ? await this.newsProvider() : undefined;

    if (newsArticle) {
      await this.enqueueText(groupJid, "news", formatDevToMessage(newsArticle));
      return;
    }

    const content = pickIdleContent(recentlyUsed);

    if (content.type === "poll") {
      await this.enqueuePoll(groupJid, content.name, content.values);
      return;
    }

    await this.enqueueText(groupJid, content.type, content.text);
  }

  private async pickRandomParticipant(groupJid: string): Promise<string | undefined> {
    try {
      const participants = await this.listParticipants(groupJid);
      const normalizedBotJids = new Set(this.getBotJids().map(jidNormalizedUser));
      const eligible = participants.filter((jid) => !normalizedBotJids.has(jidNormalizedUser(jid)));

      if (eligible.length === 0) {
        return undefined;
      }

      return eligible[Math.floor(this.random() * eligible.length)];
    } catch (error) {
      logger.error({ groupJid, err: error }, "Failed to list participants for idle direct question");
      return undefined;
    }
  }

  private async enqueueDirectQuestion(groupJid: string, participantJid: string): Promise<void> {
    const { text, mentions } = pickDirectQuestion(participantJid);
    await this.queue.enqueue({ type: "networking", destinationGroup: groupJid, payload: { text, mentions } });
    logger.info({ groupJid, participantJid }, "Networking idle direct question queued");
  }

  private async enqueueText(groupJid: string, type: NetworkingTopicType, text: string): Promise<void> {
    await this.queue.enqueue({ type: "networking", destinationGroup: groupJid, payload: { text } });
    await this.repository.recordTopicUsed({ groupJid, type, content: text });
    logger.info({ groupJid, type }, "Networking idle topic queued");
  }

  private async enqueuePoll(groupJid: string, name: string, values: string[]): Promise<void> {
    await this.queue.enqueue({ type: "networking", destinationGroup: groupJid, payload: { poll: { name, values } } });
    await this.repository.recordTopicUsed({ groupJid, type: "poll", content: name });
    logger.info({ groupJid, type: "poll" }, "Networking idle topic queued");
  }

  private async enqueueImage(groupJid: string, content: MemeContent): Promise<void> {
    await this.queue.enqueue({
      type: "networking",
      destinationGroup: groupJid,
      payload: { image: { filename: content.filename, caption: content.caption } }
    });
    logger.info({ groupJid, filename: content.filename }, "Networking meme queued");
  }
}

export const networkingIdleService = new NetworkingIdleService();
