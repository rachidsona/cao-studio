/**
 * La bande de face d'un linéaire de cuisine, à l'échelle, comme sur une planche de cuisiniste : le mur et ses portes et
 * fenêtres, le plan de travail, en bas les meubles bas et les colonnes, en haut les meubles hauts, la hotte et le
 * micro-ondes, chacun dessiné par app/unit-elevation.ts ; les fileurs, les angles (pris par les meubles de l'angle), et
 * la place libre hachurée, en pointillés, avec sa largeur (cm) ; la crédence, les retours du plan et les joues de finition comme la 3D les a ; les appareils posés à la main (Électroménager), en
 * sombre, là où la 3D les a. Un clic choisit un meuble, un appareil posé à la main ou le plan de travail ; glisser un
 * meuble au-delà d'un voisin le change de place dans sa rangée, le lâcher dans la place vide à côté de lui l'y pose ; le clavier (Suppr, Ctrl + D, les flèches) et le clic droit agissent sur
 * ce qui est choisi (kitchen-strip-actions.ts).
 */
import { cornerSide, wallCornerSide } from "../../document/kitchen-corners";
import { kitchenSizes, runAt, zoneSpan, type KitchenRun, type RunGeometry } from "../../document/kitchen-plan-shapes";
import type { HandAppliance } from "../../document/kitchen-hand-appliances";
import type { KitchenFloorPlan, Vec3 } from "../../document/types";
import type { KitchenBox } from "../../features/kitchen-layout";
import { applianceOf, isFiller, itemSize, openRoom, type Placed, type RunFill } from "../../features/kitchen-run-items";
import { BRASS, elevationBody } from "./unit-elevation";
import { escapeHtml } from "../workshop/workshop-ui";
import { doorsHidden } from "./strip-doors";

const SVG = "http://www.w3.org/2000/svg";
const WALL = "fill-gray-50 dark:fill-gray-900";
const PANEL = "fill-gray-100 stroke-gray-500 dark:fill-gray-700 dark:stroke-gray-400";
/** A corner door taken off (« Sans portes »): its outline only, dashed. */
const OPEN = "fill-transparent stroke-gray-400 [stroke-dasharray:6_4]";
const STONE = "fill-gray-400 stroke-gray-600 dark:fill-gray-500 dark:stroke-gray-300";
const DEAD = "fill-gray-200 dark:fill-gray-800";
/** Each strip its own hatch (an id is for the whole page). */
let hatches = 0;

const rect = (x: number, y: number, w: number, h: number, tone: string, extra = "") => `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" class="${tone}" vector-effect="non-scaling-stroke" ${extra}/>`;

/** What a placed item looks like from the front, at the plan's heights. */
function drawing(pl: Placed, p: KitchenFloorPlan): { body: string; z: number; height: number } {
  const s = kitchenSizes(p);
  const role = applianceOf(pl.item)?.role;
  const w = pl.item.width;
  // A filler put by hand: a plain panel, between plinth and worktop or the height of the wall row.
  if (isFiller(pl.item)) {
    const [z, top] = pl.row === "wall" ? [s.wallBottom, s.wallTop] : [s.plinth, s.base];
    return { body: rect(0, 0, w, top - z, PANEL, 'data-hand-filler=""'), z, height: top - z };
  }
  if (role === "hood") {
    // Its canopy over the hob, its duct up to the top of the wall units.
    const z = p.worktopHeight + 650;
    const height = Math.max(100, s.wallTop - z);
    return { body: `${rect(w / 2 - 125, 0, 250, height - 100, PANEL)}${rect(0, height - 100, w, 100, PANEL)}`, z, height };
  }
  const { height, z } = itemSize(p, pl.item, pl.entry);
  const entry = role === "dishwasher" ? { ...pl.entry, layout: "door" as const } : pl.entry;
  return { body: elevationBody({ ...entry, height, plinth: pl.row === "wall" ? 0 : (entry.plinth ?? s.plinth) }, doorsHidden()).body, z, height };
}

export interface StripHost {
  plan: KitchenFloorPlan;
  run: KitchenRun;
  geometry: RunGeometry;
  fill: RunFill;
  chosen: string | null;
  /** The units chosen together (Maj, Ctrl or ⌘ + clic). */
  picked?: readonly string[];
  /** A unit clicked; `add`: with Maj, Ctrl or ⌘, added to those chosen (or taken out). */
  pick(id: string, add?: boolean): void;
  /** The item moved to this place among those of its row. */
  move(id: string, index: number): void;
  /** The item dropped in the free room beside it, `by` mm along the run from where it stood (document/kitchen-slide.ts). */
  slide?(id: string, by: number): void;
  /** The chosen unit's width, pulled by its right edge (mm). */
  resize?(id: string, width: number): void;
  /** A corner clicked: its settings. */
  corner?(): void;
  /** The appliances put by hand in front of the run (Électroménager). */
  appliances?: readonly HandAppliance[];
  /** A width clicked: a unit's, or a corner door's (low or up); its label, for the calculator to open beside it. */
  edit?(what: StripEdit, label: Element): void;
  /** Where the worktop lies along the run (document/kitchen-plan-build.ts, `worktopSpans`); empty: taken away. */
  worktop?: readonly [number, number][];
  /** What else is chosen than a unit: an appliance put by hand, or the worktop. */
  other?: StripOther | null;
  /** An appliance put by hand, or the worktop, clicked. */
  pickOther?(what: StripOther): void;
  /** A filler the plan put in a gap clicked (its place along the run): to be chosen as a unit is. */
  filler?(gap: [number, number]): void;
  /** The run's pieces as the plan builds them (document/kitchen-plan-build.ts): its splashback, worktop returns and finishing sides drawn as the 3D has them. */
  boxes?: readonly KitchenBox[];
  /** A key pressed on the strip (Suppr, Ctrl + D, the arrows); a right click on a unit. */
  key?(event: KeyboardEvent): void;
  menu?(id: string, event: MouseEvent): void;
  /** The strip takes the keyboard as it is drawn: something on it was just chosen or changed. */
  focus?: boolean;
}

/** What else than a unit is chosen on the strip; a caisson furnished by hand by the item that keeps its room. */
export type StripOther = { kind: "appliance"; id: string } | { kind: "worktop" } | { kind: "kick" } | { kind: "caisson"; id: string } | { kind: "corner"; side: "left" | "right"; row: "base" | "wall" };

export type StripEdit = { kind: "item"; id: string; width: number } | { kind: "corner"; side: "left" | "right"; row: "base" | "wall"; width: number };

/** The strip, in an SVG scaled to its width. */
export function runStrip(host: StripHost): SVGSVGElement {
  const { plan: p, run, geometry: g, fill } = host;
  const s = kitchenSizes(p);
  const H = p.height;
  const L = run.length;
  const y = (z: number) => H - z;
  const node = document.createElementNS(SVG, "svg");
  node.setAttribute("viewBox", `-40 -40 ${L + 80} ${H + 200}`);
  node.setAttribute("class", "w-full select-none");
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", `Face de ${run.label.toLowerCase()}`);
  node.style.setProperty("--brass", BRASS);
  const hatch = `kitchen-hatch-${++hatches}`;
  const bare = doorsHidden();
  // The room left free, hatched (not a corner: the units of the corner take it).
  const empty = (x: number, z0: number, w: number, h: number, what: string) => (w > 1 && h > 1 ? `<rect x="${x}" y="${y(z0 + h)}" width="${w}" height="${h}" fill="url(#${hatch})" pointer-events="none" data-empty="${what}"/>` : "");
  const parts: string[] = [
    `<defs><pattern id="${hatch}" patternUnits="userSpaceOnUse" width="70" height="70" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="70" class="stroke-red-500/70 dark:stroke-red-400/70" stroke-width="10"/></pattern></defs>`,
    rect(0, 0, L, H, WALL),
  ];
  for (const sp of g.spans) parts.push(rect(sp.from, y(Math.min(sp.top, H)), sp.to - sp.from, Math.min(sp.top, H) - sp.bottom, sp.bottom > 0 ? "fill-emerald-100 stroke-emerald-500 dark:fill-emerald-950" : "fill-orange-100 stroke-orange-500 dark:fill-orange-950", `data-span="${sp.bottom > 0 ? "window" : "door"}"`));
  // The corners, where the other run's units stand or the corner stays dead.
  if (g.base[0] > 1 && run.left !== "free") parts.push(rect(0, y(s.base), g.base[0], s.base, DEAD, 'data-corner="left"'));
  if (L - g.base[1] > 1 && run.right !== "free") parts.push(rect(g.base[1], y(s.base), L - g.base[1], s.base, DEAD, 'data-corner="right"'));
  /** A corner front's width (cm), and what it is: the door, the fixed panel, the filler. */
  const frontSize = (f: { from: number; to: number; kind: string }, z0: number, z1: number, side: "left" | "right", row: "base" | "wall") => {
    const w = f.to - f.from;
    const what = f.kind === "door" ? "porte" : f.kind === "blind" ? "fixe" : "fileur";
    const mid = y((z0 + z1) / 2);
    // A door's width is clicked to change it; the fixed part is the other wall's depth.
    const how = f.kind === "door" && host.edit ? ` class="cursor-pointer fill-sky-700 underline dark:fill-sky-300" data-edit-side="${side}" data-edit-row="${row}" data-edit-width="${w}"` : ' class="fill-gray-700 dark:fill-gray-200"';
    const hint = f.kind === "door" ? "Cliquer pour changer la largeur de la porte" : f.kind === "blind" ? "La partie fixe vient de la profondeur de l'autre mur : changez la porte" : "Le fileur ferme l'angle";
    return w < 40 ? "" : `<text x="${(f.from + f.to) / 2}" y="${mid}" text-anchor="middle" font-size="${w < 250 ? 60 : 90}"${how} data-corner-width="${f.kind}"><title>${hint}</title>${Number((w / 10).toFixed(1)).toLocaleString("fr-FR")}</text><text x="${(f.from + f.to) / 2}" y="${mid + 80}" text-anchor="middle" font-size="55" class="fill-gray-500 dark:fill-gray-400" pointer-events="none">${what}</text>`;
  };
  // What each corner has: its filler, or its unit's panel and door, each with its width.
  for (const side of ["left", "right"] as const) {
    // Up in the wall row: a wall corner unit's panel and door, or its filler.
    const high = g.wall ? wallCornerSide(p, run, side) : null;
    // Its fronts taken off (« Sans portes »): the shelves of the corner unit behind them, low and up.
    const shelves = (c: { cabinet: [number, number] | null; shelves: number } | null, z0: number, z1: number) => {
      if (!bare || !c?.cabinet || !c.shelves) return;
      for (let i = 1; i <= c.shelves; i++) parts.push(rect(c.cabinet[0] + 20, y(z0 + ((z1 - z0) * i) / (c.shelves + 1) + 9), c.cabinet[1] - c.cabinet[0] - 40, 18, PANEL, 'data-corner-shelf=""'));
    };
    shelves(high, s.wallBottom, s.wallTop);
    for (const f of high?.fronts ?? []) {
      parts.push(rect(f.from, y(s.wallTop), f.to - f.from, s.wallTop - s.wallBottom, f.kind !== "filler" && bare ? OPEN : f.kind === "blind" ? `${PANEL} opacity-70` : PANEL, `data-wall-corner-front="${f.kind}" data-side="${side}"`));
      parts.push(frontSize(f, s.wallBottom, s.wallTop, side, "wall"));
      if (f.kind === "door") {
        const hx = side === "left" ? f.from + 40 : f.to - 40;
        parts.push(`<line x1="${hx}" y1="${y(s.wallBottom + 60)}" x2="${hx}" y2="${y(s.wallBottom + 260)}" stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke"/>`);
      }
    }
    const corner = cornerSide(p, run, side, fill.walls[side === "left" ? 0 : 1]);
    if (!corner) continue;
    shelves(corner, s.plinth, s.base);
    for (const f of corner.fronts) {
      const tone = f.kind !== "filler" && bare ? OPEN : f.kind === "blind" ? `${PANEL} opacity-70` : PANEL;
      parts.push(rect(f.from, y(s.base), f.to - f.from, s.base - s.plinth, tone, `data-corner-front="${f.kind}" data-side="${side}"`));
      parts.push(frontSize(f, s.plinth, s.base, side, "base"));
      if (f.kind === "door") {
        const hx = side === "left" ? f.from + 40 : f.to - 40;
        parts.push(`<line x1="${hx}" y1="${y(s.base - 60)}" x2="${hx}" y2="${y(s.base - 260)}" stroke="${BRASS}" stroke-width="3" vector-effect="non-scaling-stroke"/>`);
      }
    }
    const [a, b] = corner.cabinet ?? [side === "left" ? 0 : g.base[1], side === "left" ? g.base[0] : L];
    parts.push(`<text x="${(a + b) / 2}" y="${H + 120}" text-anchor="middle" font-size="80" class="fill-gray-500 dark:fill-gray-400" pointer-events="none"><title>${corner.name}</title>${corner.kind === "dead" ? "angle" : "angle ✓"}</text>`);
  }
  // The splashback, the worktop's returns and the finishing sides, where the 3D has them: along the run, and up.
  const [o, e] = [runAt(run, 0, 0), runAt(run, 1, 0)];
  const along = (q: Vec3) => (q[0] - o[0]) * (e[0] - o[0]) + (q[1] - o[1]) * (e[1] - o[1]);
  const spanOf = (box: KitchenBox): [number, number] => [along(box.from), along([box.to[0], box.to[1], 0]), along([box.from[0], box.to[1], 0]), along([box.to[0], box.from[1], 0])].reduce<[number, number]>(([lo, hi], u) => [Math.min(lo, u), Math.max(hi, u)], [Infinity, -Infinity]);
  for (const box of host.boxes ?? []) {
    // The worktop too: over a return it runs on (the strip's own worktop stops at the units).
    const finish = box.kind === "splashback" ? (box.name.startsWith("Retour") ? "return" : "splashback") : box.kind === "worktop" ? "worktop" : box.name.startsWith("Joue de finition") ? "end-panel" : null;
    if (!finish) continue;
    const [u0, u1] = spanOf(box);
    const [z0, z1] = [box.from[2], box.to[2]];
    const tone = finish === "end-panel" ? PANEL : finish === "splashback" ? `${STONE} opacity-50` : STONE;
    // Not square (a splashback stepped up under the hood, a piece cut at 45°): its outline.
    const profile = box.profile;
    if (profile) {
      const pts = profile.points.map(([c, z]) => {
        const q: Vec3 = [...box.from];
        q[profile.along] = c;
        return `${along(q)},${y(z)}`;
      });
      parts.push(`<polygon points="${pts.join(" ")}" class="${tone}" vector-effect="non-scaling-stroke" data-finish="${finish}" pointer-events="none"/>`);
    } else parts.push(rect(u0, y(z1), u1 - u0, z1 - z0, tone, `data-finish="${finish}" pointer-events="none"`));
  }
  // The worktop, over the units only; clicked (a band taller than it takes the click), it is chosen.
  const tops = host.worktop ?? (fill.placed.some((pl) => pl.row === "base") ? [zoneSpan(run)] : []);
  const topOn = host.other?.kind === "worktop";
  for (const [a, b] of tops) {
    parts.push(rect(a, y(p.worktopHeight), b - a, p.worktopHeight - s.base, STONE, topOn ? `stroke="${BRASS}" stroke-width="3"` : ""));
    if (host.pickOther) parts.push(`<rect x="${a}" y="${y(p.worktopHeight + 90)}" width="${b - a}" height="${p.worktopHeight - s.base + 90}" fill="transparent" class="cursor-pointer" data-worktop=""><title>Plan de travail : cliquer pour le choisir</title></rect>`);
  }
  for (const [a, b] of fill.fillers) parts.push(`${rect(a, y(s.base), b - a, s.base - s.plinth, `${PANEL}${host.filler ? " cursor-pointer" : ""}`, `data-filler="${a}:${b}"`).replace(/\/>$/, "><title>Fileur : cliquer pour le choisir (Suppr, flèches, largeur)</title></rect>")}`);
  // The room left open, dashed, with its width (cm).
  const open = (a: number, b: number, z0: number, z1: number, row: string) =>
    `${rect(a, y(z1), b - a, z1 - z0, "fill-sky-50/60 stroke-sky-500 dark:fill-sky-950/40", `stroke-dasharray="6 4" data-free="${row}"`)}${empty(a, z0, b - a, z1 - z0, "free")}<text x="${(a + b) / 2}" y="${y((z0 + z1) / 2) + 30}" text-anchor="middle" font-size="90" class="fill-sky-700 dark:fill-sky-300" pointer-events="none">${Number(((b - a) / 10).toFixed(1)).toLocaleString("fr-FR")}</text>`;
  for (const [a, b] of openRoom(fill, "base")) parts.push(open(a, b, 0, s.base, "base"));
  for (const [a, b] of openRoom(fill, "wall")) parts.push(open(a, b, s.wallBottom, s.wallTop, "wall"));
  // A caisson furnished by hand in a room the plan keeps for it: it stands there, drawn as a unit.
  for (const pl of fill.spaces.filter((q) => q.item.furnished)) {
    const [z0, z1] = pl.row === "wall" ? [s.wallBottom, s.wallTop] : [s.plinth, s.base];
    const [a, b] = [pl.at, pl.at + pl.item.width];
    const on = host.other?.kind === "caisson" && host.other.id === pl.item.id;
    parts.push(`<g data-held="${escapeHtml(pl.item.id)}"${host.pickOther ? ' class="cursor-grab"' : ""}><title>Caisson aménagé à la main : cliquer pour le choisir (le modifier dans la 3D, le supprimer), le tirer pour le déplacer</title>${rect(a, y(z1), b - a, z1 - z0, PANEL, on ? `stroke="${BRASS}" stroke-width="3"` : "")}<text x="${(a + b) / 2}" y="${y((z0 + z1) / 2)}" text-anchor="middle" font-size="80" class="fill-gray-600 dark:fill-gray-300" pointer-events="none">Caisson aménagé</text><text x="${(a + b) / 2}" y="${y((z0 + z1) / 2) + 110}" text-anchor="middle" font-size="90" ${host.edit ? `class="cursor-pointer fill-sky-700 underline dark:fill-sky-300" data-edit-item="${escapeHtml(pl.item.id)}"><title>Cliquer pour changer la largeur : le caisson s'y refait, son intérieur adapté</title>` : 'class="fill-gray-600 dark:fill-gray-300" pointer-events="none">'}${Number(((b - a) / 10).toFixed(1)).toLocaleString("fr-FR")}</text></g>`);
  }
  parts.push(`<line x1="-40" y1="${H}" x2="${L + 40}" y2="${H}" class="stroke-gray-500" vector-effect="non-scaling-stroke"/>`);
  node.innerHTML = parts.join("");
  // A corner (its unit, its filler, its dead square) clicked: its settings open.
  // Chosen as a unit is when it can be (« Meuble choisi »), outlined.
  if (host.corner || host.pickOther) {
    for (const piece of node.querySelectorAll<SVGElement>("[data-corner], [data-corner-front], [data-wall-corner-front]")) {
      const side = (piece.dataset.corner ?? piece.dataset.side) as "left" | "right";
      const row = piece.hasAttribute("data-wall-corner-front") ? "wall" : "base";
      const other = host.other;
      if (other?.kind === "corner" && other.side === side && other.row === row) piece.setAttribute("stroke", BRASS), piece.setAttribute("stroke-width", "3");
      piece.style.cursor = "pointer";
      piece.addEventListener("pointerdown", (event) => event.stopPropagation());
      piece.addEventListener("click", () => (host.pickOther ? host.pickOther({ kind: "corner", side, row }) : host.corner?.()));
    }
  }
  // A unit's width under it (over a wall unit): clicked, the calculator; an appliance keeps its widths.
  const editable = (pl: Placed) => !!host.edit && !applianceOf(pl.item);
  const widthText = (pl: Placed, height: number) =>
    `<text x="${pl.item.width / 2}" y="${pl.row === "wall" ? -30 : height + 120}" text-anchor="middle" font-size="90" ${editable(pl) ? `class="cursor-pointer fill-sky-700 underline dark:fill-sky-300" data-edit-item="${escapeHtml(pl.item.id)}"` : 'class="fill-gray-600 dark:fill-gray-300" pointer-events="none"'}>${editable(pl) ? "<title>Cliquer pour changer la largeur</title>" : ""}${Math.round(pl.item.width / 10)}</text>`;
  // The chosen unit's edge, drawn last: over the unit next to it.
  let handle = () => {};
  // The units of each row and the caissons furnished by hand there, in the order a drag puts them in.
  const row = [...fill.placed, ...fill.spaces.filter((q) => q.item.furnished)];
  for (const pl of fill.placed) {
    const { body, z, height } = drawing(pl, p);
    const group = document.createElementNS(SVG, "g");
    group.setAttribute("transform", `translate(${pl.at} ${y(z + height)})`);
    group.setAttribute("data-item", pl.item.id);
    group.setAttribute("class", "cursor-grab");
    const label = `${pl.entry.name} ${Math.round(pl.item.width / 10)}`;
    const chosen = pl.item.id === host.chosen;
    const picked = host.picked?.includes(pl.item.id) ?? false;
    if (picked) group.setAttribute("data-picked", "");
    group.innerHTML = `<title>${escapeHtml(label)}</title>${body}${chosen || picked ? rect(0, 0, pl.item.width, height, picked ? "fill-sky-400/25" : "fill-none", `stroke="${BRASS}" stroke-width="3"`) : ""}${widthText(pl, height)}`;
    drag(node, group, pl, row, host, (event) => host.pick(pl.item.id, event.shiftKey || event.ctrlKey || event.metaKey));
    if (host.menu) group.addEventListener("contextmenu", (event) => (event.preventDefault(), host.menu!(pl.item.id, event)));
    if (chosen && host.resize && !applianceOf(pl.item)) handle = () => edge(node, pl, y(z + height), height, host.resize!);
    node.append(group);
  }
  handle();
  // A width clicked: not a drag of its unit, the calculator.
  if (host.edit) {
    for (const t of node.querySelectorAll<SVGElement>("[data-edit-item], [data-edit-side]")) {
      t.addEventListener("pointerdown", (event) => event.stopPropagation());
      t.addEventListener("click", (event) => {
        event.stopPropagation();
        const item = t.dataset.editItem;
        // A unit's, or a caisson furnished by hand's.
        const placed = item ? [...fill.placed, ...fill.spaces].find((pl) => pl.item.id === item) : undefined;
        if (placed) host.edit!({ kind: "item", id: placed.item.id, width: placed.item.width }, t);
        else if (t.dataset.editSide) host.edit!({ kind: "corner", side: t.dataset.editSide as "left" | "right", row: t.dataset.editRow as "base" | "wall", width: Number(t.dataset.editWidth) }, t);
      });
    }
  }
  // The appliances put by hand, over the units: as the 3D has them.
  for (const a of host.appliances ?? []) {
    const shape = document.createElementNS(SVG, "g");
    shape.setAttribute("data-hand-appliance", a.id);
    const on = host.other?.kind === "appliance" && host.other.id === a.id;
    // Clicked, it is chosen (to take it away); with no one to tell, the click goes through to the unit under it.
    if (host.pickOther) {
      shape.setAttribute("class", "cursor-pointer");
      shape.addEventListener("pointerdown", (event) => event.stopPropagation());
      shape.addEventListener("click", () => host.pickOther!({ kind: "appliance", id: a.id }));
    } else shape.setAttribute("pointer-events", "none");
    shape.innerHTML = `<title>${escapeHtml(a.name)}</title>${rect(a.from, y(a.z1), a.to - a.from, a.z1 - a.z0, "fill-gray-800/90 stroke-gray-950 dark:fill-gray-950/90 dark:stroke-gray-300", on ? `stroke="${BRASS}" stroke-width="3" style="stroke:${BRASS}"` : "")}`;
    node.append(shape);
  }
  for (const top of node.querySelectorAll<SVGElement>("[data-worktop]")) top.addEventListener("click", () => host.pickOther?.({ kind: "worktop" }));
  // A caisson furnished by hand: clicked, chosen; dragged, moved as a unit is.
  for (const held of node.querySelectorAll<SVGGElement>("[data-held]")) {
    const pl = fill.spaces.find((q) => q.item.id === held.getAttribute("data-held"))!;
    if (host.pickOther) drag(node, held, pl, row, host, () => host.pickOther!({ kind: "caisson", id: pl.item.id }), 0);
  }
  // The plinths, over the units' feet: clicked, chosen (set back, taken away, given a look) — all those of the run together.
  if (host.pickOther) {
    const on = host.other?.kind === "kick";
    for (const box of (host.boxes ?? []).filter((b) => b.kind === "kick")) {
      const [u0, u1] = spanOf(box);
      const kick = document.createElementNS(SVG, "rect");
      for (const [k, v] of Object.entries({ x: u0, y: y(box.to[2]), width: Math.max(0, u1 - u0), height: box.to[2] - box.from[2], fill: on ? BRASS : "transparent", "fill-opacity": 0.35, stroke: on ? BRASS : "none", "stroke-width": 3, "vector-effect": "non-scaling-stroke", class: "cursor-pointer", "data-kick": "" })) kick.setAttribute(k, String(v));
      kick.innerHTML = "<title>Plinthe : cliquer pour la choisir (reculer, supprimer, aspect)</title>";
      kick.addEventListener("pointerdown", (event) => event.stopPropagation());
      kick.addEventListener("click", () => host.pickOther!({ kind: "kick" }));
      node.append(kick);
    }
  }
  for (const f of node.querySelectorAll<SVGElement>("[data-filler]")) f.addEventListener("click", () => host.filler?.(f.dataset.filler!.split(":").map(Number) as [number, number]));
  // The keyboard on what is chosen: Suppr, Ctrl + D, the arrows.
  if (host.key) {
    node.setAttribute("tabindex", "0");
    node.style.outline = "none";
    node.addEventListener("keydown", (event) => host.key!(event));
    if (host.focus) queueMicrotask(() => node.isConnected && node.focus({ preventScroll: true }));
  }
  return node;
}

/** The chosen unit's right edge: pulled, its width follows by the centimetre, shown as it goes; let go, it is set. */
function edge(node: SVGSVGElement, pl: Placed, top: number, height: number, resize: (id: string, width: number) => void): void {
  const w0 = pl.item.width;
  const handle = document.createElementNS(SVG, "g");
  handle.setAttribute("class", "cursor-ew-resize");
  handle.setAttribute("data-resize", pl.item.id);
  handle.innerHTML = `<title>Tirer pour changer la largeur</title><rect x="-30" y="0" width="60" height="${height}" fill="transparent"/><rect x="-9" y="${height / 2 - 120}" width="18" height="240" rx="6" fill="${BRASS}"/><text y="-60" text-anchor="middle" font-size="90" fill="${BRASS}" pointer-events="none"></text>`;
  const at = (w: number) => handle.setAttribute("transform", `translate(${pl.at + w} ${top})`);
  at(w0);
  const label = handle.querySelector("text")!;
  handle.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    down.stopPropagation();
    const matrix = node.getScreenCTM()?.inverse();
    const x = (event: PointerEvent) => (matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix).x : event.clientX);
    const start = x(down);
    let width = w0;
    handle.setPointerCapture?.(down.pointerId);
    const motion = (event: PointerEvent) => {
      width = Math.min(2400, Math.max(100, Math.round((w0 + x(event) - start) / 10) * 10));
      at(width);
      label.textContent = `${Number((width / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", motion);
      handle.removeEventListener("pointerup", up);
      if (width !== w0) resize(pl.item.id, width);
    };
    handle.addEventListener("pointermove", motion);
    handle.addEventListener("pointerup", up);
  });
  node.append(handle);
}

/** Pressed and let go where it was: chosen; dragged: put among its row where it is dropped. */
function drag(node: SVGSVGElement, group: SVGGElement, pl: Placed, row: readonly Placed[], host: StripHost, pick: (event: PointerEvent) => void, origin = pl.at): void {
  group.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    down.stopPropagation();
    const matrix = node.getScreenCTM()?.inverse();
    const x = (event: PointerEvent) => (matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix).x : event.clientX);
    const start = x(down);
    let moved = false;
    group.setPointerCapture?.(down.pointerId);
    const motion = (event: PointerEvent) => {
      const dx = x(event) - start;
      if (Math.abs(dx) > 20) moved = true;
      group.setAttribute("transform", `translate(${origin + dx} ${group.transform.baseVal.consolidate()?.matrix.f ?? 0})`);
    };
    const up = (event: PointerEvent) => {
      group.removeEventListener("pointermove", motion);
      group.removeEventListener("pointerup", up);
      if (!moved) return pick(event);
      const by = x(event) - start;
      const middle = pl.at + by + pl.item.width / 2;
      // The units of its row and the caissons furnished by hand there: their order.
      const others = row.filter((o) => o.row === pl.row && o.item.id !== pl.item.id);
      const before = (m: number) => others.filter((o) => o.at + o.item.width / 2 < m).length;
      // Past a neighbour: their order changes. Still between the same ones: it is put down there, in the free room.
      if (before(middle) !== before(pl.at + pl.item.width / 2) || !host.slide) host.move(pl.item.id, before(middle));
      else host.slide(pl.item.id, by);
    };
    group.addEventListener("pointermove", motion);
    group.addEventListener("pointerup", up);
  });
}
