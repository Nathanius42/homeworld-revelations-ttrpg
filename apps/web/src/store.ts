import { create } from "zustand";
import type { ClientMessage, Role, ServerMessage, TableState } from "@hwr/protocol";

type Status = "idle" | "connecting" | "open" | "closed";

interface Toast {
  id: number;
  text: string;
}

interface Store {
  status: Status;
  code?: string;
  playerId?: string;
  state?: TableState;
  toasts: Toast[];
  /** When this device last sent something the game hasn't answered yet, so taps always show a response. */
  sentAt?: number;
  connect(code: string, name: string, role: Role): void;
  disconnect(): void;
  send(msg: ClientMessage): void;
  toast(text: string): void;
}

const storage = {
  get(key: string): string | undefined {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: the player just gets a new seat next time */
    }
  },
};

export const prefs = {
  name: () => storage.get("hwr.name") ?? "",
  setName: (n: string) => storage.set("hwr.name", n),
  role: (code: string) => (storage.get(`hwr.role.${code}`) as Role | undefined) ?? "player",
  setRole: (code: string, role: Role) => storage.set(`hwr.role.${code}`, role),
  muted: () => storage.get("hwr.muted") === "1",
  setMuted: (m: boolean) => storage.set("hwr.muted", m ? "1" : "0"),
};

let socket: WebSocket | undefined;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let wanted: { code: string; name: string; role: Role } | undefined;
let toastId = 0;

export const useStore = create<Store>((set, get) => ({
  status: "idle",
  toasts: [],

  connect(code, name, role) {
    wanted = { code: code.toUpperCase(), name, role };
    open();
  },

  disconnect() {
    wanted = undefined;
    clearTimeout(retryTimer);
    socket?.close();
    socket = undefined;
    set({ status: "idle", state: undefined, code: undefined, playerId: undefined });
  },

  send(msg) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
      set({ sentAt: Date.now() });
    } else get().toast("Not connected. Reconnecting…");
  },

  toast(text) {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
}));

function open(): void {
  if (!wanted) return;
  const { code, name, role } = wanted;
  socket?.close();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;
  useStore.setState({ status: "connecting", code });
  // Spectators (like a TV view) keep their own identity so they never take over a player's seat.
  const seatKey = `hwr.player.${code}${role === "spectator" ? ".watch" : ""}`;
  ws.onopen = () => {
    retry = 0;
    const playerId = storage.get(seatKey);
    ws.send(JSON.stringify({ type: "hello", tableCode: code, playerId, name, role } satisfies ClientMessage));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as ServerMessage;
    if (msg.type === "welcome") {
      storage.set(seatKey, msg.playerId);
      useStore.setState({ status: "open", playerId: msg.playerId, state: msg.state, sentAt: undefined });
    } else if (msg.type === "state") {
      const current = useStore.getState().state;
      if (!current || msg.state.seq >= current.seq) useStore.setState({ state: msg.state, sentAt: undefined });
    } else if (msg.type === "error") {
      useStore.setState({ sentAt: undefined });
      useStore.getState().toast(msg.message);
    }
  };
  ws.onclose = (ev) => {
    if (socket !== ws) return;
    useStore.setState({ status: "closed" });
    if (ev.code === 4004 || ev.code === 4003 || ev.code === 4000) {
      wanted = undefined;
      return;
    }
    if (!wanted) return;
    retryTimer = setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
  };
}

/**
 * When a campaign continues, this device keeps its seat (and so its character) at the next
 * table: the server carries the seats over with the same ids.
 */
export function moveSeat(from: string, to: string): void {
  for (const suffix of ["", ".watch"]) {
    const seat = storage.get(`hwr.player.${from}${suffix}`);
    if (seat) storage.set(`hwr.player.${to}${suffix}`, seat);
  }
  const role = storage.get(`hwr.role.${from}`);
  if (role) storage.set(`hwr.role.${to}`, role);
}

/** Convenience selectors. */
export function useMe() {
  return useStore((s) => s.state?.players.find((p) => p.id === s.playerId));
}
