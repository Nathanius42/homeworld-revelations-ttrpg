import { execFile } from "node:child_process";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

export interface LanAddress {
  address: string;
  /** The adapter's name as Windows or the OS reports it, such as "Wi-Fi" or "vEthernet (WSL)". */
  adapter: string;
  /** True for virtual, VPN and container adapters that phones on the Wi-Fi usually can't reach. */
  virtual: boolean;
  /** Windows Mobile hotspot: phones that join the laptop's own network use this address. */
  hotspot?: boolean;
}

const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|vboxnet|veth|br-|virbr|Tailscale|ZeroTier|WireGuard|VPN|TAP|tun|utun|Bluetooth|Npcap|Loopback/i;
const PHYSICAL = /Wi-?Fi|WLAN|Wireless|Ethernet|^en\d|^eth\d|^wl/i;

/** The address Windows always gives the laptop on its own Mobile hotspot. */
const HOTSPOT = "192.168.137.1";

function privateRank(ip: string): number {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  const [a = 0, b = 0] = ip.split(".").map(Number);
  if (a === 172 && b >= 16 && b <= 31) return 2;
  return 3;
}

/**
 * The IPv4 addresses other devices might use to reach this machine, best first.
 * Real Wi-Fi and Ethernet adapters on private ranges come first; virtual adapters
 * (WSL, Hyper-V, VPNs) go last because phones on the same Wi-Fi can't reach them.
 */
export function rankAddresses(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): LanAddress[] {
  const found: (LanAddress & { score: number })[] = [];
  for (const [adapter, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      if (info.address.startsWith("169.254.")) continue; // No DHCP answer: unreachable.
      const virtual = VIRTUAL.test(adapter) || isCgnat(info.address);
      const score = (virtual ? 100 : 0) + (PHYSICAL.test(adapter) ? 0 : 10) + privateRank(info.address);
      found.push({ address: info.address, adapter, virtual, score, ...(info.address === HOTSPOT ? { hotspot: true } : {}) });
    }
  }
  return found.sort((x, y) => x.score - y.score).map(({ score: _score, ...a }) => a);
}

/** 100.64.0.0/10 is carrier-grade NAT, which Tailscale and similar overlays use. */
function isCgnat(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

export function lanAddresses(): LanAddress[] {
  return rankAddresses(networkInterfaces());
}

/** How Windows classes a network the laptop is on. Public networks block incoming connections unless an app is allowed. */
export interface NetworkProfile {
  adapter: string;
  /** The Wi-Fi or network name. */
  network: string;
  category: "public" | "private" | "domain";
}

const CATEGORY = ["public", "private", "domain"] as const;

/** Parses Get-NetConnectionProfile's JSON, which is an object for one network and an array for several. */
export function parseProfiles(json: string): NetworkProfile[] {
  try {
    const raw = JSON.parse(json) as unknown;
    const list = (Array.isArray(raw) ? raw : [raw]) as { InterfaceAlias?: string; Name?: string; NetworkCategory?: number | string }[];
    return list
      .filter((p) => p && p.InterfaceAlias)
      .map((p) => ({
        adapter: p.InterfaceAlias!,
        network: p.Name ?? "",
        category: typeof p.NetworkCategory === "number" ? (CATEGORY[p.NetworkCategory] ?? "public") : (String(p.NetworkCategory).toLowerCase().replace("domainauthenticated", "domain") as NetworkProfile["category"]),
      }));
  } catch {
    return [];
  }
}

let profileCache: { at: number; profiles: NetworkProfile[] } | undefined;

/**
 * The laptop's networks and whether Windows treats each as Public, read-only, for the host
 * console's network help. Cached for 30 seconds; empty on other systems or if PowerShell fails.
 */
export function networkProfiles(): Promise<NetworkProfile[]> {
  if (process.platform !== "win32") return Promise.resolve([]);
  if (profileCache && Date.now() - profileCache.at < 30_000) return Promise.resolve(profileCache.profiles);
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-NetConnectionProfile | Select-Object InterfaceAlias,NetworkCategory,Name | ConvertTo-Json -Compress"],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        const profiles = err ? [] : parseProfiles(stdout);
        profileCache = { at: Date.now(), profiles };
        resolve(profiles);
      },
    );
  });
}
