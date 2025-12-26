import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  type WAMessage,
  type proto,
  isJidGroup,
  jidNormalizedUser,
  isJidBroadcast,
  isJidStatusBroadcast,
} from "baileys";
import P from "pino";
import path from "node:path";
import open from "open";
import { generateQR } from "./qr-util.ts";
import {
  initializeDatabase,
  storeMessage,
  storeChat,
  type Message as DbMessage,
} from "./database.ts";
import NodeCache from "node-cache";
import fs from "node:fs";

const AUTH_DIR = path.join(import.meta.dirname, "..", "auth_info");
const groupCache = new NodeCache({ /* ... */ })

export type WhatsAppSocket = ReturnType<typeof makeWASocket>;

function parseMessageForDb(msg: WAMessage): DbMessage | null {
  //console.error("Parsing message for DB:", msg);
  if (!msg.message || !msg.key || !msg.key.remoteJid) {
    return null;
  }

  let content: string | null = null;
  const messageType = Object.keys(msg.message)[0];

  if (msg.message.conversation) {
    content = msg.message.conversation;
  } else if (msg.message.extendedTextMessage?.text) {
    content = msg.message.extendedTextMessage.text;
  } else if (msg.message.imageMessage?.caption) {
    content = `[Image] ${msg.message.imageMessage.caption}`;
  } else if (msg.message.videoMessage?.caption) {
    content = `[Video] ${msg.message.videoMessage.caption}`;
  } else if (msg.message.documentMessage?.caption) {
    content = `[Document] ${
      msg.message.documentMessage.caption ||
      msg.message.documentMessage.fileName ||
      ""
    }`;
  } else if (msg.message.audioMessage) {
    content = `[Audio]`;
  } else if (msg.message.stickerMessage) {
    content = `[Sticker]`;
  } else if (msg.message.locationMessage?.address) {
    content = `[Location] ${msg.message.locationMessage.address}`;
  } else if (msg.message.contactMessage?.displayName) {
    content = `[Contact] ${msg.message.contactMessage.displayName}`;
  } else if (msg.message.pollCreationMessage?.name) {
    content = `[Poll] ${msg.message.pollCreationMessage.name}`;
  }

  if (!content) {
    return null;
  }

  const timestampNum =
    typeof msg.messageTimestamp === "number"
      ? msg.messageTimestamp * 1000
      : typeof msg.messageTimestamp === "bigint"
      ? Number(msg.messageTimestamp) * 1000
      : Date.now();

  const timestamp = new Date(timestampNum);

  let senderJid: string | null | undefined = msg.key.participant;
  if (!msg.key.fromMe && !senderJid && !isJidGroup(msg.key.remoteJid)) {
    senderJid = msg.key.remoteJid;
  }
  if (msg.key.fromMe && !isJidGroup(msg.key.remoteJid)) {
    senderJid = null;
  }

  return {
    id: msg.key.id!,
    chat_jid: msg.key.remoteJid,
    sender: senderJid ? jidNormalizedUser(senderJid) : null,
    content: content,
    timestamp: timestamp,
    is_from_me: msg.key.fromMe ?? false,
  };
}

let num_reconnect_attempt = 0;

export async function startWhatsAppConnection(
  logger: P.Logger
): Promise<WhatsAppSocket> {

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    logger,
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
    shouldIgnoreJid: (jid) => {return isJidBroadcast(jid) || isJidStatusBroadcast(jid);},
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info(
        { qrCodeData: qr },
        "QR Code Received. Copy the qr string and use QR code generator to display and scan it with your WhatsApp app."
      );
      //Outputs QR code as PNG and opens it
      await generateQR(qr, logger);
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      logger.warn(
        `WA socket connection closed. Reason: ${DisconnectReason[statusCode as number] || "Unknown"}`,
        lastDisconnect?.error
      );

      if (statusCode !== DisconnectReason.loggedOut && num_reconnect_attempt < 3) {
        num_reconnect_attempt++;
        logger.info("Trying to reconnect to WA : Attempt #" + num_reconnect_attempt);
        startWhatsAppConnection(logger);
      } else if (statusCode === DisconnectReason.loggedOut) {
        fs.existsSync(AUTH_DIR) ? fs.rmdirSync(AUTH_DIR, { recursive: true }) : null;
        logger.info("WA socket logged out. Deleting auth info... Restart manually to re-authenticate.");
      } else {
        logger.error(
          "WA Connection Issue. Please delete auth_info, check your network and restart."
        );
        process.exit(1);
      }
    } else if (connection === "open") {
      logger.info(`WA Connection opened. Logged in as user: ${sock.user?.name}`);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on('messaging-history.set', ({
    chats: newChats,
    contacts: newContacts,
    messages: newMessages,
    syncType
  }) => {
    newChats.forEach((chat) => {
      if (!chat.id) return;
      storeChat({
        jid: chat.id,
        name: chat.name,
        last_message_time: chat.conversationTimestamp
          ? new Date(Number(chat.conversationTimestamp) * 1000)
          : undefined,
      });
    });

    let storedCount = 0;
    newMessages.forEach((msg) => {
      const parsed = parseMessageForDb(msg);
      if (parsed) {
        storeMessage(parsed);
        storedCount++;
      }
    });
    logger.info(`Stored ${storedCount} messages from WA history sync.`);
  })

  sock.ev.on('messages.upsert', ({ type, messages }) => {
    logger.info(
      { type, count: messages.length },
      "Received messages.upsert event"
    );
    if (type === "notify" || type === "append") {
      for (const msg of messages) {
        const parsed = parseMessageForDb(msg);
        if (parsed) {
          logger.info(
            {
              msgId: parsed.id,
              chatId: parsed.chat_jid,
              fromMe: parsed.is_from_me,
              sender: parsed.sender,
            },
            `Storing message: ${parsed.content.substring(0, 50)}...`
          );
          storeMessage(parsed);
        } else {
          logger.warn(
            { msgId: msg.key?.id, chatId: msg.key?.remoteJid },
            "Skipped storing message (parsing failed or unsupported type)"
          );
        }
      }
    }
  })

  sock.ev.on('chats.update', (chatUpdate) => {
    logger.info(
      { count: chatUpdate.length },
      "Received chats.update event"
    );
    for (const chat of chatUpdate) {
      storeChat({
        jid: chat.id!,
        name: chat.name,
        last_message_time: chat.conversationTimestamp
          ? new Date(Number(chat.conversationTimestamp) * 1000)
          : undefined,
      });
    }
  });

  //return socket instance
  return sock;
}

export async function sendWhatsAppMessage(
  logger: P.Logger,
  sock: WhatsAppSocket | null,
  recipientJid: string,
  text: string
): Promise<WAMessage | undefined> {
  if (!sock || !sock.user) {
    logger.error(
      "Cannot send message: WhatsApp socket not connected or initialized."
    );
    return;
  }
  if (!recipientJid) {
    logger.error("Cannot send message: Recipient JID is missing.");
    return;
  }
  if (!text) {
    logger.error("Cannot send message: Message text is empty.");
    return;
  }

  try {
    logger.info(
      `Sending message to ${recipientJid}: ${text.substring(0, 50)}...`
    );
    const normalizedJid = jidNormalizedUser(recipientJid);
    const result = await sock.sendMessage(normalizedJid, { text: text });
    logger.info({ msgId: result?.key.id }, "Message sent successfully");
    return result;
  } catch (error) {
    logger.error({ err: error, recipientJid }, "Failed to send message");
    return;
  }
}
