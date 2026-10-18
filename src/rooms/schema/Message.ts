import { schema, t } from "@colyseus/schema";

export class Message extends schema({
    content: t.string().default(""),
    senderId: t.string(),
    senderName: t.string(),
    timestamp: t.number()
}){};