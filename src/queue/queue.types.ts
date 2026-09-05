export const messageQueueStatuses = ["pending", "processing", "sent", "failed", "cancelled"] as const;
export type MessageQueueStatus = (typeof messageQueueStatuses)[number];

export const messageQueueTypes = ["manual", "job", "event", "event_reminder", "networking"] as const;
export type MessageQueueType = (typeof messageQueueTypes)[number];

export type TextMessagePayload = {
  text: string;
  mentions?: string[];
};

export type MessagePayload = TextMessagePayload;

export type QueueMessage = {
  id: string;
  type: MessageQueueType;
  destinationGroup: string;
  payload: MessagePayload;
  status: MessageQueueStatus;
  priority: number;
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
};
