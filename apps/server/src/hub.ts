import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { chooseKokoro, chunks, speakableText, type ClientMessage, type ServerMessage } from "@hwr/protocol";
import { DEFAULT_MISSION_ID, MISSIONS } from "@hwr/content";
import { ClaudeGm, type MessagesClient } from "./claude-gm.js";
import { carryOver, nextMissionId } from "./campaign.js";
import { prefetch } from "./tts.js";
import { Game, GameError, newTableState } from "./engine.js";
import { startingInventory } from "./inventory.js";
import { portraitOrFallback } from "./local-portraits.js";
import type { Store } from "./store.js";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** One live table: the game, its sockets and its GM. */
export class Table {
  readonly game: Game;
  private readonly sockets = new Map<WebSocket, string>();
  private gm?: ClaudeGm;

  constructor(
    state: ReturnType<typeof newTableState>,
    private readonly store: Store,
    ai?: MessagesClient,
  ) {
    for (const p of state.players) p.connected = false;
    // Tables saved before missions had banner art.
    state.missionArt ??= MISSIONS[state.missionId]?.art ?? "/art/scenes/title.webp";
    state.missionMusic ??= MISSIONS[state.missionId]?.music;
    state.missionVoices ??= MISSIONS[state.missionId]?.voices;
    state.missionPrimer ??= MISSIONS[state.missionId]?.primer;
    state.gmThinking = false;
    for (const sheet of state.sheets) sheet.portrait = portraitOrFallback(sheet.portrait, sheet.id);
    for (const sheet of state.sheets) {
      const c = state.characters[sheet.id];
      if (c && !c.inventory) c.inventory = startingInventory(sheet.equipment);
    }
    this.game = new Game(state);
    this.setAi(ai, false);
    this.game.hooks = {
      onPlayerAction: (player, text) => {
        if (this.game.state.gmMode === "claude") this.gm?.onPlayerAction(player, text);
      },
      onSideRoll: (record) => {
        if (this.game.state.gmMode === "claude") this.gm?.onSideRoll(record);
      },
    };
  }

  get code(): string {
    return this.game.state.code;
  }

  /** Turns the Claude GM on or off, for instance when the host pastes or removes a key mid-session. */
  setAi(ai: MessagesClient | undefined, announce = true): void {
    const state = this.game.state;
    state.aiAvailable = Boolean(ai);
    if (!ai && state.gmMode === "claude") state.gmMode = "director";
    this.gm = ai ? new ClaudeGm(this.game, ai, () => this.commit()) : undefined;
    if (announce) this.commit();
  }

  connect(socket: WebSocket, hello: Extract<ClientMessage, { type: "hello" }>): void {
    const player = this.game.join(hello.name, hello.role, hello.playerId);
    for (const [s, id] of this.sockets) if (id === player.id && s !== socket) s.close(4000, "Opened in another tab");
    this.sockets.set(socket, player.id);
    this.send(socket, { type: "welcome", playerId: player.id, state: this.game.state });
    socket.on("message", (data) => this.receive(socket, data.toString()));
    socket.on("close", () => {
      if (this.sockets.get(socket) !== player.id) return;
      this.sockets.delete(socket);
      if (![...this.sockets.values()].includes(player.id)) {
        this.game.disconnect(player.id);
        this.commit();
      }
    });
    this.store.recordAction(this.game.state, player.id, { type: "hello", name: hello.name, role: hello.role });
    this.commit();
  }

  private receive(socket: WebSocket, raw: string): void {
    const playerId = this.sockets.get(socket);
    if (!playerId) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
      if (typeof msg?.type !== "string") throw new Error("no type");
    } catch {
      return this.send(socket, { type: "error", message: "Malformed message." });
    }
    try {
      this.game.handle(playerId, msg);
      this.store.recordAction(this.game.state, playerId, msg);
      this.commit();
    } catch (err) {
      if (err instanceof GameError) return this.send(socket, { type: "error", message: err.message });
      console.error(`table ${this.code}: ${msg.type} failed`, err);
      this.send(socket, { type: "error", message: "Something went wrong on the server." });
      this.commit();
    }
  }

  commit(): void {
    this.speakAhead();
    this.game.state.seq += 1;
    this.store.save(this.game.state);
    const message: ServerMessage = { type: "state", state: this.game.state };
    const payload = JSON.stringify(message);
    for (const socket of this.sockets.keys()) if (socket.readyState === socket.OPEN) socket.send(payload);
  }

  /** The last log entry already handed to the voice engine. */
  private spokenUpTo?: string;

  /** Starts making Kokoro audio for new narration straight away, with the same sentences and voice the TV will ask for. */
  private speakAhead(): void {
    const log = this.game.state.log;
    const from = this.spokenUpTo ? log.findIndex((e) => e.id === this.spokenUpTo) + 1 : log.length;
    this.spokenUpTo = log.at(-1)?.id;
    for (const entry of log.slice(from)) {
      if (entry.type !== "narration") continue;
      const choice = chooseKokoro(entry, this.game.state.missionVoices);
      for (const piece of chunks(speakableText(entry.text))) prefetch(piece, choice.voice, choice.speed);
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }
}

/** Finds, creates and revives tables. */
export class Hub {
  private readonly tables = new Map<string, Table>();

  constructor(
    private readonly store: Store,
    private ai?: MessagesClient,
  ) {}

  /** Switches every live table (and every table opened later) to a new Claude client, or to none. */
  setAi(ai: MessagesClient | undefined): void {
    this.ai = ai;
    for (const table of this.tables.values()) table.setAi(ai);
  }

  private newCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
    } while (this.tables.has(code) || this.store.codeExists(code));
    return code;
  }

  /**
   * The next chapter of a finished table's campaign: a new table with the same crew, seats, kit
   * and story so far. Everyone on the old table is pointed at it (nextTable). Asking twice gives
   * the same table.
   */
  continueCampaign(fromCode: string): Table {
    const prev = this.get(fromCode);
    if (!prev) throw new GameError("No table with that code.");
    const old = prev.game.state;
    if (old.phase !== "ended") throw new GameError("Finish this mission before starting the next.");
    const already = old.nextTable && this.get(old.nextTable);
    if (already) return already;
    const code = this.newCode();
    const state = carryOver(old, newTableState({ id: randomUUID(), code, name: old.name, missionId: nextMissionId(old), aiAvailable: Boolean(this.ai) }));
    const table = new Table(state, this.store, this.ai);
    this.tables.set(code, table);
    this.store.save(table.game.state);
    old.nextTable = code;
    prev.commit();
    return table;
  }

  /**
   * Picks a saved campaign back up: its latest table if a chapter is still in the lobby or under
   * way, else the next chapter after the last one finished.
   */
  reopenCampaign(campaignId: string): Table {
    const latest = this.store.campaigns(100).find((c) => c.id === campaignId);
    if (!latest) throw new GameError("No saved campaign with that id.");
    if (latest.phase === "ended") return this.continueCampaign(latest.code);
    const table = this.get(latest.code);
    if (!table) throw new GameError("That campaign's table has gone missing.");
    return table;
  }

  create(name: string, missionId = DEFAULT_MISSION_ID): Table {
    const code = this.newCode();
    const state = newTableState({ id: randomUUID(), code, name: name.trim().slice(0, 48) || "Kharsaan's Promise", missionId, aiAvailable: Boolean(this.ai) });
    const table = new Table(state, this.store, this.ai);
    this.tables.set(code, table);
    this.store.save(table.game.state);
    return table;
  }

  get(code: string): Table | undefined {
    const key = code.trim().toUpperCase();
    const live = this.tables.get(key);
    if (live) return live;
    const saved = this.store.load(key);
    if (!saved) return undefined;
    const table = new Table(saved, this.store, this.ai);
    this.tables.set(key, table);
    return table;
  }
}

export { GameError };
