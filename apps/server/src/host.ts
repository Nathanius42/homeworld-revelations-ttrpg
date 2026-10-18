import type { IncomingMessage } from "node:http";

/**
 * The host is whoever sits at the PC running the server. Host-only pages and APIs (the host
 * console, the saved-table list, quitting) answer only requests from this machine, so other
 * devices on someone else's Wi-Fi can play but can't browse or stop the game.
 */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1" || address.startsWith("127.");
}

export function fromHost(req: { socket: { remoteAddress?: string } } | IncomingMessage): boolean {
  return isLoopback(req.socket.remoteAddress);
}

export interface DeviceInfo {
  address: string;
  tableCode: string;
  name: string;
  role: string;
  since: number;
}

/** Live WebSocket connections, so the host can see phones arrive: the real network test. */
export class Devices {
  private readonly live = new Map<object, DeviceInfo>();

  add(socket: object, info: DeviceInfo): void {
    this.live.set(socket, info);
  }

  remove(socket: object): void {
    this.live.delete(socket);
  }

  list(): DeviceInfo[] {
    return [...this.live.values()].sort((a, b) => a.since - b.since);
  }

  /** Devices other than this PC: if this is above zero, the firewall and Wi-Fi are fine. */
  remoteCount(): number {
    return new Set(this.list().filter((d) => !isLoopback(d.address)).map((d) => d.address)).size;
  }
}
