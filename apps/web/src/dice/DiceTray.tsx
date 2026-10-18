import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { D20_TRI_UV, challengeTexture, d20Texture } from "./textures";

export interface TrayDie {
  kind: "d20" | "cd";
  face: number;
  /** Glow once landed: success (cyan), complication (red) or nothing. */
  glow?: "success" | "crit" | "complication" | "effect";
}

interface Props {
  dice: TrayDie[];
  /** Changes when a new roll lands; dice whose face changed under the same key re-roll alone. */
  rollKey: string;
  onSettled?: () => void;
}

const SPIN_SECONDS = 1.25;
const SPACING = 2.35;

interface FaceFrame {
  normal: THREE.Vector3;
  /** Direction from the face centre towards the top of its numeral. */
  up: THREE.Vector3;
}

function d20Geometry(): { geometry: THREE.BufferGeometry; faces: FaceFrame[] } {
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const pos = geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  const faces: FaceFrame[] = [];
  for (let f = 0; f < 20; f++) {
    const col = f % 5;
    const row = Math.floor(f / 5);
    for (let v = 0; v < 3; v++) {
      const [u, w] = D20_TRI_UV[v]!;
      uv[(f * 3 + v) * 2] = (col + u) / 5;
      uv[(f * 3 + v) * 2 + 1] = 1 - (row + 1 - w) / 4;
    }
    const a = new THREE.Vector3().fromBufferAttribute(pos, f * 3);
    const b = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 2);
    const centre = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    // Vertex 0 maps to the top of the tile, so the numeral points towards it.
    faces.push({ normal: centre.clone().normalize(), up: a.clone().sub(centre).normalize() });
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return { geometry, faces };
}

// BoxGeometry face order is +x, -x, +y, -y, +z, -z; "up" is each face texture's top edge.
const CUBE_FACES: FaceFrame[] = [
  { normal: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { normal: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { normal: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  { normal: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  { normal: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  { normal: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
];

const GLOW: Record<NonNullable<TrayDie["glow"]>, THREE.Color> = {
  success: new THREE.Color("#1d8fa0"),
  crit: new THREE.Color("#3fe0f0"),
  complication: new THREE.Color("#b3301e"),
  effect: new THREE.Color("#1d8fa0"),
};

const TOWARD_CAMERA = new THREE.Vector3(0.18, 0.32, 1).normalize();

const SCREEN_UP = new THREE.Vector3(0, 1, 0);

/** Rotation that turns a face towards the camera with its numeral upright (plus a little jitter). */
function targetQuaternion(face: FaceFrame, jitter: number): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromUnitVectors(face.normal, TOWARD_CAMERA);
  const up = face.up.clone().applyQuaternion(q).projectOnPlane(TOWARD_CAMERA).normalize();
  const want = SCREEN_UP.clone().projectOnPlane(TOWARD_CAMERA).normalize();
  const angle = Math.atan2(new THREE.Vector3().crossVectors(up, want).dot(TOWARD_CAMERA), up.dot(want));
  return new THREE.Quaternion().setFromAxisAngle(TOWARD_CAMERA, angle + jitter).multiply(q);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function bounce(t: number): number {
  // Height above the table: a drop and two small bounces.
  if (t < 0.55) return (1 - t / 0.55) ** 2 * 3;
  if (t < 0.8) return Math.sin(((t - 0.55) / 0.25) * Math.PI) * 0.35;
  return Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.08;
}

interface Anim {
  start: number;
  duration: number;
  axis: THREE.Vector3;
  turns: number;
  target: THREE.Quaternion;
}

function Die({ die, index, count, rollKey, onLanded }: { die: TrayDie; index: number; count: number; rollKey: string; onLanded: () => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const anim = useRef<Anim>();
  const landed = useRef(false);
  const prev = useRef<{ key: string; face: number }>();
  const { geometry, faces, materials } = useMemo(() => {
    if (die.kind === "d20") {
      const { geometry, faces } = d20Geometry();
      const material = new THREE.MeshStandardMaterial({ map: d20Texture(), roughness: 0.42, metalness: 0.25, flatShading: true });
      return { geometry, faces, materials: [material] };
    }
    const geometry = new THREE.BoxGeometry(1.35, 1.35, 1.35);
    const materials = [1, 2, 3, 4, 5, 6].map((f) => new THREE.MeshStandardMaterial({ map: challengeTexture(f), roughness: 0.45, metalness: 0.2 }));
    return { geometry, faces: CUBE_FACES, materials };
  }, [die.kind]);

  const clock = useThree((s) => s.clock);

  useEffect(() => {
    const changed = !prev.current || prev.current.key !== rollKey || prev.current.face !== die.face;
    prev.current = { key: rollKey, face: die.face };
    if (!changed) return;
    landed.current = false;
    const jitter = (Math.random() - 0.5) * 0.35;
    anim.current = {
      start: clock.getElapsedTime() + index * 0.07,
      duration: SPIN_SECONDS + Math.random() * 0.35,
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      turns: (3 + Math.random() * 3) * Math.PI * 2,
      target: targetQuaternion(faces[die.face - 1]!, jitter),
    };
    for (const m of materials) m.emissive.set(0x000000);
  }, [rollKey, die.face, faces, materials, clock, index]);

  useEffect(() => () => {
    geometry.dispose();
    for (const m of materials) m.dispose();
  }, [geometry, materials]);

  useFrame(() => {
    const m = mesh.current;
    const a = anim.current;
    if (!m || !a) return;
    const t = Math.min(1, Math.max(0, (clock.getElapsedTime() - a.start) / a.duration));
    const spin = new THREE.Quaternion().setFromAxisAngle(a.axis, a.turns * (1 - easeOutCubic(t)));
    m.quaternion.copy(spin.multiply(a.target));
    const x = (index - (count - 1) / 2) * SPACING;
    m.position.set(x - (1 - easeOutCubic(t)) * 1.5, bounce(t), 0);
    if (t >= 1 && !landed.current) {
      landed.current = true;
      if (die.glow) for (const mat of materials) mat.emissive.copy(GLOW[die.glow]).multiplyScalar(0.55);
      onLanded();
    }
  });

  return <mesh ref={mesh} geometry={geometry} material={materials.length === 1 ? materials[0] : materials} castShadow />;
}

function Scene({ dice, rollKey, onSettled }: Props) {
  const landedCount = useRef(0);
  const group = useRef<THREE.Group>(null);
  const viewport = useThree((s) => s.viewport);
  useEffect(() => {
    landedCount.current = 0;
  }, [rollKey]);
  useFrame(() => {
    const width = Math.max(1, dice.length) * SPACING + 0.6;
    const scale = Math.min(1.25, viewport.width / width, viewport.height / 3.2);
    group.current?.scale.setScalar(scale);
  });
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 6, 8]} intensity={2.2} castShadow />
      <pointLight position={[-6, -2, 5]} intensity={18} color="#2ec4d6" />
      <group ref={group}>
        {dice.map((d, i) => (
          <Die
            key={`${d.kind}-${i}`}
            die={d}
            index={i}
            count={dice.length}
            rollKey={rollKey}
            onLanded={() => {
              landedCount.current += 1;
              if (landedCount.current === dice.length) onSettled?.();
            }}
          />
        ))}
      </group>
    </>
  );
}

export function DiceTray(props: Props) {
  return (
    <Canvas camera={{ position: [0, 0.6, 9], fov: 32 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <Scene {...props} />
    </Canvas>
  );
}
