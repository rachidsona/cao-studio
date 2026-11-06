/** Le fil continu : des façades choisies forment une rangée, rangée le long de leur mur, que le calepinage garde ensemble. Pur. */
import { bodyInfo, setBodyInfo } from "./materials";
import type { BodyInfo, CadDocument } from "./types";

type Box = [[number, number, number], [number, number, number]];

/** These parts as one run, in their order along the axis they spread on. */
export function withGrainRun(base: CadDocument, parts: { id: string; box: Box }[]): CadDocument {
  const middle = (box: Box, k: number) => (box[0][k]! + box[1][k]!) / 2;
  const spread = (k: number) => Math.max(...parts.map((p) => middle(p.box, k))) - Math.min(...parts.map((p) => middle(p.box, k)));
  const axis = spread(0) >= spread(1) ? 0 : 1;
  const used = Object.values(base.bodyInfo ?? {}).map((i: BodyInfo) => /^run(\d+)$/.exec(i.grainRun?.id ?? "")?.[1]).filter((n): n is string => n !== undefined).map(Number);
  const id = `run${Math.max(0, ...used) + 1}`;
  return parts.reduce((doc, p) => setBodyInfo(doc, [p.id], { grainRun: { id, at: middle(p.box, axis) } }), base);
}

export function withoutGrainRun(base: CadDocument, ids: string[]): CadDocument {
  const runs = new Set(ids.map((id) => bodyInfo(base, id).grainRun?.id));
  const info = Object.fromEntries(Object.entries(base.bodyInfo ?? {}).map(([id, known]) => {
    if (!runs.has(known.grainRun?.id) || !known.grainRun) return [id, known];
    const { grainRun: _run, ...rest } = known;
    return [id, rest];
  }));
  return { ...base, bodyInfo: info };
}
