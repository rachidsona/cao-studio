/**
 * « Contrôle » de l'Atelier : avant de lancer la découpe, la liste de ce qui gâcherait du panneau ou bloquerait le
 * montage (document/fabrication-check.ts), rangée par sorte, chaque ligne avec « Voir » qui sélectionne les pièces en
 * cause. Les portes et les tiroirs sont ouverts (en calcul seulement : à 30 %, 60 % et en entier, comme un clic les
 * ouvre) et testés contre les autres corps, murs compris — une porte jusqu'à l'angle de la charnière choisie (110°,
 * 155°…). La quincaillerie choisie est vérifiée selon les règles de ses fabricants (document/maker-rules.ts).
 */
import { cutList } from "../../document/cut-list";
import { dressingChecks } from "../../document/dressing-check";
import { holeProblems, overlapProblems, PROBLEM_TITLES, roomProblems, rowProblems, type Problem, type ProblemKind } from "../../document/fabrication-check";
import { isHardwareBody } from "../../document/hardware";
import { doorProblems, jointProblems } from "../../document/hardware-rules";
import { chosenHardware } from "../../document/hardware-catalog";
import { projectMakerProblems } from "../../document/maker-rules";
import { layoutProblems } from "../../document/layout-check";
import { layoutOf } from "./layout-check";
import { carcassBoards } from "../assembly-tool";
import { MATERIALS } from "../../document/materials";
import { bodyLabel, bodyOrigin, findFeature } from "../../document/operations";
import { featureOfBody, type CadDocument, type RoomFeature } from "../../document/types";
import { drawerSlide } from "../../features/drawer-open";
import { meshesOverlap } from "../../features/mesh-overlap";
import { withOverlapCut, withOverlapsCut } from "../../document/overlap-fix";
import { collisions, type Box } from "../../features/motion";
import type { GeometryClient } from "../../geometry/client";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import { doorSwing, drawerBodies } from "../drawer-toggle";
import type { Editor } from "../editor";
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
  // A side-hung door opens as far as the chosen hinge lets it (the view's swing is 100°).
  const opening = chosenHardware(doc).hinge.opening;
  const wall = (id: string) => findFeature(doc, featureOfBody(bodyOrigin(doc, id)))?.type === "room";
  for (const id of all) {
    const box = boxOf(id);
    if (!box) continue;
    const swing = doorSwing(doc, id, box);
    if (swing) {
      // The view swings a door about its front edge: near the hinge it sweeps through its own thickness, which a
      // real hinge does not; only a deeper overlap is a hit.
      const thickness = Math.min(...[0, 1, 2].map((k) => box[1][k]! - box[0][k]!));
      const angle = Math.abs(Math.abs(swing.angle) - 100) < 1e-6 ? Math.sign(swing.angle) * opening : swing.angle;
      const hits = new Set(STEPS.flatMap((s) => collisions(box, { kind: "hinge", axis: swing.axis, pivot: swing.pivot, angle: angle * s }, others([id]), thickness + 0.5)));
      hitBy([id], hits, `La porte ${bodyLabel(doc, id)}`);
      // Against a wall: the makers' answer is a filler on the hinge side, or a stop that limits the opening.
      if ([...hits].some(wall)) problems.at(-1)!.message += ` Ouverte à ${Math.abs(angle)}°, elle bute contre le mur : un fileur côté charnière, ou un limiteur d'angle d'ouverture sur la charnière, l'en garde.`;
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

/** What can be told right away, without the flat outlines of the pieces: the control in the view (app/live-check.ts). */
export function quickProblems(viewport: Viewport, doc: CadDocument): Problem[] {
  const parts = partsOf(viewport, doc);
  const idByName = new Map(parts.map((p) => [bodyLabel(doc, p.id), p.id]));
  const { rows } = cutList(doc, parts);
  const checked = parts.map((p) => {
    const size = [0, 1, 2].map((k) => p.bbox[1][k]! - p.bbox[0][k]!);
    const boxLike = Math.abs(p.volume - size[0]! * size[1]! * size[2]!) <= 1e-3 * size[0]! * size[1]! * size[2]!;
    const owner = findFeature(doc, featureOfBody(bodyOrigin(doc, p.id)));
    return { id: p.id, name: bodyLabel(doc, p.id), box: p.bbox, boxLike, ...(owner?.type === "paneling" || owner?.type === "shell" ? { together: owner.id } : {}) };
  });
  const sheets = new Map(MATERIALS.map((m) => [m.name, m.sheet]));
  // A shaped piece (a fillet, a notch) is looked at as it is, not by its box: only real overlaps stay.
  const meshOf = (id: string) => viewport.bodyMesh(id);
  const real = (p: Problem) => {
    if (p.kind !== "overlap" || p.severity === "error" || p.bodies.length !== 2) return true;
    const [a, b] = [meshOf(p.bodies[0]!), meshOf(p.bodies[1]!)];
    if (!a || !b) return true;
    const [la, ha] = a.metrics.bbox;
    const [lb, hb] = b.metrics.bbox;
    return meshesOverlap(a, b, [0, 1, 2].map((i) => Math.max(la[i]!, lb[i]!)), [0, 1, 2].map((i) => Math.min(ha[i]!, hb[i]!)));
  };
  return [
    ...overlapProblems(checked).filter(real),
    ...roomProblems(doc.features.filter((f): f is RoomFeature => f.type === "room" && !f.suppressed), checked),
    ...layoutProblems(layoutOf(viewport, doc)),
    ...dressingChecks(doc).map((message): Problem => ({ kind: "layout", severity: "warning", message, bodies: [] })),
    ...rowProblems(rows.map((r) => ({ ...r, ids: r.names.flatMap((n) => idByName.get(n) ?? []) })), (m) => sheets.get(m) ?? null),
    ...doorProblems(doc),
    ...projectMakerProblems(doc),
    // What the site survey of a Finitions says does not go in (a wall or the ceiling in the way).
    ...doc.features.flatMap((f) => (f.type === "trim" && !f.suppressed ? (f.issues ?? []).map((message): Problem => ({ kind: "layout", severity: "error", message: `${f.name} — ${message}`, bodies: f.source ?? [] })) : [])),
  ];
}

/** Every problem of the model, in the order of the list. */
export async function checkModel(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<Problem[]> {
  const doc = editor.doc;
  const idByName = new Map(partsOf(viewport, doc).map((p) => [bodyLabel(doc, p.id), p.id]));
  const { parts: flats } = await flatParts(viewport, editor, geometry);
  return [
    ...quickProblems(viewport, doc),
    ...flats.flatMap((p) => holeProblems(p, idByName.get(p.name) ?? "")),
    ...jointProblems(doc, carcassBoards(viewport, doc, viewport.displayedBodies)),
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
  const BUTTON = "h-7 border border-gray-300 px-2 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
  const boxVolume = (id: string) => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]) * (b[1][2] - b[0][2]) : 0;
  };
  const bySize = ([a, b]: [string, string]): [string, string] => (boxVolume(a) >= boxVolume(b) ? [a, b] : [b, a]);
  const sections = (Object.keys(PROBLEM_TITLES) as ProblemKind[]).flatMap((kind) => {
    const list = problems.filter((p) => p.kind === kind);
    if (!list.length) return [];
    return [
      el("h3", { class: "mt-3 text-xs font-semibold" }, `${PROBLEM_TITLES[kind]} (${list.length})`),
      ...list.map((p) => {
        const see = el("button", { type: "button", class: "h-7 shrink-0 border border-gray-300 px-2 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Voir");
        see.addEventListener("click", () => show(p.bodies));
        const mark = p.severity === "error" ? el("span", { class: "shrink-0 text-red-600", title: "Erreur" }, "●") : el("span", { class: "shrink-0 text-amber-500", title: "À vérifier" }, "●");
        return el("div", { class: "py-1 text-xs" }, el("div", { class: "flex items-start gap-2" }, mark, el("span", { class: "flex-1" }, p.message), see), overlapFixes(p));
      }),
    ];
  });
  // Two pieces overlapping: one cut by the other, at a click (or all of them at once).
  function overlapFixes(p: Problem): HTMLElement | null {
    if (p.kind !== "overlap" || p.bodies.length !== 2) return null;
    // The larger first: cut by the other, it keeps in one piece (a seat round its back, not the back cut through).
    const [a, b] = bySize(p.bodies as [string, string]);
    const fix = (cut: string, by: string) => {
      const button = el("button", { type: "button", class: BUTTON, "data-fix-overlap": "" }, `Couper « ${bodyLabel(editor.doc, cut)} »`);
      button.addEventListener("click", () => {
        close();
        void editor.change(withOverlapCut(editor.doc, cut, by)).then(() => editor.notify(`« ${bodyLabel(editor.doc, cut)} » coupé là où il entrait dans « ${bodyLabel(editor.doc, by)} ».`, "success"));
      });
      return button;
    };
    return el("div", { class: "mt-1 flex flex-wrap gap-1 pl-4" }, fix(a, b), fix(b, a));
  }
  const overlaps = problems.filter((p) => p.kind === "overlap" && p.bodies.length === 2);
  const all = overlaps.length > 1 ? el("button", { type: "button", class: `${BUTTON} mt-2`, "data-fix-overlaps": "" }, `Corriger les ${overlaps.length} chevauchements`) : null;
  all?.addEventListener("click", () => {
    close();
    void editor.change(withOverlapsCut(editor.doc, overlaps.map((p) => {
      const [large, small] = bySize(p.bodies as [string, string]);
      return [small, large] as const;
    }))).then(() => editor.notify(`${overlaps.length} chevauchements corrigés : chaque fois, la plus grande pièce est coupée par l'autre.`, "success"));
  });
  const content = el("div", { class: "max-h-[60vh] overflow-y-auto" }, el("p", { class: problems.length ? "text-xs font-medium" : "text-xs font-medium text-emerald-700 dark:text-emerald-400" }, summary), all, ...sections);
  const close = openModal("Contrôle avant fabrication", content, [{ label: "Fermer", run: () => close() }]);
}
