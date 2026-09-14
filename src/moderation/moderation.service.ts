import type { WAMessageKey } from "@whiskeysockets/baileys";
import { env } from "../config/env.js";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { buildMentionTag } from "../shared/mentions.js";
import { moderationRepository, type ModerationRepository } from "./moderation.repository.js";

export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type ModerationActions = {
  /** Deletes the offending message for everyone. Requires the bot to be a group admin. */
  deleteMessage(groupJid: string, key: WAMessageKey): Promise<void>;
  removeParticipant(groupJid: string, participantJid: string): Promise<void>;
};

export type ModerationServiceOptions = {
  strikeLimit?: number;
  blockDays?: number;
  queue?: QueueServiceLike;
  repository?: Pick<ModerationRepository, "addStrike" | "resetStrikes" | "block">;
  actions?: ModerationActions;
  warningMessage?: (tag: string, strikes: number, limit: number) => string;
  removalMessage?: (tag: string, limit: number, blockDays: number) => string;
  now?: () => Date;
};

export type StrikeOutcome = {
  strikes: number;
  limit: number;
  removed: boolean;
  blockedUntil?: Date;
};

export class ModerationService {
  constructor(private readonly options: ModerationServiceOptions = {}) {}

  // The order matters. The message is deleted first, because that is the part the group sees and
  // the part that must happen even if everything after it fails. Only then is the strike counted.
  async punish(input: {
    groupJid: string;
    participantJid: string;
    messageKey: WAMessageKey;
    reason: string;
  }): Promise<StrikeOutcome> {
    const actions = this.options.actions;
    const repository = this.options.repository ?? moderationRepository;
    const queue = this.options.queue ?? queueService;
    const limit = this.options.strikeLimit ?? env.NETWORKING_MODERATION_STRIKE_LIMIT;
    const blockDays = this.options.blockDays ?? env.NETWORKING_MODERATION_BLOCK_DAYS;
    const warningMessage = this.options.warningMessage ?? buildNetworkingWarningMessage;
    const removalMessage = this.options.removalMessage ?? buildNetworkingRemovalMessage;
    const now = (this.options.now ?? (() => new Date()))();

    if (actions) {
      await actions.deleteMessage(input.groupJid, input.messageKey);
    }

    const strikes = await repository.addStrike(input.groupJid, input.participantJid, now);
    const removed = strikes >= limit;
    const tag = buildMentionTag(input.participantJid);

    if (!removed) {
      await queue.enqueue({
        type: "networking",
        destinationGroup: input.groupJid,
        payload: {
          text: warningMessage(tag, strikes, limit),
          mentions: [input.participantJid]
        },
        // The warning has to arrive while the person still remembers what they posted, and it
        // explains a message that just vanished - holding it until morning would be confusing.
        bypassQuietHours: true
      });

      logger.info({ ...input, strikes, limit }, "Moderation strike recorded");
      return { strikes, limit, removed: false };
    }

    const blockedUntil = new Date(now.getTime() + blockDays * 24 * 60 * 60 * 1000);

    // Announced before the removal: once they are out of the group they cannot read it, and the
    // message is as much for the rest of the group as it is for them.
    await queue.enqueue({
      type: "networking",
      destinationGroup: input.groupJid,
      payload: {
        text: removalMessage(tag, limit, blockDays),
        mentions: [input.participantJid]
      },
      bypassQuietHours: true
    });

    await repository.block({
      groupJid: input.groupJid,
      participantJid: input.participantJid,
      blockedUntil,
      reason: input.reason
    });

    // Reset before removing: if they come back after the block they start with a clean slate
    // instead of being removed again on their first message.
    await repository.resetStrikes(input.groupJid, input.participantJid);

    if (actions) {
      await actions.removeParticipant(input.groupJid, input.participantJid);
    }

    logger.info({ ...input, strikes, blockedUntil }, "Participant removed after reaching the strike limit");
    return { strikes, limit, removed: true, blockedUntil };
  }
}

export function buildNetworkingWarningMessage(tag: string, strikes: number, limit: number): string {
  return [
    `${tag} sua mensagem foi removida: este grupo e para tecnologia, duvidas tecnicas, carreira e debates gerais de tecnologia.`,
    "",
    `Malha fina: ${strikes}/${limit}.`,
    "",
    "Assuntos fora desses temas devem ir para o grupo Off Topic. Politica, religiao, ofensas,",
    "conteudo sensivel e links de pirataria nao sao permitidos aqui.",
    "",
    `Ao chegar em ${limit}/${limit} voce e removido do grupo.`
  ].join("\n");
}

export function buildJobsWarningMessage(tag: string, strikes: number, limit: number): string {
  return [
    `${tag} sua mensagem foi removida: este grupo e so para divulgacao de vagas.`,
    "",
    `Malha fina: ${strikes}/${limit}.`,
    "",
    `Ao chegar em ${limit}/${limit} voce e removido do grupo. Para conversar sobre outros assuntos,`,
    "use os grupos de networking da comunidade."
  ].join("\n");
}

export function buildJobsRemovalMessage(tag: string, limit: number, blockDays: number): string {
  return [
    `${tag} malha fina ${limit}/${limit}. Voce esta sendo removido do grupo.`,
    "",
    `Podera voltar a entrar daqui a ${blockDays} dias. Ate la, pedidos de entrada nao serao aceitos.`,
    "",
    "Este grupo e exclusivo para divulgacao de vagas."
  ].join("\n");
}

export function buildNetworkingRemovalMessage(tag: string, limit: number, blockDays: number): string {
  return [
    `${tag} malha fina ${limit}/${limit}. Voce esta sendo removido do grupo.`,
    "",
    `Podera voltar a entrar daqui a ${blockDays} dias. Ate la, pedidos de entrada nao serao aceitos.`,
    "",
    "Este grupo e para discussoes de tecnologia, duvidas tecnicas, carreira e crescimento profissional."
  ].join("\n");
}

export const moderationService = new ModerationService();
