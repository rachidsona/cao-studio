/** How a machining follows its board when the board changes (pure: read by the kernel and by the workshop). */
import type { MachiningOp, Vec3 } from "../document/types";

/**
 * The operation moved with the board: on each axis, by how far the end of the board it was nearer to (when the
 * machining was made) has moved; by the low corner only when the high one was not kept.
 */
export function followed(op: MachiningOp, anchor: [Vec3, Vec3 | undefined], now: [Vec3, Vec3]): MachiningOp {
  const [low, high] = anchor;
  const where = op.kind === "hole" ? op.at : (op.from.map((v, i) => (v + (op.to[i] as number)) / 2) as Vec3);
  const delta = [0, 1, 2].map((i) => {
    const nearHigh = high && Math.abs((where[i] as number) - (high[i] as number)) < Math.abs((where[i] as number) - (low[i] as number));
    return nearHigh ? (now[1][i] as number) - (high[i] as number) : (now[0][i] as number) - (low[i] as number);
  }) as Vec3;
  const shift = (v: Vec3): Vec3 => [v[0] + delta[0], v[1] + delta[1], v[2] + delta[2]];
  if (op.kind === "hole") return { ...op, at: shift(op.at) };
  if (!high) return { ...op, from: shift(op.from), to: shift(op.to) };
  // A box running along most of the board on an axis (a back groove, a slot along a shelf) stretches with it: each of
  // its ends follows the end of the board it is at (audit of 11/11/2026: a groove kept its length on a longer back).
  const from = [...op.from] as Vec3;
  const to = [...op.to] as Vec3;
  for (const i of [0, 1, 2]) {
    const length = (high[i] as number) - (low[i] as number);
    const span = Math.abs((op.to[i] as number) - (op.from[i] as number));
    if (length > 0 && span >= STRETCH * length) {
      const end = (v: number) => (Math.abs(v - (high[i] as number)) < Math.abs(v - (low[i] as number)) ? (now[1][i] as number) - (high[i] as number) : (now[0][i] as number) - (low[i] as number));
      from[i] = (op.from[i] as number) + end(op.from[i] as number);
      to[i] = (op.to[i] as number) + end(op.to[i] as number);
    } else {
      from[i] = (op.from[i] as number) + (delta[i] as number);
      to[i] = (op.to[i] as number) + (delta[i] as number);
    }
  }
  return { ...op, from, to };
}

/** A box covering this share of the board along an axis runs along it (a groove): it stretches with the board. */
export const STRETCH = 0.8;
