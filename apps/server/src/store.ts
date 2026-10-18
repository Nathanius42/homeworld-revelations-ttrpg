import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CampaignSummary, ClientMessage, TableState } from "@hwr/protocol";

export interface TableSummary {
  id: string;
  code: string;
  name: string;
  phase: string;
  missionTitle: string;
  players: number;
  updatedAt: number;
}

/**
 * Saves every table as a snapshot after each change, plus an append-only log of
 * the actions that produced it. Snapshots are the source of truth on restart; the
 * action log is there for debugging and for the session recap.
 */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS tables (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        snapshot TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS actions (
        table_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        at INTEGER NOT NULL,
        player_id TEXT,
        action TEXT NOT NULL,
        PRIMARY KEY (table_id, seq)
      );
    `);
  }

  save(state: TableState): void {
    this.db
      .prepare(
        `INSERT INTO tables (id, code, snapshot, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
      )
      .run(state.id, state.code, JSON.stringify(state), Date.now());
  }

  recordAction(state: TableState, playerId: string | null, action: ClientMessage | { type: string; [k: string]: unknown }): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO actions (table_id, seq, at, player_id, action) VALUES (?, ?, ?, ?, ?)`)
      .run(state.id, state.seq, Date.now(), playerId, JSON.stringify(action));
  }

  load(code: string): TableState | undefined {
    const row = this.db.prepare(`SELECT snapshot FROM tables WHERE code = ?`).get(code) as { snapshot: string } | undefined;
    return row ? (JSON.parse(row.snapshot) as TableState) : undefined;
  }

  list(limit = 20): TableSummary[] {
    const rows = this.db.prepare(`SELECT snapshot, updated_at FROM tables ORDER BY updated_at DESC LIMIT ?`).all(limit) as {
      snapshot: string;
      updated_at: number;
    }[];
    return rows.map((r) => {
      const s = JSON.parse(r.snapshot) as TableState;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        phase: s.phase,
        missionTitle: s.missionTitle,
        players: s.players.filter((p) => p.role === "player").length,
        updatedAt: r.updated_at,
      };
    });
  }

  /**
   * Saved campaigns, most recently played first. Every table in a campaign carries the
   * campaign's id, so each campaign is listed once, by its latest chapter's table.
   */
  campaigns(limit = 12): CampaignSummary[] {
    const rows = this.db.prepare(`SELECT snapshot, updated_at FROM tables ORDER BY updated_at DESC LIMIT 500`).all() as { snapshot: string; updated_at: number }[];
    const seen = new Map<string, CampaignSummary>();
    for (const r of rows) {
      const s = JSON.parse(r.snapshot) as TableState;
      const c = s.campaign;
      // A chapter that has been continued is superseded by its next table, even if saved later.
      if (!c || s.nextTable || seen.has(c.id)) continue;
      seen.set(c.id, {
        id: c.id,
        name: s.name,
        chapters: c.chapters.length,
        lastMission: c.chapters.at(-1)?.missionTitle,
        crew: s.sheets.filter((sh) => s.characters[sh.id]?.controllerId).map((sh) => sh.name),
        code: s.code,
        phase: s.phase,
        missionTitle: s.missionTitle,
        updatedAt: r.updated_at,
      });
      if (seen.size >= limit) break;
    }
    return [...seen.values()];
  }

  codeExists(code: string): boolean {
    return this.db.prepare(`SELECT 1 FROM tables WHERE code = ?`).get(code) !== undefined;
  }

  close(): void {
    this.db.close();
  }
}
