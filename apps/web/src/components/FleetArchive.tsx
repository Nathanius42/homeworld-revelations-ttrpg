import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { loadShip, type LoadedShip } from "@hwr/ship-loader";
import { FLEET, type ArchiveShip } from "../fleet";
import { cx } from "../util";

/** Whether this server has the local ship models (they're licensed, so only on Nathan's PC). */
export function useLocalShips(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { localShips?: boolean }) => setOk(Boolean(h.localShips)))
      .catch(() => setOk(false));
  }, []);
  return ok;
}

function Turntable({ ship, drag }: { ship: LoadedShip; drag: React.MutableRefObject<{ yaw: number; pitch: number; active: boolean }> }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    const distance = (ship.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.05;
    camera.position.set(0, ship.radius * 0.12, distance);
    camera.near = distance / 100;
    camera.far = distance * 10;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [ship, camera]);
  useFrame((_, dt) => {
    const d = drag.current;
    if (!d.active) d.yaw += dt * 0.18;
    if (group.current) group.current.rotation.set(d.pitch, d.yaw, 0, "YXZ");
  });
  return (
    <group ref={group}>
      <primitive object={ship.object} />
    </group>
  );
}

function ShipStage({ entry }: { entry: ArchiveShip }) {
  const [ship, setShip] = useState<LoadedShip>();
  const [error, setError] = useState<string>();
  const drag = useRef({ yaw: 0.6, pitch: 0.18, active: false });
  const last = useRef<{ x: number; y: number }>();

  useEffect(() => {
    let cancelled = false;
    setShip(undefined);
    setError(undefined);
    loadShip(`/local/ships/${entry.id}`, { team: entry.team })
      .then((s) => !cancelled && setShip(s))
      .catch(() => !cancelled && setError("This ship's model isn't on this PC."));
    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <div
      className="fleet-stage"
      onPointerDown={(e) => {
        drag.current.active = true;
        last.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current.active || !last.current) return;
        drag.current.yaw += (e.clientX - last.current.x) * 0.01;
        drag.current.pitch = Math.max(-1.2, Math.min(1.2, drag.current.pitch + (e.clientY - last.current.y) * 0.008));
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (drag.current.active = false)}
      onPointerLeave={() => (drag.current.active = false)}
    >
      <Canvas camera={{ fov: 30 }} dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <ambientLight intensity={0.45} color="#334455" />
        <directionalLight position={[-1, 0.8, 0.9]} intensity={3.2} color="#fff0dc" />
        <directionalLight position={[1.2, -0.3, -1]} intensity={2.2} color="#7fd8ff" />
        <Suspense fallback={null}>{ship && <Turntable ship={ship} drag={drag} />}</Suspense>
      </Canvas>
      {!ship && !error && (
        <div className="fleet-loading">
          <div className="scanner" /> Retrieving schematics…
        </div>
      )}
      {error && <div className="fleet-loading">{error}</div>}
      <div className="fleet-hint">Drag to turn</div>
    </div>
  );
}

export function FleetArchive({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState(FLEET[0]!);
  const factions = [...new Set(FLEET.map((s) => s.faction))];
  return (
    <div className="overlay fleet-overlay" onClick={onClose}>
      <div className="frame fleet-archive" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          Fleet archive<span className="spacer" />
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="fleet-body">
          <div className="fleet-list">
            {factions.map((f) => (
              <div key={f}>
                <div className="label" style={{ margin: "10px 0 6px" }}>
                  {f}
                </div>
                {FLEET.filter((s) => s.faction === f).map((s) => (
                  <button key={s.id} className={cx("fleet-item", s.id === selected.id && "selected")} onClick={() => setSelected(s)}>
                    <span>{s.name}</span>
                    <span className="dim">{s.role}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="fleet-view">
            <ShipStage entry={selected} />
            <div className="fleet-caption">
              <div className="label" style={{ color: selected.faction === "Kushan" ? "var(--line)" : selected.faction === "Derelict" ? "var(--text-dim)" : "var(--danger)" }}>
                {selected.faction} · {selected.role}
              </div>
              <h2>{selected.name}</h2>
              <p>{selected.blurb}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
