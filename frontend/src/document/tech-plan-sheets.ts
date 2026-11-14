/**
 * Le plan technique d'une cuisine (tech-plan.ts) en pages A4 paysage, une par mur, pour le plombier et l'électricien :
 * le mur vu de face à l'échelle, ce qui s'y pose en gris clair, chaque point (eau froide, eau chaude, évacuation,
 * prise, ligne, sortie d'air) à sa place avec son repère, et sous la vue la liste des points cotés depuis le début du
 * mur et depuis le sol. En SVG que drawing/svg-pdf.ts met en PDF. Pur.
 */
import { TECH_LABELS, type TechKind, type TechWall } from "./tech-plan";

const PAGE: [number, number] = [297, 210];
const M = 12;
const f = (v: number) => Number(v.toFixed(2)).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const INK = "#111827";

/** Each kind: its colour and the letters in its mark. */
export const TECH_MARKS: Record<TechKind, { color: string; tag: string }> = {
  cold: { color: "#2563eb", tag: "EF" },
  hot: { color: "#dc2626", tag: "EC" },
  drain: { color: "#6b7280", tag: "EV" },
  socket: { color: "#ea580c", tag: "P" },
  line32: { color: "#7c3aed", tag: "32" },
  line20: { color: "#9333ea", tag: "20" },
  duct: { color: "#059669", tag: "AIR" },
};

const text = (x: number, y: number, s: string, size = 3, extra = "") => `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" fill="${INK}"${extra}>${esc(s)}</text>`;
const line = (a: [number, number], b: [number, number], stroke = INK, width = 0.25, extra = "") => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${f(width)}"${extra}/>`;

/** The pages, one per wall; `cm`: lengths in the project's unit (the plan is in mm). */
export function techPlanPages(walls: readonly TechWall[], title: string, length: (mm: number) => string): string[] {
  return walls.map((w, i) => {
    const out: string[] = [];
    const right = Math.max(1000, ...w.items.map((it) => it.u1), ...w.points.map((p) => p.u + 100));
    const tall = Math.max(2500, ...w.items.map((it) => it.z1), ...w.points.map((p) => p.z + 100));
    const rows = w.points.length;
    // The view above, the list under it: the scale that fits both.
    const listHeight = Math.min(rows, 18) * 4.6 + 10;
    const viewTop = M + 16;
    const room: [number, number] = [PAGE[0] - 2 * M - 12, PAGE[1] - viewTop - M - listHeight - 8];
    const s = Math.min(room[0] / right, room[1] / tall);
    const x0 = M + 12;
    const floor = viewTop + tall * s;
    const at = (u: number, z: number): [number, number] => [x0 + u * s, floor - z * s];
    out.push(text(M, M + 4, `Plan technique — ${title}`, 5, ' font-weight="bold"'));
    out.push(text(M, M + 10, `${w.name} vu de la pièce · page ${i + 1} / ${walls.length} · échelle 1:${Math.round(1 / s)} · cotes depuis le début du mur (à gauche) et depuis le sol`, 2.8));
    // The wall, the floor, what stands against it.
    out.push(`<rect x="${f(x0)}" y="${f(viewTop)}" width="${f(right * s)}" height="${f(tall * s)}" fill="none" stroke="#9ca3af" stroke-width="0.2"/>`);
    out.push(line([x0 - 4, floor], [x0 + right * s + 4, floor], INK, 0.5));
    for (const it of w.items) {
      const [a, b] = [at(it.u0, it.z1), at(it.u1, it.z0)];
      out.push(`<rect x="${f(a[0])}" y="${f(a[1])}" width="${f(b[0] - a[0])}" height="${f(b[1] - a[1])}" fill="#f3f4f6" stroke="#9ca3af" stroke-width="0.2"/>`);
    }
    // The points, numbered as in the list.
    w.points.forEach((p, k) => {
      const [x, y] = at(p.u, p.z);
      const mark = TECH_MARKS[p.kind];
      out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="2.2" fill="#ffffff" stroke="${mark.color}" stroke-width="0.5"/>`);
      out.push(`<text x="${f(x)}" y="${f(y + 0.9)}" font-size="2.2" fill="${mark.color}" text-anchor="middle" font-weight="bold">${k + 1}</text>`);
    });
    // The list: number, mark, what, along, height.
    let y = floor + 10;
    out.push(text(x0, y, "N°", 2.8, ' font-weight="bold"'), text(x0 + 10, y, "Repère", 2.8, ' font-weight="bold"'), text(x0 + 30, y, "Point", 2.8, ' font-weight="bold"'), text(x0 + 150, y, "Depuis le début du mur", 2.8, ' font-weight="bold"'), text(x0 + 205, y, "Hauteur du sol", 2.8, ' font-weight="bold"'));
    for (const [k, p] of w.points.slice(0, 18).entries()) {
      y += 4.6;
      const mark = TECH_MARKS[p.kind];
      out.push(text(x0, y, String(k + 1), 2.8), `<text x="${f(x0 + 10)}" y="${f(y)}" font-size="2.8" fill="${mark.color}" font-weight="bold">${esc(mark.tag)}</text>`, text(x0 + 30, y, p.label, 2.8), text(x0 + 150, y, length(p.u), 2.8), text(x0 + 205, y, length(p.z), 2.8));
    }
    if (w.points.length > 18) out.push(text(x0, y + 4.6, `… et ${w.points.length - 18} autres points.`, 2.8));
    out.push(`<text x="${f(M)}" y="${f(PAGE[1] - M + 4)}" font-size="2.4" fill="#6b7280">${esc(`Repères d'usage (${Object.values(TECH_LABELS).join(", ")}) : à faire valider par le plombier et l'électricien.`)}</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE[0]}mm" height="${PAGE[1]}mm" viewBox="0 0 ${PAGE[0]} ${PAGE[1]}">${out.join("")}</svg>`;
  });
}
