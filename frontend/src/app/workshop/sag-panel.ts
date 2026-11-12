/**
 * « Flèche des étagères » de l'Atelier : pour chaque planche horizontale du meuble (étagères, dessus, dessous — pas les
 * fonds de tiroir ni les panneaux de fond), la flèche à long terme sous la charge choisie, comparée à la limite, avec
 * l'épaisseur qui suffit et la portée la plus longue à l'épaisseur actuelle ; « Voir » sélectionne la planche
 * (features/shelf-sag.ts). Le Contrôle avant fabrication signale aussi celles qui fléchissent trop.
 */
import { bodyInfo, materialById } from "../../document/materials";
import { bodyLabel } from "../../document/operations";
import type { CadDocument, Vec3 } from "../../document/types";
import { isHorizontalBoard, LOADS, shelfCheck, type ShelfCheck } from "../../features/shelf-sag";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { partsOf } from "./workshop";
import { floatingPanel } from "./workshop-ui";

const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
/** Boards that carry nothing on them: drawer bottoms, backs, trims. */
const NOT_SHELVES = /tiroir|fond|bandeau|plinthe|socle|porte|façade/i;

/** The horizontal boards of the furniture that carry a load, with their check. */
export function shelves(viewport: Viewport, doc: CadDocument, kgPerM: number, ratio: number): { id: string; name: string; material: string; check: ShelfCheck }[] {
  return partsOf(viewport, doc)
    .filter((p) => isHorizontalBoard(p.bbox as [Vec3, Vec3]) && !NOT_SHELVES.test(bodyLabel(doc, p.id)) && p.bbox[1][2] - p.bbox[0][2] >= 8)
    .map((p) => {
      const material = bodyInfo(doc, p.id).material;
      return { id: p.id, name: bodyLabel(doc, p.id), material: materialById(material)?.name ?? "Matière non choisie (aggloméré supposé)", check: shelfCheck(p.bbox as [Vec3, Vec3], material, kgPerM, ratio) };
    });
}

export function bindSag(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="sag"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let load: string = LOADS[0].id;
  let ratio = 200;
  const mm = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mm`;

  const render = () => {
    if (!panel) return;
    const kg = LOADS.find((l) => l.id === load)?.kgPerM ?? 25;
    const rows = shelves(viewport, editor.doc, kg, ratio);
    const loadSelect = el("select", { class: SELECT, "aria-label": "Charge" }, ...LOADS.map((l) => el("option", { value: l.id, selected: l.id === load }, l.label)));
    loadSelect.addEventListener("change", () => ((load = loadSelect.value), render()));
    const ratioSelect = el("select", { class: SELECT, "aria-label": "Limite" }, ...[[150, "Portée / 150 (tolérant)"], [200, "Portée / 200 (courant)"], [300, "Portée / 300 (exigeant)"]].map(([v, l]) => el("option", { value: String(v), selected: v === ratio }, String(l))));
    ratioSelect.addEventListener("change", () => ((ratio = Number(ratioSelect.value)), render()));
    const bad = rows.filter((r) => !r.check.ok).length;
    const cards = rows.map((r) => {
      const c = r.check;
      const see = el("button", { type: "button", class: "h-6 border border-gray-300 px-2 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Voir");
      see.addEventListener("click", () => {
        viewport.clearSelection();
        viewport.toggleInSelection("body", r.id);
      });
      const advice = c.ok ? "" : c.thicknessNeeded ? ` Il faut ${c.thicknessNeeded} mm d'épaisseur, ou une portée de ${mm(Math.floor(c.maxSpan / 10) * 10)} au plus (un montant, un taquet au milieu).` : ` Même 38 mm ne suffit pas : un montant au milieu, ou une portée de ${mm(Math.floor(c.maxSpan / 10) * 10)} au plus.`;
      return el(
        "div",
        { class: `space-y-0.5 border p-1.5 ${c.ok ? "border-gray-200 dark:border-gray-700" : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"}` },
        el("div", { class: "flex items-center justify-between gap-2" }, el("span", { class: "truncate font-medium", title: r.name }, `${c.ok ? "✓" : "✗"} ${r.name}`), see),
        el("p", { class: "text-gray-600 dark:text-gray-300" }, `Portée ${mm(c.span)} · ${mm(c.thickness)} · ${r.material}`),
        el("p", {}, `Flèche à long terme ${mm(c.sag)} (limite ${mm(c.limit)}).${advice}`),
      );
    });
    panel.body.replaceChildren(
      el("label", { class: "block space-y-1" }, el("span", {}, "Charge"), loadSelect),
      el("label", { class: "block space-y-1" }, el("span", {}, "Flèche admise"), ratioSelect),
      el("p", { class: bad ? "font-medium text-red-700 dark:text-red-400" : "font-medium text-emerald-700 dark:text-emerald-400" }, rows.length ? (bad ? `${bad} planche${bad > 1 ? "s" : ""} sur ${rows.length} fléchi${bad > 1 ? "ssent" : "t"} trop.` : `Les ${rows.length} planches tiennent.`) : "Aucune planche horizontale chargée."),
      ...cards,
      el("p", { class: "text-[11px] text-gray-500" }, "Planche posée sur ses deux bouts, charge répartie ; la flèche à long terme compte le fluage des panneaux (×3,25 pour l'aggloméré et le MDF, ×1,8 pour le contreplaqué, ×1,6 pour le chêne massif)."),
    );
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Flèche des étagères", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
  });
  editor.afterRender(() => {
    if (panel && !panel.body.contains(document.activeElement)) render();
  });
}
