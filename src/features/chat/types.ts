export const CHAT_BUCKET = 'chat-files';
export const CHAT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const CHAT_MAX_FILES = 10;

export type ChatAttachment = { path: string; name: string; type: string; size: number };
/** An attachment ready to show: signed links valid for an hour. */
export type ChatAttachmentView = ChatAttachment & { url: string | null; downloadUrl: string | null };

export type ChatMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  attachments: ChatAttachmentView[];
  createdAt: string;
  readAt: string | null;
};

export type ChatPerson = { userId: string; name: string; email: string };

/** One row of the "To" list: the teammate, unread count and latest message. */
export type ChatContact = ChatPerson & {
  unread: number;
  last: { body: string; at: string; fromMe: boolean; hasFiles: boolean } | null;
};

export type ChatResult<T> = { ok: true; data: T } | { ok: false; error: string };
