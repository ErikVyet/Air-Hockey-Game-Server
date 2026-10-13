import { AuthContext, Client, Room } from "colyseus";
import { GameState } from "./schema/GameState";
import { ArraySchema } from "@colyseus/schema";
import { Player } from "./schema/Player";

export class Session extends Room<{ state: GameState }> {
    state = new GameState();
    maxClients = 6;

    protected password: string;

    /* Session constructor (runs when a new room is created) */
    onCreate(options: any): void | Promise<any> {
        if (options?.sessionName) {
            this.state.sessionName = options?.sessionName as string;
        }
        if (options?.password) {
            this.password = options?.password as string;
        }

        this.setMetadata({ 
            sessionName: this.state.sessionName,
            hasPassword: !!this.password
        });

        this.onMessage("updatePuck", (_client, message, _context) => {
            this.state.puckPosition = new ArraySchema<number>(...message.position as [number, number, number]);
        });

        this.onMessage("updateStriker", (client, message, _context) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.role !== "player") return;

            if (Array.isArray(message)) {
                player.position = new ArraySchema<number>(...message as [number, number, number]);

            }
        });

        this.onMessage("updateScores", (client, message, _context) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.role !== "player") return;

            const isScored = message.isScored as boolean;
            player.scores.push(isScored ? 1 : 0);
        });

        this.onMessage("updateRound", () => {
            const currentRound = this.state.round;
            if (currentRound < this.state.maxRound) {
                this.state.round++;
            }
        });
    }

    /* Runs before onJoin (runs when user join a room) */
    onAuth(client: Client, options: any, context: AuthContext) {
        if (this.password && options?.password !== this.password) {
            console.log(this.password);
            throw new Error("Invalid password");
        }
        return {
            name: options?.name ?? `Player${client.sessionId.substring(0, 4)}`,
            ipAddress: context.ip
        }
    }

    /* Runs when user joins the session */
    onJoin(client: Client<any>, options?: any, auth?: any): void | Promise<any> {
        let playerCount = 0;
        this.state.players.forEach(player => {
            if (player.role === "player") playerCount++;
        });

        const newPlayer = new Player();
        newPlayer.name = client.auth?.name as string;
        newPlayer.role = playerCount < 2 ? "player" : "spectator";
        newPlayer.position = new ArraySchema<number>(...options?.position as [number, number, number]);
        
        this.state.spectatorCount += newPlayer.role === "player" ? 0 : 1;
        this.state.players.set(client.sessionId, newPlayer);
    }

    /* Runs when a user leaves the session */
    onLeave(client: Client<any>, code?: number): void | Promise<any> {
        const player = this.state.players.get(client.sessionId);
        if (this.state.players.delete(client.sessionId) && player.role === "spectator") {
            this.state.spectatorCount--;
        }
    }

}