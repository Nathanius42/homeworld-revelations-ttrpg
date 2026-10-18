import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * A QR code drawn in the browser, so joining never depends on an outside service.
 * Dark modules on a light tile with the standard four-module quiet zone: inverted
 * codes look more on-theme but some phone cameras won't read them.
 */
export function QrCode({ text, size = 160, label }: { text: string; size?: number; label?: string }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    }
    return { path: d, n: count + 8 };
  }, [text]);
  return (
    <svg className="qr" role="img" aria-label={label ?? `QR code for ${text}`} data-url={text} viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges">
      <rect width={n} height={n} style={{ fill: "#e9f6f8" }} />
      <path d={path} style={{ fill: "#04070b" }} />
    </svg>
  );
}
