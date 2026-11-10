/**
 * Le menu d'une porte : un clic droit sur une porte (ou sa poignée) dans la vue, sans outil en cours. On l'ouvre ou la
 * ferme, on inverse son sens d'ouverture, on ôte ou remet ses poignées, on la renomme, on sélectionne le meuble entier,
 * on la change (en tiroirs pour un caisson, en porte à cadre ou plate pour une Répartition), on la supprime ; le caisson
 * de cuisine qui la porte s'isole pour être aménagé (app/cabinet-furnish.ts). Chaque
 * changement est une annulation (document/door-edit.ts).
 */
import { doorOf, withDoorFlipped, withDoorHandles, withDoorRemoved, withDoorStyle } from "../document/door-edit";
import { bodyLabel, findFeature, renameBody } from "../document/operations";
import type { CadDocument } from "../document/types";
import { el } from "../ui/dom";
import { openTreeMenu, type TreeMenuItem } from "../ui/tree-menu";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { wholeOf } from "./move-whole";
import { furnishCabinet } from "./cabinet-furnish";

const SIDE = { left: "à gauche", right: "à droite" } as const;

/**
 * A name typed in a small field at the pointer; Entrée keeps it, Échap or a click beside leaves it. A name to give
 * (`what`: its label and its attribute) is kept even unchanged.
 */
export function askName(x: number, y: number, value: string, done: (name: string) => void, what?: { label: string; attr: string }): void {
  const input = el("input", { type: "text", value, class: "h-8 w-56 border border-sky-500 bg-white px-2 text-xs shadow-xl focus:outline-none dark:bg-gray-900", "aria-label": what?.label ?? "Nom de la porte", [what?.attr ?? "data-door-name"]: "" });
  const box = el("div", { class: "fixed z-50", style: `left:${Math.min(x, innerWidth - 240)}px;top:${Math.min(y, innerHeight - 40)}px` }, input);
  let ended = false;
  const end = (keep: boolean) => {
    // Entrée, then the blur of the field taken away: once.
    if (ended) return;
    ended = true;
    box.remove();
    const name = input.value.trim();
    if (keep && name && (what || name !== value)) done(name);
  };
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") end(true);
    if (event.key === "Escape") end(false);
  });
  input.addEventListener("blur", () => end(true));
  document.body.append(box);
  input.select();
  input.focus();
}

/** The menu of the door under the pointer; false when it is no door. */
export function openDoorMenu(event: MouseEvent, viewport: Viewport, editor: Editor, bodyId: string): boolean {
  const doc = editor.doc;
  const door = doorOf(doc, bodyId);
  if (!door) return false;
  const apply = (made: CadDocument | string, done: string) => {
    if (typeof made === "string") return editor.notify(made, "info");
    void editor.change(made);
    editor.notify(done, "success");
  };
  const name = bodyLabel(doc, bodyId);
  const f = findFeature(doc, door.feature);
  const pair = f?.type === "fronts" && f.layout === "doors";
  const whole = wholeOf(doc, bodyId, viewport.displayedBodies);
  const items: TreeMenuItem[] = [
    { heading: name },
    { label: "Ouvrir / fermer la porte", run: () => document.dispatchEvent(new CustomEvent("cad:toggle-door", { detail: bodyId })) },
    {
      label: door.hinge ? `Ouvrir de l'autre côté (charnières ${SIDE[door.hinge === "left" ? "right" : "left"]})` : "Ouvrir de l'autre côté",
      disabled: pair,
      run: () => apply(withDoorFlipped(doc, bodyId), door.hinge ? `« ${name} » s'ouvre maintenant ${SIDE[door.hinge === "left" ? "right" : "left"]}.` : `« ${name} » s'ouvre maintenant de l'autre côté.`),
    },
    ...(door.handles !== null ? [{ label: door.handles ? "Ôter les poignées" : "Mettre des poignées", run: () => apply(withDoorHandles(doc, bodyId), door.handles ? "Poignées ôtées." : "Poignées posées.") }] : []),
    { label: "Renommer…", run: () => askName(event.clientX, event.clientY, name, (next) => apply(renameBody(editor.doc, bodyId, next), `Porte renommée « ${next} ».`)) },
    "separator",
    ...(whole ? [{ label: `Sélectionner « ${whole.name} » entier`, run: () => {
      viewport.clearSelection();
      for (const id of whole.bodies) viewport.toggleInSelection("body", id);
    } }] : []),
    ...(f?.type === "fronts" ? [{ label: "Isoler et aménager le caisson", run: () => void furnishCabinet(editor, f.cabinet) }] : []),
    ...(door.kind === "fronts" ? [{ label: "Remplacer par des tiroirs", run: () => apply(withDoorStyle(doc, bodyId), "Les portes sont devenues des tiroirs.") }] : []),
    ...(door.kind === "partition" && f?.type === "niche" ? [{ label: f.style === "frame" ? "Portes plates" : "Portes à cadre", run: () => apply(withDoorStyle(doc, bodyId), f.style === "frame" ? "Portes plates." : "Portes à cadre.") }] : []),
    "separator",
    { label: "Supprimer la porte", danger: true, run: () => apply(withDoorRemoved(doc, bodyId), `« ${name} » supprimée (Annuler la remet).`) },
  ];
  openTreeMenu(event.clientX, event.clientY, items);
  return true;
}
