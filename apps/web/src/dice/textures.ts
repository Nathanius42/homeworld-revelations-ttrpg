import * as THREE from "three";
import { drawEmblem } from "../emblem";

const BODY = "#7b8488";
const BODY_DARK = "#596165";
const INK = "#3fe0f0";
const TILE = 256;

/** UV corners of each d20 triangle inside its atlas tile (counter-clockwise, like the geometry). */
export const D20_TRI_UV: [number, number][] = [
  [0.5, 0.95],
  [0.04, 0.16],
  [0.96, 0.16],
];

function bodyFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, BODY);
  g.addColorStop(1, BODY_DARK);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Speckle so the plastic doesn't look flat.
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 90; i++) ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 1.5, 1.5);
}

const NUMERAL_FONT = "Michroma, 'Segoe UI', sans-serif";

/**
 * The widest font size (up to 92px) at which a numeral fits inside the face triangle with a
 * margin. The triangle narrows towards its apex, so the limit is its width at the top of the text.
 */
function fitNumeral(ctx: CanvasRenderingContext2D, text: string, cy: number): number {
  const [apex, left, right] = D20_TRI_UV as [[number, number], [number, number], [number, number]];
  const base = right[0] - left[0];
  const widthAt = (v: number) => (base * Math.max(0, apex[1] - v)) / (apex[1] - left[1]) * TILE;
  let size = 92;
  for (; size > 40; size -= 2) {
    ctx.font = `bold ${size}px ${NUMERAL_FONT}`;
    const top = cy - size * 0.38;
    if (ctx.measureText(text).width <= widthAt(1 - top / TILE) * 0.82) break;
  }
  return size;
}

let d20Atlas: THREE.CanvasTexture | undefined;

/** 5 x 4 atlas: tile i holds the numeral for face value i + 1, with the Kushan emblem on the 1. */
export function d20Texture(): THREE.CanvasTexture {
  if (d20Atlas) return d20Atlas;
  const canvas = document.createElement("canvas");
  canvas.width = TILE * 5;
  canvas.height = TILE * 4;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 20; i++) {
    const x = (i % 5) * TILE;
    const y = Math.floor(i / 5) * TILE;
    bodyFill(ctx, x, y, TILE, TILE);
    const cx = x + TILE / 2;
    const centroidV = (D20_TRI_UV[0]![1] + D20_TRI_UV[1]![1] + D20_TRI_UV[2]![1]) / 3;
    const cy = y + (1 - centroidV) * TILE + 6;
    const value = i + 1;
    ctx.shadowColor = "rgba(63,224,240,0.75)";
    ctx.shadowBlur = 10;
    if (value === 1) {
      drawEmblem(ctx, cx, cy - 4, 104, INK);
    } else {
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const size = fitNumeral(ctx, String(value), cy - y);
      ctx.fillText(String(value), cx, cy);
      if (value === 6 || value === 9) ctx.fillRect(cx - size * 0.24, cy + size * 0.48, size * 0.48, Math.max(4, size * 0.065));
    }
    ctx.shadowBlur = 0;
  }
  d20Atlas = new THREE.CanvasTexture(canvas);
  d20Atlas.colorSpace = THREE.SRGBColorSpace;
  d20Atlas.anisotropy = 8;
  return d20Atlas;
}

const cdFaces = new Map<number, THREE.CanvasTexture>();

function reticle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * r * 0.55, cy + dy * r * 0.55);
    ctx.lineTo(cx + dx * r * 1.35, cy + dy * r * 1.35);
    ctx.stroke();
  }
}

/** Challenge Die faces: 1 reticle, 2 double reticle, 3-4 blank, 5-6 Kushan emblem. */
export function challengeTexture(face: number): THREE.CanvasTexture {
  const cached = cdFaces.get(face);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d")!;
  bodyFill(ctx, 0, 0, TILE, TILE);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, TILE - 6, TILE - 6);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 9;
  ctx.shadowColor = "rgba(63,224,240,0.75)";
  ctx.shadowBlur = 10;
  if (face === 1) reticle(ctx, 128, 128, 52);
  if (face === 2) {
    reticle(ctx, 84, 84, 34);
    reticle(ctx, 172, 172, 34);
  }
  if (face === 5 || face === 6) drawEmblem(ctx, 128, 128, 170, INK);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cdFaces.set(face, tex);
  return tex;
}
