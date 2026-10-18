import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Settings the host changes from the host console, kept beside the saves (on the laptop that's
 * %LOCALAPPDATA%\HWR-App\config.json), so replacing the app folder never loses them. Today
 * that's only the Claude key. It never leaves this PC: the console shows its last four
 * characters and nothing else, and it's never logged.
 */
export class Settings {
  readonly file: string;

  constructor(dataFile: string) {
    this.file = join(dirname(dataFile), "config.json");
  }

  private read(): { claudeKey?: string } {
    try {
      return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as { claudeKey?: string }) : {};
    } catch {
      return {}; // A damaged file is the same as no settings; saving rewrites it.
    }
  }

  get claudeKey(): string | undefined {
    return this.read().claudeKey?.trim() || undefined;
  }

  set claudeKey(key: string | undefined) {
    const next = { ...this.read(), claudeKey: key };
    if (!key) delete next.claudeKey;
    if (!Object.keys(next).length) {
      rmSync(this.file, { force: true });
      return;
    }
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(next, null, 2), { mode: 0o600 });
  }
}

/** Anthropic API keys start "sk-ant-"; anything else is a paste of the wrong thing. */
export function looksLikeClaudeKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key);
}

/** "…x7Qa": enough to tell keys apart, useless to anyone who sees it. */
export function keyHint(key: string | undefined): string {
  return key ? `…${key.slice(-4)}` : "";
}
