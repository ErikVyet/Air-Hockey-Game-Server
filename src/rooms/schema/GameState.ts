import { ArraySchema, schema, t } from "@colyseus/schema";
import { Player } from "./Player";

export class GameState extends schema({
    sessionName: t.string(),
    players: t.map(Player),
    spectatorCount: t.number().default(0),
    round: t.number().default(1),
    maxRound: t.number().default(5),
    puckPosition: t.array("number").default(new ArraySchema(0, 0.5, 0))
}){};