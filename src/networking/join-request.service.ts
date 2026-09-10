import { env } from "../config/env.js";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { resolvePhoneJid } from "../shared/mentions.js";
import { moderationRepository, type ModerationRepository } from "../moderation/moderation.repository.js";
import { isLikelyRealPhoneNumber } from "../shared/phone.js";
import { whatsapp } from "../whatsapp/client.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { buildWaitlistNoticeMessage } from "./idle-content.js";

// Approving a join request needs the bot to be an admin of the group - WhatsApp rejects the
// membership_requests_action query otherwise. That failure surfaces as a thrown query error, which
// is logged and swallowed per group so one misconfigured group never stops the others.
export type JoinRequestSocketLike = {
  groupMetadata(jid: string): Promise<{ participants: unknown[] }>;
  groupRequestParticipantsList(jid: string): Promise<Array<Record<string, string>>>;
  groupRequestParticipantsUpdate(
    jid: string,
    participants: string[],
    action: "approve" | "reject"
  ): Promise<Array<{ status: string; jid?: string }>>;
};

export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type JoinRequestServiceOptions = {
  networkingGroups?: string[];
  /** Hard member ceiling for a group. WhatsApp's own limit is 1024. */
  groupCapacity?: number;
  waitlistNoticeCooldownHours?: number;
  queue?: QueueServiceLike;
  getSocket?: () => JoinRequestSocketLike | undefined;
  resolveJid?: (jid: string) => Promise<string>;
  /** Checks the moderation blocklist, so somebody removed for repeated off-topic posting cannot
   * simply request their way back in before the block expires. */
  moderation?: Pick<ModerationRepository, "isBlocked">;
  now?: () => Date;
};

export type ProcessGroupResult = {
  groupJid: string;
  pending: number;
  approved: string[];
  /** Requests left pending because the number failed the real-number heuristic. */
  skippedSuspicious: string[];
  /** Requests refused because the person is serving a moderation block on this group. */
  skippedBlocked: string[];
  /** Requests left pending purely because the group has no free slot. */
  skippedNoCapacity: string[];
  waitlistNoticeSent: boolean;
};

export class JoinRequestService {
  // Kept in memory rather than in Postgres on purpose: the notice is a soft nudge, and the only
  // cost of forgetting it across a restart is one extra message after a deploy - not worth a
  // schema migration and a new table for.
  private readonly lastWaitlistNoticeAt = new Map<string, Date>();

  constructor(private readonly options: JoinRequestServiceOptions = {}) {}

  async processAllGroups(): Promise<ProcessGroupResult[]> {
    const groups = this.options.networkingGroups ?? getConfiguredWhatsAppGroups().networkingGroups;
    const results: ProcessGroupResult[] = [];

    for (const groupJid of groups) {
      try {
        results.push(await this.processGroup(groupJid));
      } catch (error) {
        // Not being an admin is a configuration state, not a fault: WhatsApp answers 403 to the
        // pending-requests query and there is nothing the bot can do about it. Logging it as an
        // error with a full stack every sweep buries real failures in noise, so it gets a short,
        // actionable warning instead.
        if (isForbiddenError(error)) {
          logger.warn(
            { groupJid },
            "Cannot read join requests - the bot must be an admin of this group for auto-approval to work"
          );
          continue;
        }

        logger.error({ err: error, groupJid }, "Failed to process group join requests");
      }
    }

    return results;
  }

  async processGroup(groupJid: string): Promise<ProcessGroupResult> {
    const socket = (this.options.getSocket ?? defaultGetSocket)();
    const result: ProcessGroupResult = {
      groupJid,
      pending: 0,
      approved: [],
      skippedSuspicious: [],
      skippedBlocked: [],
      skippedNoCapacity: [],
      waitlistNoticeSent: false
    };

    if (!socket) {
      return result;
    }

    const requests = await socket.groupRequestParticipantsList(groupJid);
    if (requests.length === 0) {
      return result;
    }

    result.pending = requests.length;

    const capacity = this.options.groupCapacity ?? env.NETWORKING_GROUP_CAPACITY;
    const metadata = await socket.groupMetadata(groupJid);
    const freeSlots = Math.max(0, capacity - metadata.participants.length);

    const resolveJid = this.options.resolveJid ?? ((jid: string) => defaultResolveJid(jid));
    const candidates = await Promise.all(
      requests.map(async (request) => {
        // WhatsApp identifies the requester by "jid", and on LID-addressed groups also hands over
        // the phone-number form in "phone_number". The approval call must echo back the exact jid
        // WhatsApp gave us, while the heuristic needs the phone-number form - so both are kept.
        const requestJid = request.jid ?? request.phone_number ?? "";
        const phoneJid = request.phone_number ?? (await resolveJid(requestJid));
        return { requestJid, phoneJid };
      })
    );

    const plausible = candidates.filter((candidate) => {
      if (candidate.requestJid.length === 0) {
        return false;
      }

      if (isLikelyRealPhoneNumber(candidate.phoneJid)) {
        return true;
      }

      result.skippedSuspicious.push(candidate.phoneJid || candidate.requestJid);
      return false;
    });

    // Somebody removed by the moderator for repeated off-topic posting must not be able to walk
    // straight back in by requesting again. The block is per group and expires on its own, so
    // this check is all that enforces the waiting period.
    const moderation = this.options.moderation ?? moderationRepository;
    const now = (this.options.now ?? (() => new Date()))();
    const eligible: typeof plausible = [];

    for (const candidate of plausible) {
      if (await moderation.isBlocked(groupJid, candidate.phoneJid, now)) {
        result.skippedBlocked.push(candidate.phoneJid);
        continue;
      }

      eligible.push(candidate);
    }

    if (result.skippedBlocked.length > 0) {
      logger.info({ groupJid, blocked: result.skippedBlocked }, "Join requests refused - participants still blocked");
    }

    const toApprove = eligible.slice(0, freeSlots);
    result.skippedNoCapacity = eligible.slice(freeSlots).map((candidate) => candidate.phoneJid);

    if (toApprove.length > 0) {
      const outcomes = await socket.groupRequestParticipantsUpdate(
        groupJid,
        toApprove.map((candidate) => candidate.requestJid),
        "approve"
      );

      // WhatsApp answers per participant, so a partial failure (e.g. the person cancelled the
      // request in the meantime) must not be reported as an approval.
      const failed = outcomes.filter((outcome) => outcome.status !== "200" && outcome.status !== "success");
      result.approved = toApprove
        .filter((candidate) => !failed.some((outcome) => outcome.jid === candidate.requestJid))
        .map((candidate) => candidate.phoneJid);

      if (failed.length > 0) {
        logger.warn({ groupJid, failed }, "Some join request approvals were rejected by WhatsApp");
      }

      logger.info(
        { groupJid, approved: result.approved.length, members: metadata.participants.length, capacity },
        "Join requests approved"
      );
    }

    if (result.skippedSuspicious.length > 0) {
      logger.info(
        { groupJid, skipped: result.skippedSuspicious },
        "Join requests left pending for manual review - number failed the real-number heuristic"
      );
    }

    // The scarcity nudge only makes sense when the group is genuinely full: telling members that
    // leaving costs them their slot is misleading when there are still free slots and the only
    // pending requests are ones the heuristic held back for manual review.
    if (freeSlots === 0 && result.pending > 0) {
      result.waitlistNoticeSent = await this.sendWaitlistNotice(groupJid, result.pending);
    }

    return result;
  }

  private async sendWaitlistNotice(groupJid: string, pendingCount: number): Promise<boolean> {
    const now = (this.options.now ?? (() => new Date()))();
    const cooldownHours = this.options.waitlistNoticeCooldownHours ?? env.NETWORKING_WAITLIST_NOTICE_COOLDOWN_HOURS;
    const lastSentAt = this.lastWaitlistNoticeAt.get(groupJid);

    if (lastSentAt && now.getTime() - lastSentAt.getTime() < cooldownHours * 60 * 60 * 1000) {
      return false;
    }

    const queue = this.options.queue ?? queueService;
    await queue.enqueue({
      type: "networking",
      destinationGroup: groupJid,
      payload: { text: buildWaitlistNoticeMessage(pendingCount) }
      // Deliberately NOT bypassing quiet hours: unlike a join/leave event this is a recurring
      // nudge that fires on every sweep while the group stays full.
    });

    this.lastWaitlistNoticeAt.set(groupJid, now);
    logger.info({ groupJid, pendingCount }, "Waiting-list notice queued");
    return true;
  }
}

// Baileys wraps the server's refusal in a Boom error carrying the numeric status in `data`, and
// the message is the raw "forbidden" the server sent back.
export function isForbiddenError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { data?: unknown; message?: unknown };
  return candidate.data === 403 || candidate.message === "forbidden";
}

function defaultGetSocket(): JoinRequestSocketLike | undefined {
  const socket = whatsapp.getSocket();
  return socket && whatsapp.getStatus() === "connected" ? socket : undefined;
}

async function defaultResolveJid(jid: string): Promise<string> {
  const socket = whatsapp.getSocket();
  return socket ? resolvePhoneJid(jid, socket) : jid;
}

export const joinRequestService = new JoinRequestService();
