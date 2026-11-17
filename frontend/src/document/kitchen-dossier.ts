/**
 * Le dossier d'une cuisine, comme le remet un cuisiniste à son client, en pages A4 paysage (drawing/svg-pdf.ts les met en
 * PDF) : le plan vu de dessus, coté — chaque linéaire et ses meubles numérotés, la longueur de chaque mur, le passage
 * devant l'îlot —, puis l'élévation de chaque linéaire, mur vu de face à l'échelle, ses meubles numérotés, la chaîne des
 * largeurs (fileurs compris) et les hauteurs, et enfin la liste des meubles : numéro, linéaire, désignation, cotes,
 * façades. Tiré du plan de cuisine du projet (kitchen-plan-build.ts). Pur.
 */
import { kitchenPlanIn, kitchenPlanOf } from "./kitchen-floor";
import { kitchenFromPlan } from "./kitchen-plan-build";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { kitchenRuns, kitchenSizes, runAt, zoneSpan, type KitchenRun } from "./kitchen-plan-shapes";
import type { CadDocument, KitchenFloorPlan } from "./types";
import { applianceOf, type Placed } from "../features/kitchen-run-items";

const PAGE: [number, number] = [297, 210];
const M = 12;
const INK = "#111827";
const GREY = "#9ca3af";
const ROWS = 30;
const f = (v: number) => Number(v.toFixed(2)).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const text = (x: number, y: number, s: string, size = 3, extra = "") => `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" fill="${INK}"${extra}>${esc(s)}</text>`;
const line = (a: [number, number], b: [number, number], stroke = INK, width = 0.25, extra = "") => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${f(width)}"${extra}/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, stroke = GREY, width = 0.2) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(width)}"/>`;
const page = (body: string[]) => `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE[0]}mm" height="${PAGE[1]}mm" viewBox="0 0 ${PAGE[0]} ${PAGE[1]}">${body.join("")}</svg>`;

/** A dimension between two points of the page, `off` mm to its side, with ticks and its value in the middle. */
function dim(a: [number, number], b: [number, number], off: number, label: string): string {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / l, dx / l];
  const p: [number, number] = [a[0] + nx * off, a[1] + ny * off];
  const q: [number, number] = [b[0] + nx * off, b[1] + ny * off];
  const tick = (c: [number, number]) => line([c[0] - (nx + dx / l) * 1.2, c[1] - (ny + dy / l) * 1.2], [c[0] + (nx + dx / l) * 1.2, c[1] + (ny + dy / l) * 1.2], INK, 0.3);
  const mid: [number, number] = [(p[0] + q[0]) / 2 + nx * 1.6, (p[1] + q[1]) / 2 + ny * 1.6 + 1];
  const angle = Math.abs(dx) >= Math.abs(dy) ? 0 : -90;
  return line(a, p, GREY, 0.15) + line(b, q, GREY, 0.15) + line(p, q, INK, 0.25) + tick(p) + tick(q) + text(mid[0], mid[1], label, 2.6, ` text-anchor="middle"${angle ? ` transform="rotate(${angle} ${f(mid[0])} ${f(mid[1])})"` : ""}`);
}

/** One unit of the kitchen, as listed. */
export interface DossierLine {
  n: number;
  run: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  fronts: string;
}

/** What a unit's fronts are, in a few words. */
function frontsOf(pl: Placed): string {
  const app = applianceOf(pl.item);
  if (app && !app.cabinet) return "appareil";
  const e = pl.entry;
  return e.layout === "drawers" ? `${e.drawers ?? 3} tiroirs` : e.layout === "doors" ? "2 portes" : e.layout === "door" ? "1 porte" : "sans façade";
}

/** The kitchen of the project's plan as pages; `length`: a length in the project's unit; a string: why there is none. */
export function kitchenDossier(doc: CadDocument, title: string, length: (mm: number) => string, planId?: string): { pages: string[]; lines: DossierLine[] } | string {
  const id = planId ?? kitchenPlanOf(doc)?.id;
  const p = id ? kitchenPlanIn(doc, id) : undefined;
  if (!p) return "Ce projet n'a pas de plan de cuisine.";
  const layout = kitchenFromPlan(p, kitchenRoomInfo(doc, p));
  const runs = kitchenRuns(p);
  // Numbered along the runs, the base row first.
  const numbered: { run: KitchenRun; pl: Placed; n: number }[] = [];
  for (const run of runs) for (const row of ["base", "wall"] as const) for (const pl of (layout.fills[run.id]?.placed ?? []).filter((x) => x.row === row).sort((a, b) => a.at - b.at)) numbered.push({ run, pl, n: numbered.length + 1 });
  if (!numbered.length) return "Les linéaires sont vides : aménagez-les ou « Proposer une cuisine ».";
  const s = kitchenSizes(p);
  const heightOf = (pl: Placed) => (pl.row === "wall" ? (applianceOf(pl.item)?.role === "hood" ? 100 : (pl.entry.height ?? s.wallTop - s.wallBottom)) : pl.entry.kind === "tall" ? s.wallTop : s.base);
  const depthOf = (pl: Placed) => (pl.row === "wall" ? p.wallDepth : pl.entry.custom && pl.entry.depth ? pl.entry.depth : s.cabinet);
  const lines: DossierLine[] = numbered.map(({ run, pl, n }) => ({ n, run: run.label, name: pl.entry.name, width: pl.item.width, height: heightOf(pl), depth: depthOf(pl), fronts: frontsOf(pl) }));
  return { pages: [planPage(p, runs, numbered, title, length), ...runs.flatMap((run) => elevation(p, run, numbered.filter((x) => x.run === run), layout.fills[run.id]?.fillers ?? [], title, length, heightOf)), ...listPages(lines, title, length)], lines };
}

/** The plan from above, wall A at the top: the runs, their units numbered, the walls measured. */
function planPage(p: KitchenFloorPlan, runs: KitchenRun[], numbered: { run: KitchenRun; pl: Placed; n: number }[], title: string, length: (mm: number) => string): string {
  const pts = runs.flatMap((r) => r.zone.outline);
  const [xs, ys] = [pts.map((q) => q[0]), pts.map((q) => -q[1])];
  const [x0, y0, x1, y1] = [Math.min(...xs) - 400, Math.min(...ys) - 400, Math.max(...xs) + 400, Math.max(...ys) + 400];
  const top = M + 18;
  const k = Math.min((PAGE[0] - 2 * M) / (x1 - x0), (PAGE[1] - top - M - 6) / (y1 - y0));
  const at = ([x, y]: [number, number]): [number, number] => [M + (x - x0) * k, top + (-y - y0) * k];
  const out = [text(M, M + 4, `Plan de la cuisine — ${title}`, 5, ' font-weight="bold"'), text(M, M + 10, `Vue de dessus · échelle 1:${Math.round(1 / k)} · ${numbered.length} meubles numérotés comme dans la liste`, 2.8)];
  const { cabinet } = kitchenSizes(p);
  for (const run of runs) {
    out.push(`<path d="${run.zone.outline.map((q, i) => `${i ? "L" : "M"} ${at(q).map(f).join(" ")}`).join(" ")} Z" fill="#f3f4f6" stroke="${GREY}" stroke-width="0.2"/>`);
    // Its wall, thick, behind it; measured on the outside.
    if (run.wall) {
      const [a, b] = [at(runAt(run, 0, 0)), at(runAt(run, run.length, 0))];
      out.push(line(a, b, INK, 1.2), dim(a, b, -6, `${run.label} ${length(run.length)}`));
    } else {
      const [u0, u1] = zoneSpan(run);
      out.push(dim(at(runAt(run, u0, 0)), at(runAt(run, u1, 0)), -6, `${run.label} ${length(u1 - u0)}`));
    }
  }
  for (const { run, pl, n } of numbered) {
    if (pl.row !== "base") continue;
    const d = pl.entry.custom && pl.entry.depth ? pl.entry.depth : cabinet;
    const c = [runAt(run, pl.at, run.back), runAt(run, pl.at + pl.item.width, run.back), runAt(run, pl.at + pl.item.width, run.back + d), runAt(run, pl.at, run.back + d)].map(at);
    out.push(`<path d="${c.map((q, i) => `${i ? "L" : "M"} ${f(q[0])} ${f(q[1])}`).join(" ")} Z" fill="#ffffff" stroke="${INK}" stroke-width="0.25"/>`);
    const mid = runAt(run, pl.at + pl.item.width / 2, run.back + d / 2);
    const [mx, my] = at(mid);
    out.push(text(mx, my + 1, String(n), 2.6, ' text-anchor="middle" font-weight="bold"'));
  }
  const island = runs.find((r) => r.id === "I");
  if (island) out.push(dim(at([p.lengthA / 2 + p.islandLength / 2 + 300, -p.depth]), at([p.lengthA / 2 + p.islandLength / 2 + 300, -(p.depth + p.passage)]), 0, `passage ${length(p.passage)}`));
  return page(out);
}

/** A run seen from the room: the wall, its units numbered, the widths along it and the heights. */
function elevation(p: KitchenFloorPlan, run: KitchenRun, units: { pl: Placed; n: number }[], fillers: [number, number][], title: string, length: (mm: number) => string, heightOf: (pl: Placed) => number): string[] {
  if (!units.length) return [];
  const s = kitchenSizes(p);
  const top = M + 18;
  const k = Math.min((PAGE[0] - 2 * M - 30) / run.length, (PAGE[1] - top - M - 26) / p.height);
  const x0 = M + 10;
  const floor = top + p.height * k;
  const at = (u: number, z: number): [number, number] => [x0 + u * k, floor - z * k];
  const out = [text(M, M + 4, `${run.label} vu de face — ${title}`, 5, ' font-weight="bold"'), text(M, M + 10, `Élévation · échelle 1:${Math.round(1 / k)} · meubles numérotés comme dans la liste, largeurs de gauche à droite`, 2.8)];
  out.push(rect(x0, top, run.length * k, p.height * k, "#ffffff", GREY, 0.2), line([x0 - 4, floor], [x0 + run.length * k + 4, floor], INK, 0.5));
  const [w0, w1] = zoneSpan(run);
  out.push(rect(...at(w0, p.worktopHeight), (w1 - w0) * k, (p.worktopHeight - s.base) * k, "#d1d5db", INK, 0.2));
  for (const [a, b] of fillers) out.push(rect(...at(a, s.base), (b - a) * k, (s.base - s.plinth) * k, "#e5e7eb"));
  const chain: [number, number][] = [];
  for (const { pl, n } of units) {
    const h = heightOf(pl);
    const z = pl.row === "wall" ? (applianceOf(pl.item)?.role === "hood" ? p.worktopHeight + 650 : s.wallTop - h) : 0;
    const [x, y] = at(pl.at, z + h);
    out.push(rect(x, y, pl.item.width * k, h * k, "#ffffff", INK, 0.3));
    if (pl.row === "base" && pl.entry.plinth !== 0 && applianceOf(pl.item)?.role !== "dishwasher") out.push(line(at(pl.at, s.plinth), at(pl.at + pl.item.width, s.plinth), GREY, 0.2));
    out.push(text(x + (pl.item.width * k) / 2, y + Math.min(h * k / 2, 6) + 1, String(n), 3, ' text-anchor="middle" font-weight="bold"'));
    if (pl.row === "base") chain.push([pl.at, pl.at + pl.item.width]);
  }
  chain.push(...fillers);
  chain.sort((a, b) => a[0] - b[0]);
  // The chain from one end of the wall to the other: the corners and the gaps measured too.
  let from = 0;
  for (const [a, b] of [...chain, [run.length, run.length] as [number, number]]) {
    if (a - from > 1) out.push(dim(at(from, 0), at(a, 0), 7, length(a - from)));
    if (b - a > 0.5) out.push(dim(at(a, 0), at(b, 0), 7, length(b - a)));
    from = Math.max(from, b);
  }
  out.push(dim(at(0, 0), at(run.length, 0), 15, `${run.label} ${length(run.length)}`));
  // The heights on the right: worktop, wall units.
  const right = run.length;
  out.push(dim(at(right, 0), at(right, p.worktopHeight), 8, length(p.worktopHeight)));
  if (units.some((u) => u.pl.row === "wall")) out.push(dim(at(right, 0), at(right, s.wallBottom), 16, length(s.wallBottom)), dim(at(right, 0), at(right, s.wallTop), 24, length(s.wallTop)));
  return [page(out)];
}

/** The list of the units, thirty to a page. */
function listPages(lines: DossierLine[], title: string, length: (mm: number) => string): string[] {
  const pages: string[] = [];
  for (let start = 0; start < lines.length; start += ROWS) {
    const out = [text(M, M + 4, `Liste des meubles — ${title}`, 5, ' font-weight="bold"'), text(M, M + 10, `${lines.length} meubles · page ${start / ROWS + 1} / ${Math.ceil(lines.length / ROWS)} · largeur × hauteur × profondeur`, 2.8)];
    const cols = [M, M + 12, M + 50, M + 150, M + 225];
    let y = M + 22;
    out.push(...["N°", "Linéaire", "Désignation", "Cotes", "Façades"].map((h, i) => text(cols[i]!, y, h, 3, ' font-weight="bold"')), line([M, y + 1.5], [PAGE[0] - M, y + 1.5], INK, 0.3));
    for (const l of lines.slice(start, start + ROWS)) {
      y += 5.2;
      out.push(text(cols[0]!, y, String(l.n), 3), text(cols[1]!, y, l.run, 3), text(cols[2]!, y, l.name, 3), text(cols[3]!, y, `${length(l.width)} × ${length(l.height)} × ${length(l.depth)}`, 3), text(cols[4]!, y, l.fronts, 3));
    }
    pages.push(page(out));
  }
  return pages;
}
