import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type BaileysEventMap,
  type GroupMetadata,
  type WAMessage,
  type WASocket
} from "@whiskeysockets/baileys";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import pino, { type Logger } from "pino";
import qrcode from "qrcode-terminal";
import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";

export type WhatsAppConnectionStatus = "not_configured" | "connecting" | "qr_pending" | "connected" | "disconnected" | "logged_out";

export type WhatsAppGroup = {
  jid: string;
  name: string;
  participantsCount: number;
  announce: boolean;
};

export class WhatsAppConnectionManager {
  private socket?: WASocket;
  private status: WhatsAppConnectionStatus = "not_configured";
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private stopping = false;
  private messageHandler?: (message: WAMessage) => void | Promise<void>;
  private groupParticipantsHandler?: (update: BaileysEventMap["group-participants.update"]) => void | Promise<void>;
  private readonly authDir: string;
  private readonly log: Logger;

  constructor(options: { authDir?: string; log?: Logger } = {}) {
    this.authDir = path.resolve(options.authDir ?? env.WHATSAPP_AUTH_DIR);
    this.log = options.log ?? logger;
  }

  getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  getSocket(): WASocket | undefined {
    return this.socket;
  }

  setMessageHandler(handler: (message: WAMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  setGroupParticipantsHandler(handler: (update: BaileysEventMap["group-participants.update"]) => void | Promise<void>): void {
    this.groupParticipantsHandler = handler;
  }

  async start(): Promise<void> {
    if (this.status === "connecting" || this.status === "connected" || this.status === "qr_pending") {
      return;
    }

    this.status = "connecting";
    this.stopping = false;
    await mkdir(this.authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();
    const baileysLogger = pino({ level: env.BAILEYS_LOG_LEVEL });

    this.socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
      },
      browser: ["FullDev Bot", "Chrome", "1.0.0"],
      logger: baileysLogger,
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    this.socket.ev.on("creds.update", () => {
      void saveCreds();
    });
    this.socket.ev.on("messages.upsert", (update) => {
      for (const message of update.messages) {
        this.invokeHandler(this.messageHandler, message, "Message handler failed");
      }
    });
    this.socket.ev.on("group-participants.update", (update) => {
      this.invokeHandler(this.groupParticipantsHandler, update, "Group participants handler failed");
    });
    this.socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = "qr_pending";
        this.log.info("WhatsApp QR code received. Scan it using the dedicated bot phone.");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        this.status = "connected";
        this.reconnectAttempts = 0;
        this.log.info({ user: this.socket?.user?.id }, "WhatsApp connected");
      }

      if (connection === "close") {
        if (this.stopping) {
          this.log.info("WhatsApp connection closed");
          return;
        }

        const statusCode = getDisconnectStatusCode(lastDisconnect?.error);
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        this.status = loggedOut ? "logged_out" : "disconnected";
        this.log.warn({ statusCode, loggedOut }, "WhatsApp disconnected");

        if (!loggedOut) {
          this.scheduleReconnect();
        }
      }
    });

    if (!state.creds.registered && env.WHATSAPP_PAIRING_PHONE_NUMBER) {
      const code = await this.socket.requestPairingCode(env.WHATSAPP_PAIRING_PHONE_NUMBER);
      this.log.info({ pairingCode: code }, "WhatsApp pairing code generated");
    }
  }

  stop(): void {
    this.stopping = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    void this.socket?.end(undefined);
    this.socket = undefined;
    this.status = "disconnected";
  }

  async listGroups(): Promise<WhatsAppGroup[]> {
    const socket = this.requireConnectedSocket();
    const groups = await socket.groupFetchAllParticipating();

    return Object.values(groups)
      .map((group: GroupMetadata) => ({
        jid: group.id,
        name: group.subject,
        participantsCount: group.participants.length,
        announce: group.announce ?? false
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  async listParticipants(groupJid: string): Promise<string[]> {
    const socket = this.requireConnectedSocket();
    const metadata = await socket.groupMetadata(groupJid);
    return metadata.participants.map((participant) => participant.id);
  }

  async sendText(destinationJid: string, text: string, mentions: string[] = []): Promise<void> {
    const socket = this.requireConnectedSocket();
    await socket.sendMessage(destinationJid, { text, mentions });
    this.log.info({ destinationJid, mentionsCount: mentions.length }, "WhatsApp text message sent");
  }

  async sendPoll(destinationJid: string, name: string, values: string[], selectableCount = 1): Promise<void> {
    const socket = this.requireConnectedSocket();
    await socket.sendMessage(destinationJid, { poll: { name, values, selectableCount } });
    this.log.info({ destinationJid, optionsCount: values.length }, "WhatsApp poll sent");
  }

  async sendEvent(destinationJid: string, name: string, description: string | undefined, startDate: Date, endDate?: Date): Promise<void> {
    const socket = this.requireConnectedSocket();
    await socket.sendMessage(destinationJid, { event: { name, description, startDate, endDate } });
    this.log.info({ destinationJid, name }, "WhatsApp event sent");
  }

  async updateGroupDescription(groupJid: string, description: string): Promise<void> {
    const socket = this.requireConnectedSocket();
    await socket.groupUpdateDescription(groupJid, description);
    this.log.info({ groupJid }, "WhatsApp group description updated");
  }

  private invokeHandler<T>(handler: ((arg: T) => void | Promise<void>) | undefined, arg: T, errorMessage: string): void {
    try {
      const result = handler?.(arg);
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          this.log.error({ err: error }, errorMessage);
        });
      }
    } catch (error) {
      this.log.error({ err: error }, errorMessage);
    }
  }

  private requireConnectedSocket(): WASocket {
    if (!this.socket || this.status !== "connected") {
      throw new Error(`WhatsApp is not connected. Current status: ${this.status}`);
    }

    return this.socket;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const delayMs = Math.min(60_000, 5_000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.log.info({ delayMs }, "Scheduling WhatsApp reconnect");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.start().catch((error: unknown) => {
        this.status = "disconnected";
        this.log.error({ err: error }, "WhatsApp reconnect failed");
        this.scheduleReconnect();
      });
    }, delayMs);
  }
}

function getDisconnectStatusCode(error: unknown): number | undefined {
  if (error instanceof Boom) {
    return error.output.statusCode;
  }

  return undefined;
}
