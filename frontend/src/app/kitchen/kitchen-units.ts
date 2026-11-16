/**
 * « Meubles de cuisine » (groupe Cuisine) : le catalogue des meubles du commerce, en quatre familles — bas, hauts,
 * colonnes, et « Mes meubles », ses propres caissons (app/my-units.ts). Chaque modèle montre son dessin de face à
 * l'échelle (app/unit-elevation.ts), ce qu'il contient et ses cotes ; survoler une largeur redessine le meuble à cette
 * largeur, et un clic l'ajoute. Une annulation par meuble.
 * - Le projet a un Plan de cuisine : le meuble se range dans un de ses linéaires (document/kitchen-plan-add.ts), après le
 *   meuble du plan sélectionné (ou celui ajouté juste avant, ou celui choisi dans le linéaire ouvert), sinon au bout du
 *   premier linéaire où il tient ; la cuisine est refaite, fileurs et plan de travail compris. Un linéaire en cours de
 *   changement le reçoit avec le reste, à son OK.
 * - Sinon il se pose, avec ses façades, à côté du caisson sélectionné (sinon du dernier), construit comme lui
 *   (document/kitchen-catalog.ts), et arrive sélectionné, prêt à être glissé par sa poignée « ✥ » (app/cabinet-drag.ts).
 */
import { withCabinetFurnished, withCaissonsPlaced } from "../../document/cabinet-furnish";
import * as THREE from "three";
import { CATALOG, KINDS, addKitchenUnit, type CatalogEntry, type UnitKind } from "../../document/kitchen-catalog";
import { kitchenPlanIn, kitchenPlanOf, withKitchenBuilt } from "../../document/kitchen-floor";
import { addToKitchenPlan, planItemOf, planSpace, type PlanItem } from "../../document/kitchen-plan-add";
import { spaceLeft } from "../../features/kitchen-run-items";
import { CORNER_KINDS, WALL_CORNER_KINDS, withCorner, type CornerChange } from "../../document/kitchen-corners";
import { kitchenRuns, type Joint } from "../../document/kitchen-plan-shapes";
import type { CadDocument } from "../../document/types";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import { cabinetBodies } from "../cabinet-drag";
import { selectedCabinet } from "../drivers-3d";
import type { Editor } from "../editor";
import { cornerChoice } from "./kitchen-corner-choice";
import { kitchenRunOpen } from "./kitchen-plan-tool";
import { myUnitsSection } from "./my-units";
import { modelRow } from "./kitchen-catalog-view";
import { BRASS } from "./unit-elevation";
import { floatingPanel } from "../workshop/workshop-ui";

type Family = UnitKind | "mine" | "corner";
/** « Mur A » → « mur A ». */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const FAMILIES: [Family, string][] = [["base", "Bas"], ["wall", "Hauts"], ["tall", "Colonnes"], ["mine", "Mes meubles"]];

export function bindKitchenUnits(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="kitchen-units"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;

  // When it stands out of the view: all the model in view, from the same side.
  const box = (ids: readonly string[]) => {
    const b = new THREE.Box3();
    for (const id of ids) {
      const m = viewport.bodyMesh(id)?.metrics.bbox;
      if (m) b.expandByPoint(new THREE.Vector3(...m[0])).expandByPoint(new THREE.Vector3(...m[1]));
    }
    return b;
  };
  const show = (cabinet: string) => {
    const added = box(cabinetBodies(editor.doc, viewport.displayedBodies, cabinet));
    if (!added.isEmpty() && !viewport.boxVisible(added, 0.8)) viewport.fitBox(box(viewport.displayedBodies), 1.35);
  };
  /** The unit added last to the plan, and the project and selection then: the next one goes after it. */
  let lastAdded: { doc: CadDocument; selected: string | undefined; at: PlanItem } | null = null;
  /** Where a unit goes in the plan: after the last one added, the one chosen in the open run, or the plan's unit selected. */
  const planAnchor = (): Partial<PlanItem> | null => {
    const selected = selectedCabinet(editor)?.id;
    if (lastAdded && lastAdded.doc === editor.doc && lastAdded.selected === selected) return lastAdded.at;
    const open = kitchenRunOpen();
    if (open) return { plan: open.plan, run: open.run, ...(open.chosen ? { item: open.chosen } : {}) };
    return selected ? planItemOf(editor.doc, selected) : null;
  };

  const add = async (entry: CatalogEntry) => {
    const open = kitchenRunOpen();
    if (open?.dirty) {
      open.add(entry);
      return editor.notify(`${entry.name} ajouté au linéaire en cours (Plan de cuisine).`, "success");
    }
    const anchor = selectedCabinet(editor);
    const inPlan = addToKitchenPlan(editor.doc, entry, planAnchor());
    if (inPlan && typeof inPlan !== "string") {
      const selected = anchor?.id;
      // One of « Mes caissons »: made in its place.
      if (entry.caisson) ({ doc: inPlan.doc } = withCaissonsPlaced(inPlan.doc, inPlan.plan));
      await editor.change(inPlan.doc);
      lastAdded = { doc: editor.doc, selected, at: { plan: inPlan.plan, run: inPlan.run.id, item: inPlan.item } };
      if (inPlan.cabinet && !entry.caisson) show(inPlan.cabinet);
      render();
      const space = `Place libre sur le ${lower(inPlan.run.label)} : ${spaceLeft(inPlan.fill, length, inPlan.run.wall)}.`;
      return editor.notify([`${entry.name} rangé dans le plan de cuisine, ${lower(inPlan.run.label)}.`, space, ...inPlan.problems].join(" "), inPlan.problems.length ? "info" : "success");
    }
    const { doc, cabinet, fronts } = addKitchenUnit(editor.doc, entry, anchor?.id);
    const furnished = entry.caisson ? withCabinetFurnished(doc, cabinet.id, entry.caisson) : null;
    if (furnished && typeof furnished !== "string") {
      await editor.change(furnished.doc);
      return editor.notify(`${entry.name} posé, aménagé comme vous l'avez gardé ; tirez ✥ pour le placer.`, "success");
    }
    await editor.change(doc);
    if (typeof inPlan === "string") editor.notify(`${inPlan} Il est posé à part.`, "info");
    show(cabinet.id);
    viewport.clearSelection();
    for (const id of cabinetBodies(editor.doc, viewport.displayedBodies, cabinet.id)) viewport.toggleInSelection("body", id);
    if (typeof inPlan !== "string") editor.notify(`${cabinet.name} ajouté${anchor ? ` à côté de ${anchor.name}` : ""}${fronts ? " avec ses façades" : ""} ; tirez ✥ pour le placer.`, "success");
  };

  const length = (mm: number) => formatLength(mm, editor.unit);
  /** The room left on each run of the plan, with a unit on it or not. */
  const spaceList = (): HTMLElement | null => {
    const plan = kitchenPlanOf(editor.doc);
    if (!plan || kitchenRunOpen()?.dirty) return null;
    const runs = planSpace(editor.doc, plan.id);
    return el(
      "div",
      { class: "space-y-0.5 border border-sky-200 bg-sky-50/60 px-2 py-1.5 text-2xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100", "data-units-space": "" },
      el("p", { class: "font-medium" }, "Place libre"),
      ...runs.map(({ run, fill }) => el("p", {}, `${run.label} : ${spaceLeft(fill, length, run.wall)}`)),
    );
  };

  /** Where the next unit goes, in words. */
  const where = (anchor: string | undefined): string => {
    const open = kitchenRunOpen();
    if (open?.dirty) return "Va dans le linéaire en cours de changement, au Plan de cuisine.";
    const plan = kitchenPlanOf(editor.doc);
    if (!plan) return anchor ? `Se pose à côté de « ${anchor} », construit comme lui.` : "Choisissez une largeur : le meuble se pose après le dernier.";
    const at = planAnchor();
    const runs = kitchenRuns(kitchenPlanIn(editor.doc, at?.plan ?? plan.id) ?? plan.kitchenPlan!);
    const run = runs.find((r) => r.id === at?.run);
    return run ? `Se range dans le plan de cuisine, ${lower(run.label)}${at?.item ? ", après le meuble choisi" : ""}.` : "Se range dans le plan de cuisine, au bout du premier linéaire où il tient.";
  };

  /** The corners of the plan, to choose what goes in each: on wall A, which has them all. */
  const cornersOf = (): HTMLElement | null => {
    const sketch = kitchenPlanOf(editor.doc);
    const plan = sketch && kitchenPlanIn(editor.doc, sketch.id);
    const runA = plan && kitchenRuns(plan).find((r) => r.id === "A");
    if (!sketch || !plan || !runA) return null;
    return cornerChoice(plan, runA, editor.unit, (joint, c) => void chooseCorner(sketch.id, joint, c), render);
  };
  const chooseCorner = async (planId: string, joint: Joint, c: CornerChange) => {
    if (kitchenRunOpen()?.dirty) return editor.notify("Un linéaire est en train d'être enregistré au Plan de cuisine : un instant.", "error");
    const plan = kitchenPlanIn(editor.doc, planId);
    if (!plan) return;
    const made = withKitchenBuilt(editor.doc, planId, withCorner(plan, joint, c));
    if (typeof made === "string") return editor.notify(made, "error");
    await editor.change(made.doc);
    const what = c.kind ? `${CORNER_KINDS[c.kind].label} dans l'angle` : c.wall ? `${WALL_CORNER_KINDS[c.wall].label} dans l'angle` : "Angle réglé";
    editor.notify([`${what} : la cuisine est refaite.`, ...made.problems].join(" "), made.problems.length ? "info" : "success");
  };

  let family: Family = "base";
  const render = () => {
    if (!panel) return;
    const anchor = selectedCabinet(editor);
    const tabs = el(
      "div",
      { role: "tablist", "aria-label": "Familles de meubles", class: "flex border-b border-gray-200 dark:border-gray-700" },
      ...[...FAMILIES, ...(cornersOf() ? [["corner", "Angles"] as [Family, string]] : [])].map(([key, label]) => {
        const chosen = key === family;
        const tab = el("button", { type: "button", role: "tab", "aria-selected": String(chosen), class: `-mb-px flex-1 border-b-2 px-1 py-2 text-xs whitespace-nowrap transition-colors ${chosen ? "border-[var(--brass)] font-medium text-gray-900 dark:text-gray-50" : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"}` }, label);
        tab.addEventListener("click", () => ((family = key), render()));
        return tab;
      }),
    );
    const corners = family === "corner" ? cornersOf() : null;
    const content = corners
      ? [corners]
      : family === "mine"
        ? [myUnitsSection({ doc: () => editor.doc, unit: () => editor.unit, selected: () => selectedCabinet(editor), add: (e) => void add(e), notify: (m, k) => editor.notify(m, k), refresh: render })]
        : [...new Set(CATALOG.filter((e) => e.kind === family).map((e) => e.name))].map((name) => modelRow(CATALOG.filter((e) => e.name === name), editor.unit, (e) => void add(e), "data-unit", { limits: () => [100, 2400] }));
    panel.body.style.setProperty("--brass", BRASS);
    panel.body.replaceChildren(
      tabs,
      el("p", { class: "text-2xs text-gray-500 dark:text-gray-400", "data-units-where": "" }, where(anchor?.name)),
      spaceList() ?? "",
      el("div", {}, ...content),
      el("p", { class: "border-t border-gray-200 pt-2 text-2xs text-gray-500 dark:border-gray-700 dark:text-gray-400" }, "Poignée ✥ : déplacer. Maj : librement. ↻ : tourner."),
    );
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Meubles de cuisine", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
  });
  editor.afterRender(() => {
    // Not while a field of the panel is being typed in.
    const typing = document.activeElement?.matches("input, select, textarea");
    if (!(typing && panel?.body.contains(document.activeElement))) render();
  });
}
