/**
 * « Poids et stabilité » de l'Atelier : le poids du meuble et de ses pièces les plus lourdes, la hauteur de son centre
 * de gravité, et l'essai de basculement — tous les tiroirs sortis et chargés — avec le conseil de le fixer au mur quand
 * il est haut et peu profond (features/stability.ts). Le Contrôle avant fabrication reprend l'essai.
 */
import { bodyInfo } from "../document/materials";
import { bodyLabel } from "../document/operations";
import type { CadDocument, Vec3 } from "../document/types";
import { drawerSlide } from "../features/drawer-open";
import { partMass, stability, type Drawer, type MassPart, type StabilityReport } from "../features/stability";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import { drawerBodies } from "./drawer-toggle";
import type { Editor } from "./editor";
import { partsOf } from "./workshop";
import { floatingPanel } from "./workshop-ui";

const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
type Front = { axis: 0 | 1; sign: -1 | 1 };
const FRONTS: [string, string][] = [["1,-1", "Vers −Y (de face)"], ["1,1", "Vers +Y"], ["0,-1", "Vers −X"], ["0,1", "Vers +X"]];

/** The furniture weighed and tried: its parts with their mass, and the report. */
export function weigh(viewport: Viewport, doc: CadDocument, load: number, front: Front = { axis: 1, sign: -1 }): { parts: { id: string; name: string; mass: number }[]; report: StabilityReport } | null {
  const parts = partsOf(viewport, doc);
  if (!parts.length) return null;
  const byId = new Map<string, MassPart>();
  for (const p of parts) {
    const center = [0, 1, 2].map((i) => (p.bbox[0][i]! + p.bbox[1][i]!) / 2) as Vec3;
    byId.set(p.id, { mass: partMass(p.volume, bodyInfo(doc, p.id).material), center });
  }
  // The drawers, by their front and back (as a click opens them).
  const ids = parts.map((p) => p.id);
  const seen = new Set<string>();
  const drawers: Drawer[] = [];
  const box = (id: string) => parts.find((p) => p.id === id)?.bbox as [Vec3, Vec3] | undefined;
  for (const id of ids) {
    const d = drawerBodies(doc, ids, id);
    if (!d || seen.has(d.key)) continue;
    seen.add(d.key);
    const front = d.bodies.find((b) => /façade/i.test(bodyLabel(doc, b)));
    const back = d.bodies.find((b) => /arrière/i.test(bodyLabel(doc, b)));
    const [f, b] = [front && box(front), back && box(back)];
    if (!f || !b) continue;
    drawers.push({ parts: d.bodies.flatMap((x) => byId.get(x) ?? []), slide: drawerSlide(f, b) });
  }
  const lo = Math.min(...parts.map((p) => p.bbox[0][2]!));
  const footprint = parts.filter((p) => p.bbox[0][2]! <= lo + 1).map((p) => p.bbox as [Vec3, Vec3]);
  const all: [Vec3, Vec3] = [[0, 1, 2].map((i) => Math.min(...parts.map((p) => p.bbox[0][i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...parts.map((p) => p.bbox[1][i]!))) as Vec3];
  return {
    parts: parts.map((p) => ({ id: p.id, name: bodyLabel(doc, p.id), mass: byId.get(p.id)!.mass })),
    report: stability([...byId.values()], drawers, footprint, all, load, front),
  };
}

export function bindWeight(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="weight"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let load = 15;
  let front: Front = { axis: 1, sign: -1 };
  const kg = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg`;

  const render = () => {
    if (!panel) return;
    const loadSelect = el("select", { class: SELECT, "aria-label": "Charge par tiroir" }, ...[0, 10, 15, 25, 35].map((v) => el("option", { value: String(v), selected: v === load }, v ? `${v} kg par tiroir` : "Tiroirs vides")));
    loadSelect.addEventListener("change", () => ((load = Number(loadSelect.value)), render()));
    const frontSelect = el("select", { class: SELECT, "aria-label": "Face avant" }, ...FRONTS.map(([v, l]) => el("option", { value: v, selected: v === `${front.axis},${front.sign}` }, l)));
    frontSelect.addEventListener("change", () => {
      const [axis, sign] = frontSelect.value.split(",").map(Number) as [0 | 1, -1 | 1];
      front = { axis, sign };
      render();
    });
    const result = weigh(viewport, editor.doc, load, front);
    if (!result) return panel.body.replaceChildren(el("p", { class: "text-gray-500" }, "Aucun meuble affiché."));
    const { parts, report } = result;
    const heaviest = [...parts].sort((a, b) => b.mass - a.mass).slice(0, 5);
    const verdict = report.tips
      ? `Il bascule vers l'avant : le centre de gravité passe ${Math.round(-report.margin)} mm devant le pied. Fixez-le au mur, alourdissez le bas ou limitez la sortie des tiroirs.`
      : `Il reste debout : le centre de gravité reste ${Math.round(report.margin)} mm derrière l'arête avant du pied.`;
    panel.body.replaceChildren(
      el("p", { class: "text-base font-semibold" }, `${kg(report.mass)} en tout`),
      el("p", {}, `${parts.length} pièces · centre de gravité à ${Math.round(report.height)} mm du sol.`),
      el("h3", { class: "pt-1 text-[11px] font-semibold text-gray-500 uppercase" }, "Les plus lourdes"),
      ...heaviest.map((p) => el("p", { class: "flex justify-between gap-2" }, el("span", { class: "truncate" }, p.name), el("span", { class: "shrink-0" }, kg(p.mass)))),
      el("h3", { class: "pt-1 text-[11px] font-semibold text-gray-500 uppercase" }, "Essai de basculement"),
      el("label", { class: "block space-y-1" }, el("span", {}, "Tous les tiroirs sortis, chargés de"), loadSelect),
      el("label", { class: "block space-y-1" }, el("span", {}, "Face avant"), frontSelect),
      el("p", { class: report.tips ? "font-medium text-red-700 dark:text-red-400" : "font-medium text-emerald-700 dark:text-emerald-400" }, verdict),
      ...(report.fixToWall ? [el("p", { class: "bg-amber-50 px-2 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, "Haut et peu profond : à fixer au mur (équerre ou sangle anti-basculement), comme le demande la norme des meubles de rangement.")] : []),
      el("p", { class: "text-[11px] text-gray-500" }, "Masses volumiques courantes : aggloméré mélaminé 650 kg/m³, MDF 750, contreplaqué 680, chêne 700, HDF 900 (une pièce sans matière est comptée en aggloméré). La quincaillerie n'est pas pesée."),
    );
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Poids et stabilité", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
  });
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    if (panel && !panel.body.contains(document.activeElement)) render();
  };
}
