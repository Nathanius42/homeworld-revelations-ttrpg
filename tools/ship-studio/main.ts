/**
 * Renders a Homeworld Remastered source ship with three.js, for use as an art reference.
 *
 * URL parameters:
 *   ship    folder name in reference/ships (e.g. kus_mothership)
 *   yaw, pitch, roll   degrees
 *   zoom    1 = ship fills the frame; smaller pulls the camera back
 *   x, y    where the ship sits in the frame (-1..1)
 *   team    hex colour for the team-colour mask
 *   light   "key" (warm sun, cool rim) or "nebula" (red/violet)
 *   flip    turn the ship around
 *
 * Sets window.__ready once the frame is drawn.
 */
import * as THREE from "three";
import { loadShip } from "@hwr/ship-loader";

declare global {
  interface Window {
    __ready?: boolean;
    __error?: string;
  }
}

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const ship = params.get("ship") ?? "kus_mothership";
const deg = THREE.MathUtils.degToRad;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num("exposure", 1.1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(num("fov", 30), innerWidth / innerHeight, 0.1, 1e6);

const lightMode = params.get("light") ?? "key";
scene.add(new THREE.AmbientLight(lightMode === "nebula" ? 0x553344 : 0x334455, 0.5));
const key = new THREE.DirectionalLight(lightMode === "nebula" ? 0xffb08a : 0xfff0dc, 3.2);
key.position.set(-1, 0.8, 0.9);
scene.add(key);
const rim = new THREE.DirectionalLight(lightMode === "nebula" ? 0xb070ff : 0x7fd8ff, 2.2);
rim.position.set(1.2, -0.3, -1);
scene.add(rim);

async function main(): Promise<void> {
  const { object, radius } = await loadShip(`/${ship}`, {
    team: params.get("team") ?? undefined,
    glow: params.has("glow") ? num("glow", 1.6) : undefined,
    flip: params.has("flip"),
  });
  object.rotation.set(deg(num("pitch", 12)), deg(num("yaw", 35)), deg(num("roll", 0)), "YXZ");
  scene.add(object);

  const distance = radius / Math.sin(deg(camera.fov) / 2) / num("zoom", 1);
  camera.position.set(0, 0, distance);
  camera.near = distance / 100;
  camera.far = distance * 10;
  camera.updateProjectionMatrix();
  // Shift the view so the ship sits off-centre when asked (for compositions with room for text).
  camera.setViewOffset(innerWidth, innerHeight, (-num("x", 0) * innerWidth) / 2, (num("y", 0) * innerHeight) / 2, innerWidth, innerHeight);

  renderer.render(scene, camera);
  window.__ready = true;
}

main().catch((err: unknown) => {
  window.__error = String(err);
  console.error(err);
});
