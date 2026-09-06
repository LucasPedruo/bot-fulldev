import { env } from "../config/env.js";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { pickMentionCooldownMessage, pickMentionReply } from "./idle-content.js";
import { generateMentionReply } from "./mention-ai.provider.js";
import { NetworkingRepository } from "./networking.repository.js";

export type MentionRepositoryLike = Pick<
  NetworkingRepository,
  "getMentionMuteUntil" | "setMentionMuteUntil" | "countRecentMentionReplies" | "recordMentionReply"
>;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};
export type MentionReplyGenerator = (messageText?: string) => Promise<string | undefined>;

export class MentionReplyService {
  constructor(
    private readonly repository: MentionRepositoryLike = new NetworkingRepository(),
    private readonly queue: QueueServiceLike = queueService,
    private readonly now: () => Date = () => new Date(),
    private readonly aiReplyGenerator: MentionReplyGenerator | undefined = env.MENTION_REPLY_AI_ENABLED ? generateMentionReply : undefined
  ) {}

  async handleMention(groupJid: string, senderJid: string, messageText?: string): Promise<void> {
    const muteUntil = await this.repository.getMentionMuteUntil(groupJid);
    if (muteUntil && muteUntil.getTime() > this.now().getTime()) {
      return;
    }

    const since = new Date(this.now().getTime() - 60 * 60_000);
    const recentCount = await this.repository.countRecentMentionReplies(groupJid, since);
    const text = recentCount >= env.NETWORKING_MENTION_MAX_PER_HOUR ? await this.triggerCooldown(groupJid) : await this.pickReply(messageText);

    await this.reply(groupJid, senderJid, text);
  }

  private async pickReply(messageText?: string): Promise<string> {
    if (this.aiReplyGenerator) {
      const aiText = await this.aiReplyGenerator(messageText);
      if (aiText) {
        return aiText;
      }
    }

    return pickMentionReply();
  }

  private async triggerCooldown(groupJid: string): Promise<string> {
    const cooldownHours = env.NETWORKING_MENTION_COOLDOWN_HOURS;
    const muteUntil = new Date(this.now().getTime() + cooldownHours * 60 * 60_000);
    await this.repository.setMentionMuteUntil(groupJid, muteUntil);
    logger.info({ groupJid, muteUntil }, "Networking mention rate limit hit, muting");
    return pickMentionCooldownMessage(cooldownHours);
  }

  private async reply(groupJid: string, senderJid: string, text: string): Promise<void> {
    const mentionTag = `@${senderJid.split("@")[0]}`;

    await this.queue.enqueue({
      type: "networking",
      destinationGroup: groupJid,
      payload: {
        text: `${mentionTag} ${text}`,
        mentions: [senderJid]
      },
      priority: 10
    });

    await this.repository.recordMentionReply(groupJid, this.now());
    logger.info({ groupJid, senderJid }, "Networking mention reply queued");
  }
}

export const mentionReplyService = new MentionReplyService();
