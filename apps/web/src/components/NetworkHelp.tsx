import { QrCode } from "./QrCode";

export interface NetworkProfile {
  adapter: string;
  network: string;
  category: "public" | "private" | "domain";
}

interface Props {
  port: number;
  addresses: { address: string; adapter: string; virtual: boolean; hotspot?: boolean }[];
  profiles: NetworkProfile[];
  /** The table code, for the hotspot join link. */
  code?: string;
  onClose: () => void;
}

/**
 * What to try when phones can't reach the laptop, in the order that usually fixes it at a
 * friend's house. The app never changes firewall or network settings itself; it only reads
 * how Windows classes each network so it can point at the likely culprit.
 */
export function NetworkHelp({ port, addresses, profiles, code, onClose }: Props) {
  const real = addresses.filter((a) => !a.virtual && !a.hotspot);
  const hotspot = addresses.find((a) => a.hotspot);
  const publicNets = profiles.filter((p) => p.category === "public");
  const main = real[0];
  const hotspotUrl = hotspot ? `http://${hotspot.address}:${port}${code ? `/t/${code}` : ""}` : "";

  return (
    <section className="frame host-help" aria-label="Network help">
      <div className="panel-title">
        Phones can't connect?
        <span className="spacer" />
        <button className="btn small" onClick={onClose}>
          Hide
        </button>
      </div>
      <div className="panel-body">
        {!main && !hotspot && (
          <p className="host-help-alert">This laptop isn't on a network yet. Join the Wi-Fi (or plug in a cable) first; the QR code updates by itself.</p>
        )}
        <ol className="host-help-steps">
          <li>
            <b>Same Wi-Fi.</b> Every phone must be on the same network as this laptop
            {profiles.length ? (
              <>
                {" "}
                (<b>{profiles.map((p) => p.network || p.adapter).join(", ")}</b>)
              </>
            ) : null}
            , not on mobile data. Phones on a separate guest network can't see it.
          </li>
          <li>
            <b>Windows Firewall.</b>{" "}
            {publicNets.length ? (
              <span className="host-help-alert">
                Windows treats {publicNets.map((p) => p.network || p.adapter).join(", ")} as a <b>Public</b> network, which blocks phones unless the game is allowed there. This is the usual
                culprit.
              </span>
            ) : (
              <>Windows asks the first time the game runs; if only Private was ticked, phones on a Public network are blocked.</>
            )}{" "}
            Either:
            <ul>
              <li>
                open <b>Windows Security › Firewall &amp; network protection › Allow an app through firewall</b>, press <b>Change settings</b>, and tick <b>Public</b> for{" "}
                <b>Node.js</b> (the portable build's is <span className="mono">runtime\node.exe</span> in the HWR-App folder); or
              </li>
              <li>
                if you trust this network, open <b>Settings › Network &amp; internet › Wi-Fi</b> (or Ethernet), choose the network, and set <b>Network profile type</b> to{" "}
                <b>Private</b>.
              </li>
            </ul>
          </li>
          <li>
            <b>Test from a phone.</b> Open{" "}
            <span className="mono">{main ? `http://${main.address}:${port}/api/health` : `http://<laptop address>:${port}/api/health`}</span> in its browser. A line of text means the network
            works; a page that never loads means something between them is blocking it.
          </li>
          <li>
            <b>Guest Wi-Fi that isolates devices.</b> Many routers stop devices on guest Wi-Fi talking to each other, and no setting on the laptop can fix that. Turn on{" "}
            <b>Settings › Network &amp; internet › Mobile hotspot</b> and have phones join the laptop's own network instead. The laptop stays online through the Wi-Fi, so the Claude GM
            still works.
            {hotspot ? (
              <div className="host-help-hotspot">
                <QrCode text={hotspotUrl} size={160} label="Scan to join over the laptop's hotspot" />
                <div>
                  <div className="label">Hotspot is on</div>
                  <div className="mono">{hotspotUrl.replace(/^http:\/\//, "")}</div>
                  <div className="dim">Phones joined to the hotspot scan this one.</div>
                </div>
              </div>
            ) : (
              <div className="dim">When the hotspot is on, a second QR code for it appears here.</div>
            )}
          </li>
        </ol>
      </div>
    </section>
  );
}
