/**
 * Ce qu'on fait de ce qui est choisi sur la bande d'un linéaire, sans ouvrir un volet : une barre sous la bande
 * (← →, Aligner sur le bas pour un meuble haut, Dupliquer, Supprimer), le clavier — Suppr le supprime (sa place reste
 * vide, on la referme si l'on veut : « Resserrer les meubles »), Ctrl + D le duplique, les flèches le déplacent d'un
 * cran — et le clic droit sur un meuble. Un meuble (ou plusieurs), un appareil posé à la main (Électroménager, ôté avec
 * sa découpe), le plan de travail du linéaire, qu'on supprime et qu'on remet, ou sa plinthe : reculée ou avancée,
 * supprimée et remise, son aspect choisi dans l'Apparence.
 */
import type { HandAppliance } from "../../document/kitchen-hand-appliances";
import type { KitchenRunItem } from "../../document/types";
import { isSpace, itemEntry, newItem, rowOf, SPACE, SPACE_WALL } from "../../features/kitchen-run-items";
import { withDuplicated } from "../../features/kitchen-run-multi";
import { el } from "../../ui/dom";
import { openTreeMenu } from "../../ui/tree-menu";
import type { StripOther } from "./kitchen-run-strip";
import { KICK_BACK } from "../../document/kitchen-corners";
import { lookPicker } from "./look-picker";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

export interface StripActionsHost {
  items: readonly KitchenRunItem[];
  chosen: string | null;
  picked: readonly string[];
  other: StripOther | null;
  /** The run's worktop was taken away. */
  worktopOff: boolean;
  appliances: readonly HandAppliance[];
  change(items: KitchenRunItem[], chosen: string | null, picked?: string[]): void;
  /** A copy put after a unit, when the run has room for it (said when not). */
  putAfter(copy: KitchenRunItem, after: string): void;
  move(id: string, index: number): void;
  removeAppliance(id: string): void;
  setWorktop(on: boolean): void;
  /** The run's plinth: built or not, how far back from the fronts (mm), its look; and what changes of it. */
  kick: { on: boolean; back: number; look: string | undefined };
  setKick(change: { on?: boolean; back?: number; look?: string | null }): void;
  /** A wall unit set over the base unit under it (features/kitchen-run-align.ts). */
  align(id: string): void;
}

/**
 * The items with those of `ids` taken out, each leaving its room free (an « Espace libre » of its width, as a unit
 * deleted in the 3D): the others stay where they are, and one decides to close up or not. Room already kept free goes.
 */
export function withRoomLeft(items: readonly KitchenRunItem[], ids: readonly string[]): KitchenRunItem[] {
  return items.flatMap((i): KitchenRunItem[] => (!ids.includes(i.id) ? [i] : isSpace(i) ? [] : [{ id: i.id, model: rowOf(itemEntry(i)) === "wall" ? SPACE_WALL : SPACE, width: i.width }]));
}

export function stripActions(host: StripActionsHost): { bar: HTMLElement; key(event: KeyboardEvent): void; menu(id: string, event: MouseEvent): void } {
  const { items } = host;
  const chosenIds = () => (host.picked.length > 1 ? [...host.picked] : host.chosen ? [host.chosen] : []);
  const remove = (ids: readonly string[]) => host.change(withRoomLeft(items, ids), null, []);
  /** The room kept free that nothing holds: taken away, the units close up. */
  const empty = items.filter((i) => isSpace(i) && !i.furnished);
  const duplicate = (ids: readonly string[]) => {
    const one = ids.length === 1 ? items.find((i) => i.id === ids[0]) : undefined;
    // One: its copy beside it, as it is (its own sizes, its door's side), if there is room.
    if (one) return host.putAfter({ ...one, id: newItem(items, one.model, one.width).id }, one.id);
    const made = withDuplicated(items, ids);
    host.change(made.items, null, made.copies);
  };
  /** Its place among the units of its row, and how many they are. */
  const place = (id: string): [number, number] => {
    const item = items.find((i) => i.id === id);
    const same = item ? items.filter((i) => rowOf(itemEntry(i)) === rowOf(itemEntry(item)) && !isSpace(i)) : [];
    return [item ? same.indexOf(item) : -1, same.length];
  };
  const step = (id: string, by: -1 | 1) => {
    const [index, count] = place(id);
    if (index + by >= 0 && index + by < count) host.move(id, index + by);
  };
  const high = (id: string) => {
    const item = items.find((i) => i.id === id);
    return !!item && !isSpace(item) && rowOf(itemEntry(item)) === "wall";
  };
  const button = (text: string, attr: string, title: string, go: () => void, disabled = false) => {
    const b = el("button", { type: "button", class: SMALL, title, disabled, [attr]: "" }, text);
    b.addEventListener("click", go);
    return b;
  };
  const ids = chosenIds();
  const appliance = host.other?.kind === "appliance" ? host.appliances.find((a) => a.id === (host.other as { id: string }).id) : undefined;
  let label: string;
  let buttons: HTMLElement[];
  if (appliance) {
    label = appliance.name;
    buttons = [button("Supprimer l'appareil", "data-strip-remove", "Ôter cet appareil du projet, avec sa découpe dans le plan de travail (Suppr)", () => host.removeAppliance(appliance.id))];
  } else if (host.other?.kind === "worktop") {
    label = "Plan de travail";
    buttons = [button("Supprimer le plan de travail", "data-strip-remove", "Ce linéaire sans plan de travail ni découpes (Suppr) ; il se remet d'un clic", () => host.setWorktop(false))];
  } else if (host.other?.kind === "kick") {
    const { back, look } = host.kick;
    label = `Plinthe${back ? ` · reculée de ${back / 10} cm` : ""}`;
    buttons = [
      button("Reculer", "data-strip-kick-back", `En retrait des façades, ${KICK_BACK.step / 10} cm de plus (jusqu'à ${KICK_BACK.max / 10} cm)`, () => host.setKick({ back: back + KICK_BACK.step }), back >= KICK_BACK.max),
      button("Avancer", "data-strip-kick-front", `Vers les façades, ${KICK_BACK.step / 10} cm`, () => host.setKick({ back: back - KICK_BACK.step }), back <= 0),
      button("Supprimer la plinthe", "data-strip-remove", "Ce linéaire sans plinthe (Suppr) ; elle se remet d'un clic", () => host.setKick({ on: false })),
      lookPicker({ label: "Aspect des plinthes", value: look, set: (id) => host.setKick({ look: id ?? null }), attr: "kick" }),
    ];
  } else if (ids.length) {
    const one = ids.length === 1 ? items.find((i) => i.id === ids[0]) : undefined;
    const [index, count] = one ? place(one.id) : [-1, 0];
    label = one ? itemEntry(one).name : `${ids.length} meubles`;
    buttons = [
      ...(one ? [button("←", "data-strip-left", "Un cran à gauche (←)", () => step(one.id, -1), index <= 0), button("→", "data-strip-right", "Un cran à droite (→)", () => step(one.id, 1), index < 0 || index >= count - 1)] : []),
      ...(one && high(one.id) ? [button("Aligner sur le bas", "data-strip-align", "Son bord au-dessus de celui du meuble bas qui est sous lui : à gauche, sinon à droite", () => host.align(one.id))] : []),
      button("Dupliquer", "data-strip-copy", "Une copie juste après (Ctrl + D)", () => duplicate(ids)),
      button("Supprimer", "data-strip-remove", "Ôter du linéaire (Suppr)", () => remove(ids)),
    ];
  } else {
    label = "Cliquez un meuble, un appareil, le plan de travail ou la plinthe : Suppr le supprime, Ctrl + D le duplique, ← → le déplacent.";
    buttons = [...(empty.length ? [button(`Resserrer les meubles (${empty.length} place${empty.length > 1 ? "s" : ""} vide${empty.length > 1 ? "s" : ""})`, "data-strip-close-up", "Ôte les places gardées vides : les meubles se rapprochent. Pour n'en refermer qu'une, glissez un voisin dedans, ou « Place libre » › « Supprimer ».", () => host.change(items.filter((i) => !empty.includes(i)), null, []))] : []), ...(host.worktopOff ? [button("Remettre le plan de travail", "data-strip-worktop-on", "Ce linéaire a de nouveau son plan de travail", () => host.setWorktop(true))] : []), ...(host.kick.on ? [] : [button("Remettre la plinthe", "data-strip-kick-on", "Ce linéaire a de nouveau sa plinthe", () => host.setKick({ on: true }))])];
  }
  const chosen = !!appliance || host.other?.kind === "worktop" || host.other?.kind === "kick" || ids.length > 0;
  // Its name on a line of its own, whole; what one does of it under it.
  const bar = el("div", { class: "space-y-1", "data-strip-actions": "", role: "toolbar", "aria-label": "Ce qui est choisi sur la bande" }, el("p", { class: chosen ? "truncate font-medium" : "text-2xs text-gray-500 dark:text-gray-400" }, label), buttons.length ? el("div", { class: "flex flex-wrap gap-1" }, ...buttons) : null);
  return {
    bar,
    key(event) {
      const mod = event.ctrlKey || event.metaKey;
      const one = ids.length === 1 ? ids[0]! : null;
      const done = () => (event.preventDefault(), event.stopPropagation());
      if (event.key === "Delete" || event.key === "Backspace") {
        if (appliance) host.removeAppliance(appliance.id);
        else if (host.other?.kind === "worktop") host.setWorktop(false);
        else if (host.other?.kind === "kick") host.setKick({ on: false });
        else if (ids.length) remove(ids);
        else return;
        done();
      } else if (mod && event.key.toLowerCase() === "d" && ids.length) {
        duplicate(ids);
        done();
      } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && one && !mod) {
        step(one, event.key === "ArrowLeft" ? -1 : 1);
        done();
      }
    },
    menu(id, event) {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      const [index, count] = place(id);
      openTreeMenu(event.clientX, event.clientY, [
        { heading: itemEntry(item).name },
        { label: "Dupliquer", run: () => duplicate([id]) },
        { label: "Un cran à gauche", disabled: index <= 0, run: () => step(id, -1) },
        { label: "Un cran à droite", disabled: index >= count - 1, run: () => step(id, 1) },
        ...(high(id) ? [{ label: "Aligner sur le meuble du dessous", run: () => host.align(id) }] : []),
        "separator",
        { label: "Supprimer", danger: true, run: () => remove([id]) },
      ]);
    },
  };
}
