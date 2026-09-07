export const messageQueueStatuses = ["pending", "processing", "sent", "failed", "cancelled"] as const;
export type MessageQueueStatus = (typeof messageQueueStatuses)[number];

export const messageQueueTypes = ["manual", "job", "event", "event_reminder", "event_promo", "networking"] as const;
export type MessageQueueType = (typeof messageQueueTypes)[number];

export type TextMessagePayload = {
  text: string;
  mentions?: string[];
};

export type PollMessagePayload = {
  poll: {
    name: string;
    values: string[];
    selectableCount?: number;
  };
};

export type EventCreationMessagePayload = {
  eventCreation: {
    name: string;
    description?: string;
    // ISO strings, not Date - the payload is stored as JSON, so the sender reconstructs Date
    // objects right before calling Baileys.
    startDateIso: string;
    endDateIso?: string;
  };
};

export type MessagePayload = TextMessagePayload | PollMessagePayload | EventCreationMessagePayload;

export type QueueMessage = {
  id: string;
  type: MessageQueueType;
  destinationGroup: string;
  payload: MessagePayload;
  status: MessageQueueStatus;
  priority: number;
  bypassQuietHours: boolean;
  scheduledFor: Date;
  attempts: number;
  createdAt: Date;
  sentAt: Date | null;
  lastError: string | null;
  processingStartedAt: Date | null;
};

export type EnqueueMessageInput = {
  type: MessageQueueType;
  destinationGroup: string;
  payload: MessagePayload;
  priority?: number;
  scheduledFor?: Date;
  /** Exempts this message from the 00:00-07:00 quiet-hours block. Reserve for low-frequency,
   * reactive events (e.g. group join/leave) - never for anything that could repeat or spam. */
  bypassQuietHours?: boolean;
};
