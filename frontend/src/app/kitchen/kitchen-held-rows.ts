/**
 * « Meuble choisi » d'un caisson aménagé à la main, choisi sur la bande d'un linéaire, réglé comme un meuble : sa
 * largeur, sa hauteur (en haut) et sa profondeur — sa Répartition refaite à ces cotes, son intérieur adapté —, et
 * « Modifier dans la 3D » ; ou « Remettre le meuble d'origine », le meuble du catalogue qu'il était (document/caisson-unit.ts).
 */
import { caissonSizes, heldModel, withCaissonSized, withCaissonUnfurnished } from "../../document/caisson-unit";
import type { KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import { itemEntry, itemSize } from "../../features/kitchen-run-items";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";
import { sizeFields } from "./kitchen-unit-sizes";
import { findFeature } from "../../document/operations";
import { keepCaissonAt } from "../cabinet-furnish";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

export interface HeldHost {
  editor: Editor;
  /** The plan as it would be (the run's rest and corners chosen in its editor). */
  plan: KitchenFloorPlan;
  /** The run's item keeping the caisson's room. */
  item: KitchenRunItem;
  /** The run's changes not yet applied: the caisson waits for them. */
  busy: boolean;
  /** Its room's width (the caisson follows it, kitchen-plan-build.ts). */
  width(mm: number): void;
  /** Isolated in the 3D, to change its inside. */
  open(): void;
  /** The model changed in the 3D: drawn again. */
  done(): void;
  redraw(): void;
}

export function heldRows(host: HeldHost): HTMLElement {
  const { editor, item } = host;
  const doc = editor.doc;
  const sketch = item.furnished!;
  const now = caissonSizes(doc, sketch);
  // Its sizes, as a unit of the model it was has them.
  const unit: KitchenRunItem = { id: item.id, model: heldModel(doc, item), width: item.width, ...(item.fridge ? { fridge: item.fridge } : {}) };
  const entry = itemEntry(unit);
  const apply = (made: ReturnType<typeof withCaissonSized>) => {
    if (typeof made === "string") return editor.notify(made, "error");
    if (made.problems.length) editor.notify(made.problems.join(" "), "info");
    void editor.change(made.doc).then(() => host.done());
  };
  const wait = () => (host.busy ? (editor.notify("La cuisine est refaite dans un instant : recommencez ensuite.", "info"), true) : false);
  const replace = (patch: Partial<KitchenRunItem>) => {
    if (patch.width !== undefined) return host.width(patch.width);
    if (wait()) return;
    // « Cotes du modèle »: those of the unit it was.
    const model = itemSize(host.plan, unit, entry);
    const height = "height" in patch ? (patch.height ?? model.height) : undefined;
    const depth = "depth" in patch ? (patch.depth ?? model.depth) : undefined;
    apply(withCaissonSized(editor.doc, sketch, { ...(height !== undefined && entry.kind === "wall" ? { height } : {}), ...(depth !== undefined ? { depth } : {}) }));
  };
  const sizes = sizeFields({ item: { ...unit, ...(now && entry.kind === "wall" ? { height: now.height } : {}), ...(now ? { depth: now.depth } : {}) }, entry, plan: host.plan, unit: editor.unit, replace, redraw: host.redraw });
  const open = el("button", { type: "button", class: SMALL, "data-held-open": "", title: "Isole ce caisson, de face, pour changer ses étagères, cloisons, tiroirs et portes" }, "Modifier dans la 3D");
  open.addEventListener("click", () => host.open());
  const back = el("button", { type: "button", class: `${SMALL} w-full`, "data-held-unfurnish": "", title: `Ôte l'aménagement fait à la main et remet « ${entry.name} » à sa place, à sa largeur : réglable comme les autres (façades, étagères, cloisons)` }, `Remettre le meuble d'origine (${entry.name})`);
  back.addEventListener("click", () => !wait() && apply(withCaissonUnfurnished(editor.doc, sketch)));
  // Kept to be put again elsewhere: in a run (« Mes meubles ») or in a dressing's case.
  const keep = el("button", { type: "button", class: `${SMALL} w-full`, "data-held-keep": "", title: "Le garde dans « Mes caissons », avec son intérieur et ses portes : il se pose ensuite dans un autre linéaire (Ajouter des meubles › Mes meubles), un autre projet, ou une case d'un dressing" }, "Garder dans Mes meubles…");
  keep.addEventListener("click", () => {
    const at = keep.getBoundingClientRect();
    keepCaissonAt(at.left, at.bottom, editor, sketch, findFeature(editor.doc, sketch)?.name ?? "Mon caisson");
  });
  return el(
    "div",
    { class: "space-y-1.5 border border-sky-200 p-1.5 dark:border-sky-900", "data-held-item": item.id },
    el("p", { class: "font-medium text-sky-700 dark:text-sky-300" }, "Aménagé à la main"),
    ...sizes,
    el("div", { class: "flex justify-end" }, open),
    keep,
    back,
  );
}
