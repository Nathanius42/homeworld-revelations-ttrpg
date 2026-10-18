import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { parseProfiles, rankAddresses } from "../src/network.js";

function v4(address: string, internal = false): NetworkInterfaceInfo {
  return { address, family: "IPv4", internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: `${address}/24` };
}

describe("rankAddresses", () => {
  it("puts the Wi-Fi address ahead of WSL, Hyper-V and VPN adapters", () => {
    const ranked = rankAddresses({
      "vEthernet (WSL (Hyper-V firewall))": [v4("172.29.48.1")],
      "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)],
      Tailscale: [v4("100.101.12.4")],
      "Wi-Fi": [v4("192.168.1.23"), { address: "fe80::1", family: "IPv6", internal: false, netmask: "ffff:ffff:ffff:ffff::", mac: "00:00:00:00:00:00", cidr: "fe80::1/64", scopeid: 0 }],
      "vEthernet (Default Switch)": [v4("172.20.96.1")],
    });
    expect(ranked[0]).toEqual({ address: "192.168.1.23", adapter: "Wi-Fi", virtual: false });
    expect(ranked.map((a) => a.address)).not.toContain("127.0.0.1");
    expect(ranked.filter((a) => a.virtual).map((a) => a.adapter)).toEqual(
      expect.arrayContaining(["Tailscale", "vEthernet (Default Switch)", "vEthernet (WSL (Hyper-V firewall))"]),
    );
    expect(ranked.slice(1).every((a) => a.virtual)).toBe(true);
  });

  it("skips self-assigned addresses and keeps the laptop's own hotspot", () => {
    const ranked = rankAddresses({
      Ethernet: [v4("169.254.10.2")],
      "Local Area Connection* 10": [v4("192.168.137.1")],
    });
    expect(ranked).toEqual([{ address: "192.168.137.1", adapter: "Local Area Connection* 10", virtual: false, hotspot: true }]);
  });

  it("prefers a physical adapter's 10.x address over an unknown adapter's 192.168.x address", () => {
    const ranked = rankAddresses({ "Some Adapter": [v4("192.168.5.5")], Ethernet: [v4("10.0.0.7")] });
    expect(ranked[0]?.address).toBe("10.0.0.7");
  });
});

describe("parseProfiles", () => {
  it("reads one network or several, and names the category", () => {
    expect(parseProfiles('{"InterfaceAlias":"Wi-Fi","NetworkCategory":0,"Name":"Smiths Guest"}')).toEqual([{ adapter: "Wi-Fi", network: "Smiths Guest", category: "public" }]);
    expect(
      parseProfiles('[{"InterfaceAlias":"Ethernet","NetworkCategory":1,"Name":"Home"},{"InterfaceAlias":"Wi-Fi","NetworkCategory":"DomainAuthenticated","Name":"Work"}]').map((p) => p.category),
    ).toEqual(["private", "domain"]);
  });

  it("gives nothing for empty or broken output", () => {
    expect(parseProfiles("")).toEqual([]);
    expect(parseProfiles("not json")).toEqual([]);
  });
});
