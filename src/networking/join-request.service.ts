import { env } from "../config/env.js";
import type { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { resolvePhoneJid } from "../shared/mentions.js";
import { moderationRepository, type ModerationRepository } from "../moderation/moderation.repository.js";
import { isLikelyRealPhoneNumber } from "../shared/phone.js";
import { whatsapp } from "../whatsapp/client.js";
import { getGroupCapacity } from "../whatsapp/capacity.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";

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
  /** Member ceiling for a group. Defaults to the per-group configuration, because real groups
   * disagree with the classic 1024 limit. */
  groupCapacity?: number | ((groupJid: string) => number);
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
};

export class JoinRequestService {
  constructor(private readonly options: JoinRequestServiceOptions = {}) {}

  async processAllGroups(): Promise<ProcessGroupResult[]> {
    const groups = this.options.networkingGroups ?? getAutoApproveGroups();
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
      skippedNoCapacity: []
    };

    if (!socket) {
      return result;
    }

    const requests = await socket.groupRequestParticipantsList(groupJid);
    if (requests.length === 0) {
      return result;
    }

    result.pending = requests.length;

    const configured = this.options.groupCapacity;
    const capacity =
      typeof configured === "function" ? configured(groupJid) : (configured ?? getGroupCapacity(groupJid));
    const metadata = await socket.groupMetadata(groupJid);
    const freeSlots = Math.max(0, capacity - metadata.participants.length);

    const resolveJid = this.options.resolveJid ?? ((jid: string) => defaultResolveJid(jid));
    const candidates = await Promise.all(
      requests.map(async (request) => {
        // WhatsApp identifies the requester by "jid", and on LID-addressed groups also hands over
        // the phone-number form in "phone_number". Both are kept: the heuristic and the blocklist
        // need the phone-number form, while the approval is attempted with the jid WhatsApp gave
        // and retried against the phone number when that is refused (see approveAll).
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
      const approvedJids = new Set(await approveAll(socket, groupJid, toApprove));

      result.approved = toApprove
        .filter((candidate) => approvedJids.has(candidate.requestJid))
        .map((candidate) => candidate.phoneJid);

      logger.info(
        {
          groupJid,
          approved: result.approved.length,
          attempted: toApprove.length,
          members: metadata.participants.length,
          capacity
        },
        "Join requests approved"
      );
    }

    if (result.skippedSuspicious.length > 0) {
      logger.info(
        { groupJid, skipped: result.skippedSuspicious },
        "Join requests left pending for manual review - number failed the real-number heuristic"
      );
    }

    return result;
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

// Networking always, jobs groups only when explicitly enabled. The jobs groups fill up the same
// way and had pending requests piling up, but approving into them is a separate decision from
// approving into networking, so it stays behind its own flag.
//
// The faculty jobs group is deliberately left out: it belongs to the college, not to FullDev, the
// bot is not an admin there, and who gets into it is not ours to decide.
export function getAutoApproveGroups(): string[] {
  const groups = getConfiguredWhatsAppGroups();
  const jobsGroups = env.JOBS_AUTO_APPROVE_ENABLED ? [groups.jobsGroup1, groups.jobsGroup2] : [];

  return [...new Set([...groups.networkingGroups, ...jobsGroups])].filter((jid) => jid.length > 0);
}

type ApprovalCandidate = { requestJid: string; phoneJid: string };

function isAccepted(status: string): boolean {
  return status === "200" || status === "success";
}

// WhatsApp hands the pending list back in whichever addressing mode the group uses, so `jid` can
// be a LID. Echoing that LID straight back was rejected with a blanket 500 for all ten pending
// requests of a jobs group in production, while a group that reported phone-number JIDs approved
// fine - so the LID form is retried against the resolved phone number before giving up.
//
// The 500 carries no detail, and "the group is genuinely full" produces the same code, which is
// why the outcome of each attempt is logged: the two causes are only distinguishable from whether
// the retry succeeds.
async function approveAll(
  socket: JoinRequestSocketLike,
  groupJid: string,
  candidates: ApprovalCandidate[]
): Promise<string[]> {
  const outcomes = await socket.groupRequestParticipantsUpdate(
    groupJid,
    candidates.map((candidate) => candidate.requestJid),
    "approve"
  );

  const accepted = new Set(outcomes.filter((outcome) => isAccepted(outcome.status)).map((outcome) => outcome.jid));
  const approved = candidates.filter((candidate) => accepted.has(candidate.requestJid)).map((c) => c.requestJid);

  // Only worth retrying where the identity we sent differs from the phone-number form.
  const retryable = candidates.filter(
    (candidate) =>
      !accepted.has(candidate.requestJid) &&
      candidate.phoneJid.length > 0 &&
      candidate.phoneJid !== candidate.requestJid &&
      candidate.phoneJid.endsWith("@s.whatsapp.net")
  );

  if (retryable.length === 0) {
    if (approved.length < candidates.length) {
      logger.warn(
        { groupJid, attempted: candidates.length, approved: approved.length, outcomes },
        "WhatsApp rejected some join request approvals and there is no phone-number form to retry with"
      );
    }

    return approved;
  }

  const retryOutcomes = await socket.groupRequestParticipantsUpdate(
    groupJid,
    retryable.map((candidate) => candidate.phoneJid),
    "approve"
  );

  const retryAccepted = new Set(
    retryOutcomes.filter((outcome) => isAccepted(outcome.status)).map((outcome) => outcome.jid)
  );
  const recovered = retryable.filter((candidate) => retryAccepted.has(candidate.phoneJid));

  logger.info(
    { groupJid, retried: retryable.length, recovered: recovered.length },
    "Retried rejected approvals using the phone-number form"
  );

  if (recovered.length < retryable.length) {
    // Neither identity worked, so the refusal is about the group (most likely genuinely full),
    // not about how the participant was addressed.
    logger.warn(
      { groupJid, stillRejected: retryable.length - recovered.length, outcomes: retryOutcomes },
      "Approvals rejected under both identities - the group is likely at its real member limit"
    );
  }

  return [...approved, ...recovered.map((candidate) => candidate.requestJid)];
}
