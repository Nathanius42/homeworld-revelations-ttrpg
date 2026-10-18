import { useEffect, useState } from "react";

interface HostInfo {
  port: number;
  addresses: { address: string; adapter: string; virtual: boolean }[];
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The origin other devices should use to reach this table. When the host is browsing at
 * localhost, that's useless to anyone else, so ask the server for its best LAN address.
 */
export function useJoinOrigin(): string {
  const [origin, setOrigin] = useState(location.origin);
  useEffect(() => {
    if (!LOOPBACK.has(location.hostname)) return;
    let cancelled = false;
    fetch("/api/host-info")
      .then((r) => r.json() as Promise<HostInfo>)
      .then((info) => {
        const best = info.addresses[0];
        if (best && !cancelled) setOrigin(`${location.protocol}//${best.address}${location.port ? `:${location.port}` : ""}`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return origin;
}

/** "http://192.168.1.23:8787/t/ABCD" reads better on screen as "192.168.1.23:8787/t/ABCD". */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
