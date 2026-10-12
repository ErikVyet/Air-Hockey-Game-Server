import { ArraySchema, schema, t } from "@colyseus/schema";

export class Player extends schema({
    name: t.string(),
    role: t.string().default("spectator"),
    position: t.array("number").default(new ArraySchema(0, 0, 0)),
    scores: t.array("number").default(new ArraySchema())
}){};