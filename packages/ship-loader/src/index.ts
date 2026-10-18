/**
 * Loads a Homeworld Remastered source ship (as prepared by tools/ship-studio/prep.py) into three.js:
 * meshes, diffuse/glow/team-colour textures, a consistent orientation, centred on the origin.
 *
 * The models are licensed game assets that live only in the git-ignored reference/ships folder;
 * callers pass the URL where that folder is served.
 */
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export type ShipOrientation = "auto" | "zup" | "native";

export interface ShipManifest {
  id: string;
  meshes: string[];
  /** OBJ material name → texture base name (without _DIFF.png). */
  materials: Record<string, string>;
  orient: ShipOrientation;
}

export interface LoadShipOptions {
  /** Hex colour for hull areas masked by the team texture. */
  team?: string;
  /** Strength of the glow (lights, engines) maps. */
  glow?: number;
  /** Turn the ship around (nose the other way). */
  flip?: boolean;
}

export interface LoadedShip {
  /** The ship, centred on the origin. Rotate this to pose it. */
  object: THREE.Group;
  /** Radius of the bounding sphere, for framing the camera. */
  radius: number;
  manifest: ShipManifest;
}

const DEFAULT_TEAM = "b8ab94";

async function texture(loader: THREE.TextureLoader, url: string, colour: boolean): Promise<THREE.Texture | null> {
  try {
    const t = await loader.loadAsync(url);
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  } catch {
    return null;
  }
}

/** The red channel of an HWRM team texture masks the hull areas painted in the team colour. */
async function material(loader: THREE.TextureLoader, base: string, opts: LoadShipOptions): Promise<THREE.Material> {
  const [diff, glow, team] = await Promise.all([
    texture(loader, `${base}_DIFF.png`, true),
    texture(loader, `${base}_GLOW.png`, false),
    texture(loader, `${base}_TEAM.png`, false),
  ]);
  const m = new THREE.MeshStandardMaterial({
    map: diff ?? undefined,
    color: diff ? 0xffffff : 0x8a8f94,
    roughness: 0.62,
    metalness: 0.35,
    emissive: glow ? 0xffffff : 0x000000,
    emissiveMap: glow ?? undefined,
    emissiveIntensity: opts.glow ?? 1.6,
  });
  if (team) {
    const teamColour = new THREE.Color(`#${opts.team ?? DEFAULT_TEAM}`);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.teamMap = { value: team };
      shader.uniforms.teamColour = { value: teamColour };
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D teamMap;\nuniform vec3 teamColour;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec3 tm = texture2D(teamMap, vMapUv).rgb;
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, lum * teamColour * 1.7, tm.r);`,
        );
    };
  }
  return m;
}

/**
 * Source meshes use different axis conventions, so most ships are laid out the same way:
 * longest dimension along X (nose to tail), shortest along Y (keel to deck). "zup" first
 * converts a Z-up 3ds Max export; "native" keeps the model as authored (the Kushan and
 * Hiigaran motherships fly with their longest axis vertical).
 */
export function orient(group: THREE.Object3D, mode: ShipOrientation): void {
  if (mode === "native") return;
  if (mode === "zup") group.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray();
  const axis = (i: number) => new THREE.Vector3().setComponent(i, 1);
  // With a known up axis (zup), only the two horizontal axes compete for nose to tail.
  const horizontal = size[0]! >= size[2]! ? [0, 2] : [2, 0];
  const order = mode === "zup" ? [horizontal[0]!, horizontal[1]!, 1] : [0, 1, 2].sort((a, b) => size[b]! - size[a]!);
  const [long, mid, short] = [axis(order[0]!), axis(order[1]!), axis(order[2]!)];
  const basis = new THREE.Matrix4().makeBasis(long, short, mid).transpose();
  if (basis.determinant() < 0) basis.premultiply(new THREE.Matrix4().makeScale(1, 1, -1));
  group.applyMatrix4(basis);
}

/** Loads the ship whose prepared folder is served at `baseUrl` (e.g. "/local/ships/kus_mothership"). */
export async function loadShip(baseUrl: string, opts: LoadShipOptions = {}): Promise<LoadedShip> {
  const manifest = (await (await fetch(`${baseUrl}/manifest.json`)).json()) as ShipManifest;
  const textures = new THREE.TextureLoader();
  const group = new THREE.Group();
  const cache = new Map<string, Promise<THREE.Material>>();
  for (const file of manifest.meshes) {
    const obj = await new OBJLoader().loadAsync(`${baseUrl}/${file}`);
    const meshes: THREE.Mesh[] = [];
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    for (const mesh of meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const resolved = await Promise.all(
        mats.map((m) => {
          const name = m.name || "default";
          if (!cache.has(name)) cache.set(name, material(textures, `${baseUrl}/${manifest.materials[name] ?? name}`, opts));
          return cache.get(name)!;
        }),
      );
      mesh.material = Array.isArray(mesh.material) ? resolved : resolved[0]!;
      mesh.geometry.computeVertexNormals();
    }
    group.add(obj);
  }

  orient(group, manifest.orient);
  if (opts.flip) group.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.sub(box.getCenter(new THREE.Vector3()));
  const object = new THREE.Group();
  object.add(group);
  return { object, radius: box.getSize(new THREE.Vector3()).length() / 2, manifest };
}
