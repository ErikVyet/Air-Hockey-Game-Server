import { AuthContext, Client, CloseCode, ErrorCode, Room } from "colyseus";
import { GameState } from "./schema/GameState";
import { ArraySchema } from "@colyseus/schema";
import { Player } from "./schema/Player";
import { SessionMessage } from "../enums/SessionMessage";
import { ExtendCloseCode } from "../enums/ExtendCloseCode";
import { ExtendErrorCode } from "../enums/ExtendErrorCode";
import { Message } from "./schema/Message";
import { MAX_MESSAGES_COUNT, MAX_RECONNECTION_DURATION, MAX_ROUNDS, MIN_ROUNDS } from "../constants/State";


/* Options' JSON structure for hosting
{
    "sessionName": ...,
    "password": ...,
    "position": ...,
    "spectatorCount": ...,
    "isHost": ...
}
*/
export class Session extends Room<{ state: GameState }> {
    state = new GameState();

    protected password: string;

    /* Session constructor (runs when a new room is created) */
    onCreate(options: any): void | Promise<any> {
        if (options?.sessionName) {
            this.state.sessionName = options?.sessionName as string;
        }
        if (options?.password) {
            this.password = options?.password as string;
        }
        this.state.maxSpectators = Number(options?.spectatorCount);
        this.maxClients = Number(options?.spectatorCount) + 2;

        this.setMetadata({ 
            sessionName: this.state.sessionName,
            hasPassword: !!this.password
        });

        this.onMessage(SessionMessage.START_GAME, (client) => {
            let flag = true;
            let playerCount = 0;
            this.state.players.forEach(player => {
                if (!player.isReady) {
                    flag = false;
                }
                if (player.role === "player") {
                    playerCount++;
                }
            });

            if (flag && playerCount === 2) {
                this.lock().then(() => {
                    this.state.hasStarted = true;
                }).catch(reason => {
                    client.send(SessionMessage.CAUGHT_ERROR, {
                        code: ExtendErrorCode.INTERNAL_SERVER_ERROR,
                        message: "Something went wrong. Please try again later"
                    });
                });
            }
            else {
                client.send(SessionMessage.CAUGHT_ERROR, {
                    code: ExtendErrorCode.BAD_REQUEST,
                    message: playerCount !== 2 ? "Require another player to start" : "Some players are not ready yet"
                });
            }
        });

        this.onMessage(SessionMessage.START_COUNT_DOWN, (client) => {
            if (client.sessionId !== this.state.hostSessionId) return;

            if (this.state.countDown < 0) return;

            const interval = setInterval(() => {
                this.state.countDown--;
                
                if (this.state.countDown < 0) {
                    clearInterval(interval);
                }
            }, 1000);
        });

        this.onMessage(SessionMessage.UPDATE_MAX_ROUNDS, (client, maxRounds: number) => {
            if (client.sessionId === this.state.hostSessionId) {
                this.state.maxRounds = Math.max(MIN_ROUNDS, Math.min(maxRounds, MAX_ROUNDS));
            }
        });

        this.onMessage(SessionMessage.UPDATE_PUCK, (client, position: [number, number, number]) => {
            this.broadcast(SessionMessage.UPDATE_PUCK, position, { except: client });
        });

        this.onMessage(SessionMessage.UPDATE_STRIKER, (client, position: [number, number, number]) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.role !== "player") return;

            player.position = new ArraySchema<number>(...position);
        });

        this.onMessage(SessionMessage.UPDATE_SCORES, (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.role !== "player") return;

            player.score++;
        });

        this.onMessage(SessionMessage.UPDATE_ROUND, () => {
            const currentRound = this.state.round;
            if (currentRound < this.state.maxRounds) {
                this.state.round++;
            }
        });

        this.onMessage(SessionMessage.UPDATE_MAX_SPECTATORS, (client, cmd: "+" | "-") => {
            if (client.sessionId === this.state.hostSessionId) {
                this.state.maxSpectators += cmd === "+" ? 1: -1;
                this.maxClients += cmd === "+" ? 1 : -1;
            }
        });

        this.onMessage(SessionMessage.UPDATE_PLAYER_NAME, (client, newName: string) => {
            if (!newName || newName === "") {
                client.send(SessionMessage.CAUGHT_ERROR, {
                    code: ExtendErrorCode.BAD_REQUEST,
                    message: "Player's name can not be blank" 
                });
                return;
            }
            let flag = true;
            this.state.players.forEach(player => {
                if (player.sessionId !== client.sessionId && player.name === newName) {
                    flag = false;
                }
            });

            if (!flag) {
                client.send(SessionMessage.CAUGHT_ERROR, {
                    code: ExtendErrorCode.BAD_REQUEST,
                    message: "Someone else has already had the name" 
                });
                return;
            }

            const player = this.state.players.get(client.sessionId);
            if (player) {
                this.state.messages = new ArraySchema(...this.state.messages.map(message => {
                    message.senderName = (message.senderId === player.sessionId && message.senderName === player.name) ? newName : message.senderName;
                    return message;
                }));
                player.name = newName;
            }
            else {
                client.send(SessionMessage.CAUGHT_ERROR, {
                    code: ExtendErrorCode.NOT_FOUND,
                    message: "Player not found" 
                });
            }
        });

        this.onMessage(SessionMessage.UPDATE_PLAYER_ROLE, (client, newRole: "player" | "spectator") => {
            if (client.sessionId !== this.state.hostSessionId) {
                const targetPlayer = this.state.players.get(client.sessionId);
                if (targetPlayer) {
                    targetPlayer.role = newRole;
                    targetPlayer.isReady = newRole === "spectator";
                }
                else {
                    client.send(SessionMessage.CAUGHT_ERROR, { 
                        code: ExtendErrorCode.NOT_FOUND,
                        message: "Player not found" 
                    });
                }
            }
        });

        this.onMessage(SessionMessage.UPDATE_PLAYER_READY_STATE, (client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.isReady = !player.isReady;
            }
            else {
                client.send(SessionMessage.CAUGHT_ERROR, { 
                    code: ExtendErrorCode.NOT_FOUND,
                    message: "Player not found" 
                });
            }
        });

        this.onMessage(SessionMessage.KICK_PLAYER, (client, targetSessionId: string) => {
            if (this.state.players.get(client.sessionId).isHost) {
                const targetClient = this.clients.get(targetSessionId);
                targetClient?.leave(ExtendCloseCode.KICK_PLAYER);
            }
        });

        this.onMessage(SessionMessage.SEND_MESSAGE, (client, content: string) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                const message = new Message();
                message.content = content;
                message.senderId = player.sessionId;
                message.senderName = player.name;
                message.timestamp = Date.now();
                this.state.messages.push(message);
                if (this.state.messages.length > MAX_MESSAGES_COUNT) {
                    this.state.messages.shift();
                }
            }
            else {
                client.send(SessionMessage.CAUGHT_ERROR, {
                    code: ExtendErrorCode.NOT_FOUND,
                    message: "Player not found"
                });
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
            name: options?.name ?? `Player_${client.sessionId.substring(0, 4)}`,
            ipAddress: context.ip
        }
    }

    /* Runs when user joins the session */
    onJoin(client: Client<any>, options?: any, _auth?: any): void | Promise<any> {
        let playerCount = 0;
        this.state.players.forEach(player => {
            if (player.role === "player") playerCount++;
        });
        this.state.hostSessionId = this.state.hostSessionId === "" ? client.sessionId : this.state.hostSessionId;

        const newPlayer = new Player();
        newPlayer.sessionId = client.sessionId;
        newPlayer.name = client.auth?.name as string;
        newPlayer.role = playerCount < 2 ? "player" : "spectator";
        newPlayer.position = new ArraySchema<number>(...(newPlayer.role === "player" ? options?.position as [number, number, number] : [0, 0, 0]));
        newPlayer.isHost = Boolean(options?.isHost);
        newPlayer.isReady = newPlayer.isHost || newPlayer.role === "spectator";

        this.state.spectatorCount += newPlayer.role === "player" ? 0 : 1;
        this.state.players.set(client.sessionId, newPlayer);
    }

    /* Runs when a user leaves the session */
    onLeave(client: Client<any>, code?: number): void | Promise<any> {
        if (code !== CloseCode.CONSENTED && code !== CloseCode.SERVER_SHUTDOWN && code !== ExtendCloseCode.KICK_PLAYER) {
            try {
                this.allowReconnection(client, MAX_RECONNECTION_DURATION).then(() => {
                    console.log(`Player ${client.sessionId} reconnected`);
                });
                return;
            }
            catch (error) {
                console.log("Unable to reconnect player to session");
            }
        }

        const player = this.state.players.get(client.sessionId);
        if (player.isHost) {
            this.clients.forEach(client => {
                if (player.sessionId !== client.sessionId) {
                    client.leave(CloseCode.SERVER_SHUTDOWN);
                }
            });
            this.state.players.delete(player.sessionId);
        }
        else if (this.state.players.delete(client.sessionId) && player.role === "spectator") {
            this.state.spectatorCount--;
        }
    }

}