import { env } from "../config/env.js";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { generateEventSummary } from "./faculty-summary.provider.js";

export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

export type TimerHandle = { cancel: () => void };

export type FacultyRelayOptions = {
  destinationGroup?: string;
  debounceMinutes?: number;
  queue?: QueueServiceLike;
  summarize?: (messages: string[]) => Promise<string | undefined>;
  // Injected so tests can drive the debounce window without waiting on real time.
  schedule?: (run: () => void, delayMs: number) => TimerHandle;
};

export class FacultyRelayService {
  // Announcements routinely arrive as several messages in a row ("evento tal", "dia X", "link
  // aqui"). Buffering until the sender goes quiet keeps them as one summary instead of three
  // fragments, which is why nothing is relayed on the first message.
  private buffer: string[] = [];
  private timer?: TimerHandle;
  private flushing?: Promise<void>;

  constructor(private readonly options: FacultyRelayOptions = {}) {}

  ingest(text: string): void {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return;
    }

    this.buffer.push(trimmed);
    // Every new message pushes the deadline out, so the window closes only once the group has
    // actually gone quiet for the full interval.
    this.timer?.cancel();

    const debounceMinutes = this.options.debounceMinutes ?? env.FACULTY_RELAY_DEBOUNCE_MINUTES;
    const schedule = this.options.schedule ?? defaultSchedule;
    this.timer = schedule(() => {
      void this.flush().catch((error: unknown) => {
        logger.error({ err: error }, "Faculty relay flush failed");
      });
    }, debounceMinutes * 60 * 1000);
  }

  async flush(): Promise<void> {
    // A flush already in flight owns the buffer it took; awaiting it keeps two overlapping
    // flushes from relaying the same batch twice.
    if (this.flushing) {
      await this.flushing;
      return;
    }

    this.timer?.cancel();
    this.timer = undefined;

    const batch = this.buffer;
    this.buffer = [];

    if (batch.length === 0) {
      return;
    }

    this.flushing = this.relay(batch).finally(() => {
      this.flushing = undefined;
    });

    await this.flushing;
  }

  /** Test seam - lets a test assert on what is still waiting to be relayed. */
  pendingCount(): number {
    return this.buffer.length;
  }

  private async relay(batch: string[]): Promise<void> {
    const destinationGroup = this.options.destinationGroup ?? getConfiguredWhatsAppGroups().facultyEventsGroup;

    if (destinationGroup.length === 0) {
      logger.warn("Faculty relay has no destination group configured - dropping the batch");
      return;
    }

    const summarize = this.options.summarize ?? generateEventSummary;
    const summary = await summarize(batch);
    const body = summary ?? batch.join("\n\n");

    const text = [
      "📢 Eventos e oportunidades divulgados pelos representantes de eixo:",
      "",
      body
    ].join("\n");

    const queue = this.options.queue ?? queueService;
    await queue.enqueue({
      type: "networking",
      destinationGroup,
      payload: { text }
      // Quiet hours apply: an announcement posted at 2am can perfectly well wait until morning.
    });

    logger.info({ destinationGroup, messages: batch.length, summarized: Boolean(summary) }, "Faculty relay queued");
  }
}

function defaultSchedule(run: () => void, delayMs: number): TimerHandle {
  const timeout = setTimeout(run, delayMs);
  // Without this the pending debounce would keep the process alive through a shutdown.
  timeout.unref?.();
  return { cancel: () => clearTimeout(timeout) };
}

export const facultyRelayService = new FacultyRelayService();
