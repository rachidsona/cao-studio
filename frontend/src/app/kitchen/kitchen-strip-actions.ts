/**
 * Ce qu'on fait de ce qui est choisi sur la bande d'un linéaire, sans ouvrir un volet : une barre sous la bande
 * (← →, Aligner sur le bas pour un meuble haut, Dupliquer, Supprimer), le clavier — Suppr le supprime (sa place reste
 * vide, on la referme si l'on veut : « Resserrer les meubles »), Ctrl + D le duplique, les flèches le déplacent d'un
 * cran — et le clic droit sur un meuble. Un meuble (ou plusieurs), un appareil posé à la main (Électroménager, ôté avec
 * sa découpe), le plan de travail du linéaire, qu'on supprime et qu'on remet, ou sa plinthe : reculée ou avancée,
 * supprimée et remise, son aspect choisi dans l'Apparence.
 */
import type { HandAppliance } from "../../document/kitchen-hand-appliances";
import type { KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import { CAP } from "../../document/kitchen-plan-shapes";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import type { CapState } from "./kitchen-unit-inside";
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
  /** A caisson furnished by hand (by the item keeping its room): isolated to be changed in the 3D, or deleted, its room left free. */
  openCaisson(id: string): void;
  removeCaisson(id: string): void;
  /** The corner unit chosen taken away: a dead corner low, nothing up (its fillers close the corner). */
  removeCorner(side: "left" | "right", row: "base" | "wall"): void;
  setWorktop(on: boolean): void;
  /** The plan's casquette (the whole kitchen's): what it is, and its change (a kind, a size, or none). */
  cap: CapState;
  setCap(patch: Partial<KitchenFloorPlan>): void;
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

/** A unit copied on a strip (Ctrl + C), to be pasted on this run or another (Ctrl + V): as it is, without its place. */
let copied: KitchenRunItem | null = null;

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
    // The units of its row and the caissons furnished by hand there, not the room kept free.
    const same = item ? items.filter((i) => rowOf(itemEntry(i)) === rowOf(itemEntry(item)) && (!isSpace(i) || !!i.furnished)) : [];
    return [item ? same.indexOf(item) : -1, same.length];
  };
  const copy = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item && !isSpace(item)) copied = structuredClone(item);
  };
  // After the unit chosen when it is of its row, else at the end of its row (features/kitchen-run-items.ts `insertItem`).
  const paste = (after: string | null) => copied && host.putAfter({ ...copied, id: newItem(items, copied.model, copied.width).id }, after ?? "");
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
  } else if (host.other?.kind === "caisson") {
    const id = host.other.id;
    label = `Caisson aménagé ${(items.find((i) => i.id === id)?.width ?? 0) / 10} cm`;
    const [index, count] = place(id);
    buttons = [
      button("←", "data-strip-left", "Un cran à gauche (←) ; ou tirez-le sur la bande", () => step(id, -1), index <= 0),
      button("→", "data-strip-right", "Un cran à droite (→)", () => step(id, 1), index < 0 || index >= count - 1),
      button("Modifier dans la 3D", "data-strip-caisson-open", "Isole ce caisson, de face, pour changer ses étagères, cloisons, tiroirs et portes", () => host.openCaisson(id)),
      button("Supprimer", "data-strip-remove", "Ôte ce caisson avec ses panneaux et ses portes (Suppr) : sa place reste vide", () => host.removeCaisson(id)),
    ];
  } else if (host.other?.kind === "corner") {
    const { side, row } = host.other;
    label = `Angle ${side === "left" ? "de gauche" : "de droite"}${row === "wall" ? ", en haut" : ""} : réglé sous « Meuble choisi »`;
    buttons = [button(row === "wall" ? "Supprimer le haut d'angle" : "Supprimer le meuble d'angle", "data-strip-remove", row === "wall" ? "Plus rien en haut dans cet angle (Suppr) ; il se remet sous « Meuble choisi »" : "Un angle mort à la place, fermé par deux fileurs (Suppr) ; il se remet sous « Meuble choisi »", () => host.removeCorner(side, row))];
  } else if (host.other?.kind === "capUnit") {
    const key = host.other.key;
    // Taken away already (the strip drawn again): put back with the others.
    const gone = !!host.cap.skip?.includes(key);
    label = gone ? `${host.other.name} : ôté` : host.other.name;
    buttons = gone
      ? [button("Remettre les caissons de casquette", "data-strip-cap-units-on", "Les caissons de casquette ôtés reviennent, dans toute la cuisine", () => host.setCap({ capSkip: undefined }))]
      : [button("Ôter ce caisson", "data-strip-remove", "Plus de caisson de casquette sur ce meuble (Suppr) ; « Remettre les caissons de casquette » les remet tous", () => host.setCap({ capSkip: [...(host.cap.skip ?? []), key] }))];
  } else if (host.other?.kind === "cap") {
    label = "Casquette des meubles hauts (toute la cuisine)";
    buttons = capRows(host);
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
    buttons = [...(empty.length ? [button(`Resserrer les meubles (${empty.length} place${empty.length > 1 ? "s" : ""} vide${empty.length > 1 ? "s" : ""})`, "data-strip-close-up", "Ôte les places gardées vides : les meubles se rapprochent. Pour n'en refermer qu'une, glissez un voisin dedans, ou « Place libre » › « Supprimer ».", () => host.change(items.filter((i) => !empty.includes(i)), null, []))] : []), ...(host.worktopOff ? [button("Remettre le plan de travail", "data-strip-worktop-on", "Ce linéaire a de nouveau son plan de travail", () => host.setWorktop(true))] : []), ...(host.kick.on ? [] : [button("Remettre la plinthe", "data-strip-kick-on", "Ce linéaire a de nouveau sa plinthe", () => host.setKick({ on: true }))]), ...(host.cap.kind === "units" && host.cap.skip?.length ? [button("Remettre les caissons de casquette", "data-strip-cap-units-on", "Les caissons de casquette ôtés reviennent, dans toute la cuisine", () => host.setCap({ capSkip: undefined }))] : [])];
  }
  const chosen = !!appliance || (!!host.other && host.other.kind !== "appliance") || ids.length > 0;
  // Its name on a line of its own, whole; what one does of it under it.
  const bar = el("div", { class: "space-y-1", "data-strip-actions": "", role: "toolbar", "aria-label": "Ce qui est choisi sur la bande" }, el("p", { class: chosen ? "truncate font-medium" : "text-2xs text-gray-500 dark:text-gray-400" }, label), buttons.length ? el("div", { class: "flex flex-wrap gap-1" }, ...buttons) : null);
  return {
    bar,
    key(event) {
      const mod = event.ctrlKey || event.metaKey;
      const one = ids.length === 1 ? ids[0]! : host.other?.kind === "caisson" ? host.other.id : null;
      const done = () => (event.preventDefault(), event.stopPropagation());
      if (event.key === "Delete" || event.key === "Backspace") {
        if (appliance) host.removeAppliance(appliance.id);
        else if (host.other?.kind === "caisson") host.removeCaisson(host.other.id);
        else if (host.other?.kind === "corner") host.removeCorner(host.other.side, host.other.row);
        else if (host.other?.kind === "worktop") host.setWorktop(false);
        else if (host.other?.kind === "cap") host.setCap({ cap: undefined });
        else if (host.other?.kind === "capUnit" && !host.cap.skip?.includes(host.other.key)) host.setCap({ capSkip: [...(host.cap.skip ?? []), host.other.key] });
        else if (host.other?.kind === "kick") host.setKick({ on: false });
        else if (ids.length) remove(ids);
        else return;
        done();
      } else if (mod && event.key.toLowerCase() === "d" && ids.length) {
        duplicate(ids);
        done();
      } else if (mod && event.key.toLowerCase() === "c" && ids.length === 1) {
        copy(ids[0]!);
        done();
      } else if (mod && event.key.toLowerCase() === "v" && copied) {
        paste(ids.length === 1 ? ids[0]! : null);
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
        { label: "Dupliquer (Ctrl + D)", run: () => duplicate([id]) },
        { label: "Copier (Ctrl + C)", run: () => copy(id) },
        { label: `Coller après lui${copied ? ` : ${itemEntry(copied).name}` : ""} (Ctrl + V)`, disabled: !copied, run: () => paste(id) },
        { label: "Un cran à gauche", disabled: index <= 0, run: () => step(id, -1) },
        { label: "Un cran à droite", disabled: index >= count - 1, run: () => step(id, 1) },
        ...(high(id) ? [{ label: "Aligner sur le meuble du dessous", run: () => host.align(id) }] : []),
        "separator",
        { label: "Supprimer", danger: true, run: () => remove([id]) },
      ]);
    },
  };
}

/** The casquette chosen on the strip: its kind, its height and its depth off the wall (typed, Entrée), and « Supprimer ». */
function capRows(host: StripActionsHost): HTMLElement[] {
  const { kind, unit } = host.cap;
  const FIELD = "h-7 w-20 border border-gray-300 bg-transparent px-1 text-right font-mono dark:border-gray-600";
  const select = el("select", { class: "h-7 border border-gray-300 bg-transparent px-1 dark:border-gray-600", "aria-label": "Sorte de casquette", "data-strip-cap-kind": "" },
    ...([["flat", "Plate"], ["box", "En caisson"], ["units", "Caissons à porte relevante"]] as const).map(([v, text]) => el("option", { value: v, selected: kind === v }, text)));
  select.addEventListener("change", () => host.setCap({ cap: select.value as KitchenFloorPlan["cap"] }));
  const size = (label: string, key: "capHeight" | "capDepth" | "capGap", value: number) => {
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(value, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})`, [`data-strip-${key}`]: "" });
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      const typed = parseNumber(input.value);
      if (event.key === "Enter" && typed !== null && typed >= 0) host.setCap({ [key]: fromDisplay(typed, unit) });
    });
    return el("label", { class: "flex items-center gap-1" }, label, input);
  };
  const height = host.cap.height ?? (kind === "units" ? CAP.unit : CAP.height);
  const depth = host.cap.depth ?? (kind === "units" ? CAP.unitDepth : 0);
  const remove = el("button", { type: "button", class: SMALL, "data-strip-remove": "", title: "Plus de casquette sur toute la cuisine (Suppr) ; elle se remet dans les réglages du plan" }, "Supprimer la casquette");
  remove.addEventListener("click", () => host.setCap({ cap: undefined }));
  // Caissons: the finishing panel between the wall units and them, its thickness (0: none).
  return [select, ...(kind === "flat" ? [] : [size("Hauteur", "capHeight", height)]), size(kind === "units" ? "Profondeur" : "Profondeur (0 : celle des meubles)", "capDepth", depth), ...(kind === "units" ? [size("Panneau dessous (0 : aucun)", "capGap", host.cap.gap ?? 0)] : []), remove];
}
