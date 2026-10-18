import { ArraySchema, schema, t } from "@colyseus/schema";
import { Player } from "./Player";
import { Message } from "./Message";

export class GameState extends schema({
    hostSessionId: t.string().default(""),
    sessionName: t.string(),
    players: t.map(Player),
    spectatorCount: t.number().default(0),
    maxSpectators: t.number().default(0),
    round: t.number().default(1),
    maxRounds: t.number().default(5),
    puckPosition: t.array("number").default(new ArraySchema(0, 0.5, 0)),
    hasStarted: t.boolean().default(false),
    messages: t.array(Message).default(new ArraySchema())
}){};