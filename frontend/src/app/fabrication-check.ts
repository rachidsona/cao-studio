/**
 * « Contrôle » de l'Atelier : avant de lancer la découpe, la liste de ce qui gâcherait du panneau ou bloquerait le
 * montage (document/fabrication-check.ts), rangée par sorte, chaque ligne avec « Voir » qui sélectionne les pièces en
 * cause. Les portes et les tiroirs sont ouverts (en calcul seulement : à 30 %, 60 % et en entier, comme un clic les
 * ouvre) et testés contre les autres corps, murs compris.
 */
import { cutList } from "../document/cut-list";
import { holeProblems, overlapProblems, PROBLEM_TITLES, roomProblems, rowProblems, type Problem, type ProblemKind } from "../document/fabrication-check";
import { isHardwareBody } from "../document/hardware";
import { doorProblems, jointProblems } from "../document/hardware-rules";
import { layoutProblems } from "../document/layout-check";
import { layoutOf } from "./layout-check";
import { carcassBoards } from "./assembly-tool";
import { MATERIALS } from "../document/materials";
import { bodyLabel } from "../document/operations";
import type { CadDocument, RoomFeature } from "../document/types";
import { drawerSlide } from "../features/drawer-open";
import { collisions, type Box } from "../features/motion";
import type { GeometryClient } from "../geometry/client";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import { doorSwing, drawerBodies } from "./drawer-toggle";
import type { Editor } from "./editor";
import { partsOf } from "./workshop";
import { flatParts } from "./workshop-cnc";
import { openModal } from "./workshop-ui";
import { shelves } from "./sag-panel";
import { weigh } from "./weight-panel";

const STEPS = [0.3, 0.6, 1];

/** Doors swung and drawers pulled out, step by step, against the other bodies. */
export function openingProblems(viewport: Viewport, doc: CadDocument): Problem[] {
  const boxOf = (id: string): Box | null => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]], [...b[1]]] : null;
  };
  const all = viewport.displayedBodies.filter((id) => !isHardwareBody(doc, id));
  const others = (skip: readonly string[]) => all.filter((id) => !skip.includes(id)).flatMap((id) => {
    const box = boxOf(id);
    return box ? [{ id, box }] : [];
  });
  const problems: Problem[] = [];
  const hitBy = (moving: string[], hits: Set<string>, what: string) => {
    if (hits.size) problems.push({ kind: "opening", severity: "error", message: `${what} heurte ${[...hits].map((h) => bodyLabel(doc, h)).join(", ")} en s'ouvrant.`, bodies: [...moving, ...hits] });
  };
  const drawers = new Set<string>();
  for (const id of all) {
    const box = boxOf(id);
    if (!box) continue;
    const swing = doorSwing(doc, id);
    if (swing) {
      // The view swings a door about its front edge: near the hinge it sweeps through its own thickness, which a
      // real hinge does not; only a deeper overlap is a hit.
      const thickness = Math.min(...[0, 1, 2].map((k) => box[1][k]! - box[0][k]!));
      const hits = new Set(STEPS.flatMap((s) => collisions(box, { kind: "hinge", axis: swing.axis, pivot: swing.pivot, angle: swing.angle * s }, others([id]), thickness + 0.5)));
      hitBy([id], hits, `La porte ${bodyLabel(doc, id)}`);
      continue;
    }
    const drawer = drawerBodies(doc, all, id);
    if (!drawer || drawers.has(drawer.key)) continue;
    drawers.add(drawer.key);
    const front = drawer.bodies.find((b) => /façade/i.test(bodyLabel(doc, b)));
    const back = drawer.bodies.find((b) => /arrière/i.test(bodyLabel(doc, b)));
    const [f, b] = [front && boxOf(front), back && boxOf(back)];
    if (!front || !f || !b) continue;
    const slide = drawerSlide(f, b);
    const axis = [0, 1, 2].find((k) => slide[k] !== 0) as 0 | 1 | 2 | undefined;
    if (axis === undefined) continue;
    const hits = new Set(STEPS.flatMap((s) => collisions(f, { kind: "slide", axis, distance: slide[axis]! * s }, others(drawer.bodies))));
    hitBy(drawer.bodies, hits, `Le tiroir ${bodyLabel(doc, front)}`);
  }
  return problems;
}

/** The furniture tipping over with its drawers out and loaded, or to fix to the wall. */
function stabilityProblems(viewport: Viewport, doc: CadDocument): Problem[] {
  const report = weigh(viewport, doc, 15)?.report;
  if (!report) return [];
  const all = partsOf(viewport, doc).map((p) => p.id);
  const out: Problem[] = [];
  if (report.tips) out.push({ kind: "stability", severity: "error", message: `Le meuble bascule vers l'avant, tiroirs sortis : son centre de gravité passe ${Math.round(-report.margin)} mm devant le pied. À fixer au mur.`, bodies: all });
  else if (report.fixToWall) out.push({ kind: "stability", severity: "warning", message: "Le meuble est haut et peu profond : à fixer au mur (équerre ou sangle anti-basculement).", bodies: all });
  return out;
}

/** Every problem of the model, in the order of the list. */
export async function checkModel(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<Problem[]> {
  const doc = editor.doc;
  const parts = partsOf(viewport, doc);
  const idByName = new Map(parts.map((p) => [bodyLabel(doc, p.id), p.id]));
  const { rows } = cutList(doc, parts);
  const checked = parts.map((p) => {
    const size = [0, 1, 2].map((k) => p.bbox[1][k]! - p.bbox[0][k]!);
    const boxLike = Math.abs(p.volume - size[0]! * size[1]! * size[2]!) <= 1e-3 * size[0]! * size[1]! * size[2]!;
    return { id: p.id, name: bodyLabel(doc, p.id), box: p.bbox, boxLike };
  });
  const sheets = new Map(MATERIALS.map((m) => [m.name, m.sheet]));
  const { parts: flats } = await flatParts(viewport, editor, geometry);
  return [
    ...overlapProblems(checked),
    ...roomProblems(doc.features.filter((f): f is RoomFeature => f.type === "room" && !f.suppressed), checked),
    ...layoutProblems(layoutOf(viewport, doc)),
    ...rowProblems(rows.map((r) => ({ ...r, ids: r.names.flatMap((n) => idByName.get(n) ?? []) })), (m) => sheets.get(m) ?? null),
    ...flats.flatMap((p) => holeProblems(p, idByName.get(p.name) ?? "")),
    ...jointProblems(doc, carcassBoards(viewport, doc, viewport.displayedBodies)),
    ...doorProblems(doc),
    // A middle load (dishes, jars): the boards that would sag under it, in the long run.
    ...shelves(viewport, doc, 15, 200).filter((s) => !s.check.ok).map((s): Problem => ({ kind: "sag", severity: "warning", message: `${s.name} fléchit de ${s.check.sag.toFixed(1)} mm à long terme (limite ${s.check.limit.toFixed(1)} mm) : ${s.check.thicknessNeeded ? `${s.check.thicknessNeeded} mm d'épaisseur` : "un montant au milieu"} ou une portée de ${Math.floor(s.check.maxSpan / 10) * 10} mm au plus.`, bodies: [s.id] })),
    ...openingProblems(viewport, doc),
    ...stabilityProblems(viewport, doc),
  ];
}

export async function showCheck(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<void> {
  const problems = await checkModel(viewport, editor, geometry);
  const show = (bodies: string[]) => {
    viewport.clearSelection();
    for (const id of new Set(bodies)) viewport.toggleInSelection("body", id);
  };
  const errors = problems.filter((p) => p.severity === "error").length;
  const summary = problems.length
    ? `${errors} erreur${errors > 1 ? "s" : ""} et ${problems.length - errors} point${problems.length - errors > 1 ? "s" : ""} à vérifier.`
    : "Aucun problème trouvé : les pièces ne se chevauchent pas, tiennent sur leur panneau, ont une matière, leurs perçages sont dans la matière et les portes et tiroirs s'ouvrent librement.";
  const sections = (Object.keys(PROBLEM_TITLES) as ProblemKind[]).flatMap((kind) => {
    const list = problems.filter((p) => p.kind === kind);
    if (!list.length) return [];
    return [
      el("h3", { class: "mt-3 text-xs font-semibold" }, `${PROBLEM_TITLES[kind]} (${list.length})`),
      ...list.map((p) => {
        const see = el("button", { type: "button", class: "h-7 shrink-0 border border-gray-300 px-2 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Voir");
        see.addEventListener("click", () => show(p.bodies));
        const mark = p.severity === "error" ? el("span", { class: "shrink-0 text-red-600", title: "Erreur" }, "●") : el("span", { class: "shrink-0 text-amber-500", title: "À vérifier" }, "●");
        return el("div", { class: "flex items-start gap-2 py-1 text-xs" }, mark, el("span", { class: "flex-1" }, p.message), see);
      }),
    ];
  });
  const content = el("div", { class: "max-h-[60vh] overflow-y-auto" }, el("p", { class: problems.length ? "text-xs font-medium" : "text-xs font-medium text-emerald-700 dark:text-emerald-400" }, summary), ...sections);
  const close = openModal("Contrôle avant fabrication", content, [{ label: "Fermer", run: () => close() }]);
}
