/**
 * « Ma bibliothèque » (groupe Menuiserie) : enregistrer les corps choisis — un caisson, un tiroir, une colonne réglés —
 * comme un module de son compte (avec une vignette prise dans la vue), puis le remettre d'un clic dans n'importe quel
 * projet, à l'endroit où il était, ses pièces sélectionnées pour le déplacer. Une face d'un meuble choisie avant
 * « Insérer » : le module s'y colle, dehors, aligné en bas et au dos sur ce meuble (document/glue.ts), en une seule
 * annulation avec l'insertion. Les modules sont gardés par le serveur (/api/library/) ; leur contenu et l'insertion :
 * document/library.ts.
 */
import { featureBacks } from "../document/furniture-facing";
import { boxAround, faceOf, glueShift, type Box, type FaceBox } from "../document/glue";
import { insertModule, moduleOf } from "../document/library";
import { bodyOrigin } from "../document/operations";
import { spacingFeatures, movesNeeded, type Moving } from "../document/spacing";
import { featureOfBody, type CadDocument, type Feature } from "../document/types";
import { freshFeatureIds } from "./curic-common";
import { wholeBodies, wholeOwner } from "./move-whole";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { call } from "./workshop/sharing";
import { floatingPanel } from "./workshop/workshop-ui";

const URL = "/api/library/";
const BUTTON = "h-7 shrink-0 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

interface ModuleRow {
  id: number;
  name: string;
  thumbnail: string;
}

/** The view as a small JPEG (the drawing buffer is read right after a render). */
export function thumbnail(viewport: Viewport): string {
  viewport.renderer.render(viewport.scene, viewport.camera);
  const source = viewport.renderer.domElement;
  const canvas = document.createElement("canvas");
  const scale = 220 / Math.max(source.width, source.height, 1);
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const g = canvas.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#f8fafc";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function bindLibrary(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>("[data-library]");
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let modules: ModuleRow[] = [];
  let message = "";

  /** The bodies chosen: picked whole, or through one of their faces, edges or corners; and the sketches. */
  const chosen = () => {
    const s = editor.picked.selection;
    return [...new Set([...s.bodies, ...s.faces.map((f) => f.bodyId), ...s.edges.map((e) => e.bodyId), ...s.vertices.map((v) => v.bodyId), ...s.sketches])];
  };

  const save = async (name: string) => {
    const module = moduleOf(editor.doc, chosen());
    if (typeof module === "string") return editor.notify(module, "info");
    try {
      await call(URL, { method: "POST", body: JSON.stringify({ name, document: module, thumbnail: thumbnail(viewport) }) });
      message = `« ${name} » est dans la bibliothèque (${module.features.length} fonction${module.features.length > 1 ? "s" : ""}).`;
      await load();
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const boxesOf = (bodies: readonly string[]): Box[] => bodies.flatMap((id) => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[[...b[0]], [...b[1]]] as Box] : [];
  });

  // The face under the last click in the view: a click on a cabinet may select it whole, the face clicked is kept.
  let clicked: { bodyId: string; faceIndex: number } | null = null;
  let down: { x: number; y: number } | null = null;
  const canvas = viewport.renderer.domElement;
  canvas.addEventListener("pointerdown", (event) => (down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null));
  canvas.addEventListener("pointerup", (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4 || viewport.inSketch) return;
    const face = viewport.pickFace(event);
    clicked = face ? { bodyId: face.bodyId, faceIndex: face.faceIndex } : null;
  });

  /**
   * The face chosen before « Insérer » — picked as a face, or clicked on a body then selected (whole) — with the
   * furniture it is part of (its box, its back): where to glue.
   */
  const target = (): { face: FaceBox; owner: Box; back: [number, number] | null } | null => {
    const selection = editor.picked.selection;
    const picked = selection.faces[0] ?? (clicked && selection.bodies.includes(clicked.bodyId) ? clicked : undefined);
    const mesh = picked && viewport.bodyMesh(picked.bodyId);
    const face = mesh ? faceOf(mesh, picked.faceIndex) : null;
    if (!picked || !face) return null;
    const doc = editor.doc;
    const whole = wholeOwner(doc, picked.bodyId);
    const bodies = whole ? wholeBodies(doc, whole.kind, whole.id, viewport.displayedBodies) : [picked.bodyId];
    const owner = boxAround(boxesOf(bodies));
    const back = featureBacks(doc).get(featureOfBody(bodyOrigin(doc, picked.bodyId)))?.back ?? null;
    return owner ? { face, owner, back } : null;
  };

  /** The module just inserted, moved against the face: its cabinets and sketches moved in place, other bodies by a move. */
  const glued = (doc: CadDocument, features: readonly string[], at: NonNullable<ReturnType<typeof target>>): CadDocument | null => {
    const bodies = viewport.displayedBodies.filter((id) => features.includes(featureOfBody(id)));
    const box = boxAround(boxesOf(bodies));
    const shift = box && glueShift(box, at.face, at.owner, at.back);
    if (!shift || Math.hypot(...shift) < 1e-6) return null;
    const groups = new Map<string, Moving>();
    for (const id of bodies) {
      const whole = wholeOwner(doc, id);
      const key = whole?.id ?? id;
      const m = groups.get(key) ?? { key, whole: !!whole, shift, bodies: [] };
      m.bodies.push(id);
      groups.set(key, m);
    }
    const moving = [...groups.values()];
    const made = spacingFeatures(doc, moving, freshFeatureIds(doc, "mv", "Collage", movesNeeded(doc, moving)));
    // A cabinet or a sketch moved in place keeps its id; a move of a body is new.
    const kept = doc.features.map((f) => made.find((m) => m.id === f.id) ?? f);
    return { ...doc, features: [...kept, ...made.filter((m) => !doc.features.some((f) => f.id === m.id))] as Feature[] };
  };

  const insert = async (row: ModuleRow) => {
    try {
      const at = target();
      const { document } = await call<{ document: CadDocument }>(`${URL}${row.id}/`);
      const { doc, features } = insertModule(editor.doc, document);
      await editor.change(doc);
      // A face chosen: the module against it, the same undo step as the insertion.
      const moved = at ? glued(editor.doc, features, at) : null;
      if (moved) await editor.change(moved, true);
      // Not glued: the view takes in all the model (the module may stand away from what was in view). Its pieces are
      // selected, ready for Déplacer.
      if (!moved) viewport.setView("iso");
      viewport.clearSelection();
      for (const id of viewport.displayedBodies) if (features.includes(featureOfBody(id))) viewport.toggleInSelection("body", id);
      editor.notify(
        moved
          ? `« ${row.name} » inséré contre la face choisie ; ses pièces sont sélectionnées pour le déplacer.`
          : at
            ? `« ${row.name} » inséré à l'endroit où il était enregistré : la face choisie n'est pas droite (de face, de côté ou de dessus).`
            : `« ${row.name} » inséré à l'endroit où il était enregistré ; ses pièces sont sélectionnées pour le déplacer. Choisissez d'abord une face d'un meuble pour l'y coller.`,
        "success",
      );
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const remove = async (row: ModuleRow) => {
    if (!window.confirm(`Supprimer « ${row.name} » de la bibliothèque ? Les projets où il a été inséré ne changent pas.`)) return;
    try {
      await call(`${URL}${row.id}/`, { method: "DELETE" });
      await load();
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const render = () => {
    if (!panel) return;
    const count = chosen().length;
    const name = el("input", { type: "text", maxlength: "120", placeholder: "Nom du module (Caisson bas 600…)", class: "h-8 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Nom du module" });
    const keep = el("button", { type: "button", class: BUTTON }, "Enregistrer");
    keep.disabled = count === 0;
    keep.addEventListener("click", () => {
      const text = name.value.trim();
      if (!text) return name.focus();
      void save(text);
    });
    const cards = modules.map((m) => {
      const put = el("button", { type: "button", class: BUTTON }, "Insérer");
      put.addEventListener("click", () => void insert(m));
      const drop = el("button", { type: "button", class: `${BUTTON} text-red-600`, "aria-label": `Supprimer ${m.name}` }, "✕");
      drop.addEventListener("click", () => void remove(m));
      return el(
        "div",
        { class: "flex items-center gap-2 border border-gray-200 p-1 dark:border-gray-700" },
        m.thumbnail ? el("img", { src: m.thumbnail, alt: "", class: "h-12 w-16 shrink-0 object-contain bg-gray-50" }) : el("div", { class: "h-12 w-16 shrink-0 bg-gray-100 dark:bg-gray-800" }),
        el("span", { class: "min-w-0 flex-1 truncate font-medium", title: m.name }, m.name),
        put,
        drop,
      );
    });
    panel.body.replaceChildren(
      el("p", { class: "text-gray-600 dark:text-gray-300" }, count ? `${count} élément${count > 1 ? "s" : ""} sélectionné${count > 1 ? "s" : ""} : donnez-lui un nom pour l'enregistrer, avec tout ce dont il dépend.` : "Sélectionnez les corps d'un caisson, d'un tiroir ou d'une colonne pour l'enregistrer comme module."),
      el("div", { class: "flex gap-1" }, name, keep),
      ...(message ? [el("p", { class: "bg-emerald-50 px-2 py-1 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" }, message)] : []),
      el("h3", { class: "panel-title pt-1" }, `Mes modules (${modules.length})`),
      ...(cards.length ? cards : [el("p", { class: "text-gray-500" }, "Aucun module pour l'instant.")]),
    );
  };

  const load = async () => {
    try {
      modules = (await call<{ modules: ModuleRow[] }>(URL)).modules;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    render();
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    message = "";
    panel = floatingPanel(container, "Ma bibliothèque", () => {
      panel = null;
      button.setAttribute("aria-pressed", "false");
    }, true);
    button.setAttribute("aria-pressed", "true");
    render();
    void load();
  });
  // The count of the selection follows the clicks in the view.
  editor.afterRender(() => {
    if (panel && !panel.body.contains(document.activeElement)) render();
  });
}
