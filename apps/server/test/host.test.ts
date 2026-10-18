import { describe, expect, it } from "vitest";
import { Devices, fromHost, isLoopback } from "../src/host.js";

describe("host-only access", () => {
  it("recognises this PC and nobody else", () => {
    for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "127.0.1.1"]) expect(isLoopback(a)).toBe(true);
    for (const a of ["192.168.50.20", "::ffff:192.168.50.20", "10.0.0.5", "", undefined]) expect(isLoopback(a)).toBe(false);
    expect(fromHost({ socket: { remoteAddress: "::1" } })).toBe(true);
    expect(fromHost({ socket: { remoteAddress: "192.168.1.9" } })).toBe(false);
  });

  it("counts other devices, not this PC, and forgets them when they leave", () => {
    const d = new Devices();
    const host = {};
    const phone = {};
    const tablet = {};
    d.add(host, { address: "::1", tableCode: "ABCD", name: "TV", role: "spectator", since: 1 });
    d.add(phone, { address: "::ffff:192.168.1.20", tableCode: "ABCD", name: "Robin", role: "player", since: 2 });
    d.add(tablet, { address: "::ffff:192.168.1.21", tableCode: "ABCD", name: "Ash", role: "player", since: 3 });
    expect(d.remoteCount()).toBe(2);
    d.remove(phone);
    expect(d.remoteCount()).toBe(1);
    expect(d.list().map((x) => x.name)).toEqual(["TV", "Ash"]);
  });
});
