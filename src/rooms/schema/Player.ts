import { ArraySchema, schema, t } from "@colyseus/schema";

export class Player extends schema({
    sessionId: t.string(),
    name: t.string(),
    role: t.string().default("spectator"),
    position: t.array("number").default(new ArraySchema(0, 0, 0)),
    score: t.number().default(0),
    isHost: t.boolean(),
    isReady: t.boolean().default(true)
}){};