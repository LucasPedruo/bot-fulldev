import type { WAMessageKey } from "@whiskeysockets/baileys";
import { env } from "../config/env.js";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { sendReaction } from "../whatsapp/sender.js";
import { logger } from "../shared/logger.js";
import { generateAmbientReaction, generateAmbientReply } from "./ambient-ai.provider.js";
import { pickAmbientReaction, pickAmbientReply } from "./idle-content.js";
import { NetworkingRepository } from "./networking.repository.js";

export type AmbientEngagementRepositoryLike = Pick<
  NetworkingRepository,
  | "getAmbientReplyMuteUntil"
  | "setAmbientReplyMuteUntil"
  | "countRecentAmbientReplies"
  | "recordAmbientReply"
  | "getLastAmbientReactionAt"
  | "touchAmbientReaction"
>;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};
export type ReactionSender = (groupJid: string, messageKey: WAMessageKey, emoji: string) => Promise<void>;
export type AmbientReplyGenerator = (messageText: string) => Promise<string | undefined>;
export type AmbientReactionPicker = (messageText: string) => Promise<string | undefined>;

export class AmbientEngagementService {
  constructor(
    private readonly repository: AmbientEngagementRepositoryLike = new NetworkingRepository(),
    private readonly queue: QueueServiceLike = queueService,
    private readonly reactionSender: ReactionSender = sendReaction,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = () => Math.random(),
    private readonly replyGenerator: AmbientReplyGenerator = env.NETWORKING_AMBIENT_AI_ENABLED
      ? generateAmbientReply
      : () => Promise.resolve(pickAmbientReply()),
    private readonly reactionPicker: AmbientReactionPicker = env.NETWORKING_AMBIENT_AI_ENABLED
      ? generateAmbientReaction
      : (messageText) => Promise.resolve(pickAmbientReaction(messageText)),
    private readonly enabled: boolean = env.NETWORKING_AMBIENT_ENGAGEMENT_ENABLED
  ) {}

  async handleMessage(groupJid: string, messageKey: WAMessageKey, messageText?: string): Promise<void> {
    if (!this.enabled || !messageText || messageText.trim().length === 0) {
      return;
    }

    await this.maybeReact(groupJid, messageKey, messageText);
    await this.maybeReply(groupJid, messageText);
  }

  private async maybeReact(groupJid: string, messageKey: WAMessageKey, messageText: string): Promise<void> {
    if (this.random() >= env.NETWORKING_AMBIENT_REACTION_PROBABILITY) {
      return;
    }

    const lastAt = await this.repository.getLastAmbientReactionAt(groupJid);
    const minGapMs = env.NETWORKING_AMBIENT_REACTION_MIN_GAP_MINUTES * 60_000;
    if (lastAt && this.now().getTime() - lastAt.getTime() < minGapMs) {
      return;
    }

    const emoji = await this.reactionPicker(messageText);
    if (!emoji) {
      return;
    }

    await this.reactionSender(groupJid, messageKey, emoji);
    await this.repository.touchAmbientReaction(groupJid, this.now());
    logger.info({ groupJid, emoji }, "Ambient reaction sent");
  }

  private async maybeReply(groupJid: string, messageText: string): Promise<void> {
    if (this.random() >= env.NETWORKING_AMBIENT_REPLY_PROBABILITY) {
      return;
    }

    const muteUntil = await this.repository.getAmbientReplyMuteUntil(groupJid);
    if (muteUntil && muteUntil.getTime() > this.now().getTime()) {
      return;
    }

    const since = new Date(this.now().getTime() - 60 * 60_000);
    const recentCount = await this.repository.countRecentAmbientReplies(groupJid, since);
    if (recentCount >= env.NETWORKING_AMBIENT_REPLY_MAX_PER_HOUR) {
      // Goes quiet without announcing it - unlike the mention cooldown, nobody asked the bot to
      // engage here, so narrating "I'm going silent now" would itself read as attention-seeking.
      const cooldownUntil = new Date(this.now().getTime() + env.NETWORKING_AMBIENT_REPLY_COOLDOWN_HOURS * 60 * 60_000);
      await this.repository.setAmbientReplyMuteUntil(groupJid, cooldownUntil);
      logger.info({ groupJid, cooldownUntil }, "Ambient reply rate limit hit, going quiet");
      return;
    }

    const text = await this.replyGenerator(messageText);
    if (!text) {
      return;
    }

    await this.queue.enqueue({
      type: "networking",
      destinationGroup: groupJid,
      payload: { text },
      priority: 5
    });

    await this.repository.recordAmbientReply(groupJid, this.now());
    logger.info({ groupJid }, "Ambient reply queued");
  }
}

export const ambientEngagementService = new AmbientEngagementService();
