/**
 * The Kushan emblem used on the d20's 1 face, the Challenge Dice effect faces and the UI.
 * Paths are in a 100 x 100 box so they work in SVG and in canvas via Path2D.
 */
export const EMBLEM_PATHS = [
  "M50 4 L58 50 L50 96 L42 50 Z",
  "M43 42 C31 33 16 34 4 47 C17 43 30 46 43 56 Z",
  "M57 42 C69 33 84 34 96 47 C83 43 70 46 57 56 Z",
];
export const EMBLEM_RING = { cx: 50, cy: 50, r: 19, width: 5 };

export function drawEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string): void {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  for (const d of EMBLEM_PATHS) ctx.fill(new Path2D(d));
  ctx.lineWidth = EMBLEM_RING.width;
  ctx.beginPath();
  ctx.arc(EMBLEM_RING.cx, EMBLEM_RING.cy, EMBLEM_RING.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
