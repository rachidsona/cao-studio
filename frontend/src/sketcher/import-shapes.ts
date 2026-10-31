/**
 * Les formes lues dans un fichier (io/dxf-import.ts) mises dans une esquisse : chaque bout de ligne qui tombe sur un
 * autre (au millième de mm) devient un point partagé, pour que les contours se ferment ; en référence, ce sont des
 * traits de construction fixes (le solveur ne les bouge pas, on s'y accroche et on dessine par-dessus), sinon des
 * traits ordinaires, prêts à extruder. Pur.
 */
import type { SketchCurve, SketchGeometry, SketchPoint } from "../document/sketch";
import type { ImportedShape, P2 } from "../io/dxf-import";

/** Ids not taken yet, with this prefix, given in turn. */
function ids(g: SketchGeometry, prefix: string): () => string {
  const used = new Set<string>([...g.points, ...g.curves, ...g.constraints].map((e) => e.id));
  let n = 1;
  return () => {
    while (used.has(`${prefix}${n}`)) n++;
    used.add(`${prefix}${n}`);
    return `${prefix}${n}`;
  };
}

export function addShapes(g: SketchGeometry, shapes: readonly ImportedShape[], options: { reference: boolean; shift: P2 }): SketchGeometry {
  const points: SketchPoint[] = [];
  const curves: SketchCurve[] = [];
  const point = ids(g, "p");
  const curve = (kind: string) => ids(g, kind);
  const lineId = curve("l");
  const circleId = curve("c");
  const arcId = curve("a");
  const at = new Map<string, string>();
  const [dx, dy] = options.shift;
  /** The point at this place (made once, shared by every curve that ends there). */
  const pointAt = ([x, y]: P2): string => {
    const [px, py] = [x + dx, y + dy];
    const key = `${Math.round(px * 1000)}|${Math.round(py * 1000)}`;
    const known = at.get(key);
    if (known) return known;
    const id = point();
    points.push({ id, x: px, y: py, ...(options.reference ? { fixed: true } : {}) });
    at.set(key, id);
    return id;
  };
  const flags = options.reference ? { construction: true } : {};
  for (const s of shapes) {
    if (s.kind === "line") {
      const [p1, p2] = [pointAt(s.a), pointAt(s.b)];
      if (p1 !== p2) curves.push({ id: lineId(), kind: "line", p1, p2, ...flags });
    } else if (s.kind === "circle") {
      curves.push({ id: circleId(), kind: "circle", center: pointAt(s.center), radius: s.radius, ...flags });
    } else {
      const end = (t: number): P2 => [s.center[0] + s.radius * Math.cos(t), s.center[1] + s.radius * Math.sin(t)];
      curves.push({ id: arcId(), kind: "arc", center: pointAt(s.center), start: pointAt(end(s.start)), end: pointAt(end(s.end)), radius: s.radius, startAngle: s.start, endAngle: s.end, ...flags });
    }
  }
  return { ...g, points: [...g.points, ...points], curves: [...g.curves, ...curves] };
}
