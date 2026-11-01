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
  return op.kind === "hole" ? { ...op, at: shift(op.at) } : { ...op, from: shift(op.from), to: shift(op.to) };
}
