/**
 * « Planche de présentation » (groupe Client) : une page en paysage pour montrer le projet au client — la vue 3D telle
 * qu'elle est cadrée, sa vue de face et de dessus (sur fond blanc, les corps seuls), ses dimensions, ses matières, ce
 * qu'il range, sa composition, un mot pour le client et son prix TTC si on le veut (document/presentation-board.ts).
 * Imprimée, ou enregistrée en PDF par la fenêtre d'impression. Le client et le mot sont gardés par ce navigateur, pour
 * ce projet.
 */
import * as THREE from "three";
import { bodyInfo } from "../../document/materials";
import { money } from "../../document/quote";
import { boardCss, boardFacts, boardHtml } from "../../document/presentation-board";
import type { Vec3 } from "../../document/types";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { quoteTotal } from "./workshop-documents";
import { openModal, printHtml } from "./workshop-ui";

const FORMATS = { A3: [420, 297], A4: [297, 210] } as const;
const key = () => `cao.board.${location.pathname.match(/projects\/([^/]+)/)?.[1] ?? "projet"}`;

interface Saved {
  client: string;
  message: string;
  price: boolean;
  format: keyof typeof FORMATS;
}

function load(): Saved {
  const blank: Saved = { client: "", message: "", price: true, format: "A3" };
  try {
    const s = JSON.parse(localStorage.getItem(key()) ?? "null") as Partial<Saved> | null;
    return { client: typeof s?.client === "string" ? s.client : "", message: typeof s?.message === "string" ? s.message : "", price: s?.price !== false, format: s?.format === "A4" ? "A4" : "A3" };
  } catch {
    return blank;
  }
}

/**
 * The view as framed, then from the front and from above: on white, the bodies and their edges alone (no grid,
 * sketch, selection or check frame: their edges are drawn at the default order, the check's frames above); the camera
 * and all that put back.
 */
function views(viewport: Viewport): { main: string; front: string; top: string } {
  const state = viewport.cameraState();
  const background = viewport.scene.background;
  const body = (o: THREE.Object3D) => !!o.userData.bodyId && (o instanceof THREE.Mesh || (o instanceof THREE.LineSegments && o.renderOrder === 0));
  const hidden = viewport.scene.children.filter((o) => o.visible && !(o instanceof THREE.Light) && o !== viewport.camera && !body(o));
  for (const o of hidden) o.visible = false;
  viewport.scene.background = new THREE.Color("#ffffff");
  const shot = () => {
    viewport.renderer.render(viewport.scene, viewport.camera);
    return viewport.renderer.domElement.toDataURL("image/png");
  };
  try {
    const main = shot();
    viewport.setView("front");
    viewport.fit();
    const front = shot();
    viewport.setView("top");
    viewport.fit();
    const top = shot();
    return { main, front, top };
  } finally {
    viewport.scene.background = background;
    for (const o of hidden) o.visible = true;
    viewport.setCameraState(state);
  }
}

export function openPresentationBoard(viewport: Viewport, editor: Editor): void {
  const saved = load();
  const keep = () => {
    try {
      localStorage.setItem(key(), JSON.stringify(saved));
    } catch {
      // For this window only.
    }
  };
  const field = "w-full border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900";
  const client = el("input", { type: "text", class: `${field} h-8`, value: saved.client, "aria-label": "Client", placeholder: "Nom du client" });
  const message = el("textarea", { class: field, rows: "3", "aria-label": "Mot pour le client", placeholder: "Un dressing en chêne, tout en hauteur…" }, saved.message);
  const price = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: saved.price, "aria-label": "Afficher le prix TTC" });
  const format = el("select", { class: `${field} h-8`, "aria-label": "Format" }, ...(["A3", "A4"] as const).map((f) => el("option", { value: f, selected: f === saved.format }, `${f} paysage`)));
  for (const input of [client, message]) {
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("input", () => ((saved.client = client.value), (saved.message = message.value), keep()));
  }
  price.addEventListener("change", () => ((saved.price = price.checked), keep()));
  format.addEventListener("change", () => ((saved.format = format.value === "A4" ? "A4" : "A3"), keep()));

  const doc = editor.doc;
  const bodies = viewport.displayedBodies
    .filter((id) => !bodyInfo(doc, id).room)
    .flatMap((id) => {
      const box = viewport.bodyMesh(id)?.metrics.bbox;
      return box ? [{ id, box: [[...box[0]], [...box[1]]] as [Vec3, Vec3] }] : [];
    });
  const facts = boardFacts(doc, bodies);
  const length = (mm: number) => formatLength(mm, editor.unit);
  const summary = el(
    "ul",
    { class: "list-disc space-y-0.5 pl-5 text-xs text-gray-600 dark:text-gray-300", "data-board-facts": "" },
    el("li", {}, facts.size ? `Hors tout : ${length(facts.size[0])} × ${length(facts.size[1])} × ${length(facts.size[2])}` : "Rien n'est dessiné."),
    el("li", {}, facts.materials.length ? `Matières : ${facts.materials.map((m) => m.name).join(", ")}` : "Aucune matière choisie."),
    el("li", {}, facts.equipment.length ? `Rangements : ${facts.equipment.join(", ")}` : "Pas de rangement compté."),
    el("li", {}, facts.furniture.length ? `Composition : ${facts.furniture.join(", ")}` : "Pas de meuble nommé."),
  );
  const print = () => {
    if (!bodies.length) return editor.notify("Rien à présenter : dessinez d'abord le projet.", "info");
    const total = saved.price ? quoteTotal(viewport, editor) : null;
    const [w, h] = FORMATS[saved.format];
    const title = document.title.split(" · ")[0] || "Projet";
    const html = boardHtml({ title, client: saved.client, date: new Date().toLocaleDateString("fr-FR"), message: saved.message, images: views(viewport), price: total === null ? null : money(total), facts, length });
    printHtml(`${title} — planche de présentation`, html, boardCss(w, h));
  };
  const content = el(
    "div",
    { class: "w-[28rem] max-w-full space-y-2 text-sm" },
    el("label", { class: "block space-y-1" }, el("span", {}, "Client"), client),
    el("label", { class: "block space-y-1" }, el("span", {}, "Mot pour le client"), message),
    el("label", { class: "flex items-center gap-2" }, price, "Afficher le prix TTC (devis aux tarifs enregistrés)"),
    el("label", { class: "block space-y-1" }, el("span", {}, "Format"), format),
    summary,
    el("p", { class: "text-xs text-gray-500" }, "La grande image est la vue telle que vous l'avez cadrée : tournez-la avant d'imprimer. Les vues de face et de dessus s'y ajoutent. Dans la fenêtre d'impression, choisissez « Enregistrer en PDF » pour l'envoyer."),
  );
  const close = openModal("Planche de présentation", content, [
    { label: "Imprimer / PDF", run: print },
    { label: "Fermer", run: () => close() },
  ]);
}

export function bindPresentationBoard(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  for (const b of root.querySelectorAll('[data-workshop="board"]')) b.addEventListener("click", () => openPresentationBoard(viewport, editor));
}
