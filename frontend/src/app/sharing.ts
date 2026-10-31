/**
 * Lien client et commentaires, côté atelier. « Partager » fige le modèle affiché en GLB (en mètres, Y vers le haut,
 * posé sur le sol et centré : prêt pour la réalité augmentée), avec un résumé (dimensions, pièces, prix si on veut),
 * et donne un lien public à envoyer au client ; un lien se révoque d'un clic. « Commentaires » liste ce que les
 * clients ont écrit (avec le point du meuble visé, montré dans la vue), permet de répondre et de marquer traité.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { bodyInfo, materialById } from "../document/materials";
import { qrSvg } from "../io/qr";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { quoteTotal } from "./workshop-documents";
import { escapeHtml, floatingPanel, openModal } from "./workshop-ui";

type Vec3 = [number, number, number];

interface Share {
  token: string;
  url: string;
  title: string;
  created_at: string;
  revoked: boolean;
  comments: number;
}

interface Comment {
  id: number;
  author: string;
  body: string;
  position: Vec3 | null;
  from_owner: boolean;
  resolved: boolean;
  created_at: string;
  link: string | null;
  token: string | null;
}

const BUTTON = "h-8 shrink-0 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const INPUT = "h-8 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";

const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "");
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const json = typeof init.body === "string";
  const response = await fetch(url, { ...init, credentials: "same-origin", headers: { Accept: "application/json", "X-CSRFToken": csrf(), ...(json ? { "Content-Type": "application/json" } : {}) } });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Erreur serveur (${response.status}).`);
  return payload;
}

/** The displayed furniture (not the room) as a GLB, and where its millimetres went. */
export async function modelGlb(viewport: Viewport, editor: Editor): Promise<{ glb: ArrayBuffer; size: Vec3; offset: Vec3; parts: number }> {
  const inner = new THREE.Group();
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  let parts = 0;
  for (const id of viewport.displayedBodies) {
    const info = bodyInfo(editor.doc, id);
    const mesh = viewport.bodyMesh(id);
    if (!mesh || info.room) continue;
    parts++;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    const color = materialById(info.material)?.color ?? "#d8c3a0";
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 }));
    inner.add(new THREE.Mesh(geometry, materials.get(color)));
    mesh.metrics.bbox.forEach((corner, k) => corner.forEach((v, i) => (k ? (hi[i] = Math.max(hi[i]!, v)) : (lo[i] = Math.min(lo[i]!, v)))));
  }
  if (!parts) throw new Error("Aucun meuble à partager.");
  const offset: Vec3 = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, lo[2]!];
  inner.position.set(-offset[0], -offset[1], -offset[2]);
  // Millimetres, Z up → metres, Y up (glTF).
  const root = new THREE.Group();
  root.add(inner);
  root.scale.setScalar(0.001);
  root.rotation.x = -Math.PI / 2;
  const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;
  inner.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  for (const m of materials.values()) m.dispose();
  return { glb, size: [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!], offset, parts };
}

export function bindSharing(root: HTMLElement, viewport: Viewport, editor: Editor, apiUrl: string, projectName: string): void {
  const sharesUrl = `${apiUrl}shares/`;
  const commentsUrl = `${apiUrl}comments/`;
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const commentsButton = root.querySelector<HTMLButtonElement>('[data-workshop="comments"]');

  // ---- share ---------------------------------------------------------------------------------
  const share = async (): Promise<void> => {
    const list = el("div", { class: "space-y-2" });
    const title = el("input", { type: "text", class: `${INPUT} w-full`, value: projectName, maxlength: "120", "aria-label": "Titre du lien" });
    title.addEventListener("keydown", (e) => e.stopPropagation());
    const price = el("input", { type: "checkbox" });
    const allow = el("input", { type: "checkbox", checked: true });
    const refresh = async () => {
      const { shares } = await call<{ shares: Share[] }>(sharesUrl);
      list.replaceChildren(
        ...(shares.length
          ? shares.map((s) => {
              const url = el("input", { type: "text", readonly: true, class: INPUT, value: s.url, "aria-label": `Adresse du lien ${s.title}` });
              const copy = el("button", { type: "button", class: BUTTON }, "Copier");
              copy.addEventListener("click", () => void navigator.clipboard?.writeText(s.url).then(() => editor.notify("Lien copié.", "success")));
              const qr = el("button", { type: "button", class: BUTTON, title: "QR code du lien" }, "QR");
              const code = el("div", { class: "hidden size-28 bg-white p-1" });
              qr.addEventListener("click", () => {
                code.innerHTML = qrSvg(s.url);
                code.classList.toggle("hidden");
              });
              const revoke = el("button", { type: "button", class: BUTTON, disabled: s.revoked }, s.revoked ? "Révoqué" : "Révoquer");
              revoke.addEventListener("click", () => void call(`${sharesUrl}${s.token}/`, { method: "DELETE" }).then(refresh, (e: Error) => editor.notify(e.message, "error")));
              return el(
                "div",
                { class: `space-y-1 border border-gray-200 p-2 dark:border-gray-700 ${s.revoked ? "opacity-50" : ""}` },
                el("p", { class: "text-xs" }, el("b", {}, s.title), ` · ${when(s.created_at)} · ${s.comments} commentaire(s)`),
                el("div", { class: "flex items-center gap-1" }, url, copy, qr, revoke),
                code,
              );
            })
          : [el("p", { class: "text-xs text-gray-500" }, "Aucun lien pour l'instant.")]),
      );
    };
    const create = el("button", { type: "button", class: "h-9 btn-accent px-3 text-sm font-medium" }, "Créer un lien client");
    create.addEventListener("click", async () => {
      create.disabled = true;
      try {
        const { glb, size, offset, parts } = await modelGlb(viewport, editor);
        const form = new FormData();
        form.append("model", new Blob([glb], { type: "model/gltf-binary" }), "meuble.glb");
        form.append("title", title.value.trim() || projectName);
        const total = price.checked ? quoteTotal(viewport, editor) : null;
        form.append("summary", JSON.stringify({ size, offset, parts, unit: editor.unit, date: new Date().toISOString(), ...(total !== null ? { price: total } : {}) }));
        form.append("allow_comments", allow.checked ? "1" : "0");
        const made = await call<Share>(sharesUrl, { method: "POST", body: form });
        await navigator.clipboard?.writeText(made.url).catch(() => undefined);
        editor.notify("Lien client créé (copié dans le presse-papiers).", "success");
        await refresh();
      } catch (e) {
        editor.notify(e instanceof Error ? e.message : String(e), "error");
      } finally {
        create.disabled = false;
      }
    });
    const content = el(
      "div",
      { class: "space-y-3 text-sm" },
      el("p", { class: "text-xs text-gray-600 dark:text-gray-300" }, "Le client voit le meuble en 3D, le pose chez lui en réalité augmentée depuis son téléphone et laisse des commentaires, sans compte. Le lien montre le modèle tel qu'il est maintenant : créez-en un nouveau après des changements."),
      el("div", { class: "space-y-2 border border-gray-200 p-3 dark:border-gray-700" }, title,
        el("label", { class: "flex items-center gap-2 text-xs" }, price, "Afficher le prix TTC du devis"),
        el("label", { class: "flex items-center gap-2 text-xs" }, allow, "Permettre les commentaires"), create),
      el("h3", { class: "text-xs font-semibold tracking-wide text-gray-500 uppercase" }, "Liens"),
      list,
    );
    const close = openModal("Lien client", content, [{ label: "Fermer", run: () => close() }]);
    await refresh().catch((e: Error) => editor.notify(e.message, "error"));
  };
  root.querySelector('[data-workshop="share"]')?.addEventListener("click", () => void share());

  // ---- comments -------------------------------------------------------------------------------
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let marker: THREE.Mesh | null = null;
  const unmark = () => {
    if (!marker) return;
    viewport.scene.remove(marker);
    marker.geometry.dispose();
    (marker.material as THREE.Material).dispose();
    marker = null;
  };
  const show = (p: Vec3) => {
    unmark();
    marker = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf97316, depthTest: false }));
    marker.renderOrder = 10;
    marker.position.set(...p);
    viewport.scene.add(marker);
    viewport.fitBox(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...p), new THREE.Vector3(600, 600, 600)));
  };
  const count = (comments: Comment[]) => {
    const open = comments.filter((c) => !c.resolved && !c.from_owner).length;
    commentsButton?.setAttribute("title", `Commentaires des clients${open ? ` : ${open} à traiter` : ""}`);
    commentsButton?.classList.toggle("ring-2", open > 0);
    commentsButton?.classList.toggle("ring-orange-400", open > 0);
  };
  const render = async () => {
    if (!panel) return;
    const { comments } = await call<{ comments: Comment[] }>(commentsUrl);
    count(comments);
    const rows = comments.map((c) => {
      const done = el("input", { type: "checkbox", checked: c.resolved, title: "Traité", "aria-label": `Commentaire de ${c.author} traité` });
      done.addEventListener("change", () => void call(`${commentsUrl}${c.id}/`, { method: "PATCH", body: JSON.stringify({ resolved: done.checked }) }).then(render, (e: Error) => editor.notify(e.message, "error")));
      const see = c.position ? el("button", { type: "button", class: BUTTON }, "Voir") : null;
      see?.addEventListener("click", () => show(c.position!));
      const head = el("p", { class: "text-[11px] text-gray-500" }, el("b", {}, c.author), `${c.from_owner ? " (vous)" : ""} · ${when(c.created_at)}${c.link ? ` · ${c.link}` : ""}`);
      const body = el("p", { class: "whitespace-pre-wrap" });
      body.innerHTML = escapeHtml(c.body);
      return el("div", { class: `space-y-1 border p-2 ${c.resolved ? "border-gray-200 opacity-60 dark:border-gray-700" : c.from_owner ? "border-sky-200 dark:border-sky-900" : "border-orange-300 dark:border-orange-800"}` }, head, body, el("div", { class: "flex items-center gap-2" }, c.from_owner ? null : el("label", { class: "flex items-center gap-1 text-[11px]" }, done, "Traité"), see));
    });
    const last = [...comments].reverse().find((c) => c.token);
    const reply = el("textarea", { class: "w-full border border-gray-300 bg-white p-2 text-xs dark:border-gray-600 dark:bg-gray-900", rows: "2", placeholder: last ? `Répondre (sur le lien « ${last.link} »)` : "Écrire une note", "aria-label": "Réponse" });
    reply.addEventListener("keydown", (e) => e.stopPropagation());
    const send = el("button", { type: "button", class: BUTTON }, "Envoyer");
    send.addEventListener("click", () => {
      if (!reply.value.trim()) return;
      void call(commentsUrl, { method: "POST", body: JSON.stringify({ body: reply.value, token: last?.token ?? null }) }).then(render, (e: Error) => editor.notify(e.message, "error"));
    });
    panel.body.replaceChildren(...(rows.length ? rows : [el("p", { class: "text-gray-500" }, "Aucun commentaire. Créez un lien client (Partager) et envoyez-le.")]), reply, el("div", { class: "flex justify-end" }, send));
  };
  commentsButton?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(container, "Commentaires", () => {
      panel = null;
      unmark();
      commentsButton.setAttribute("aria-pressed", "false");
    });
    commentsButton.setAttribute("aria-pressed", "true");
    void render().catch((e: Error) => editor.notify(e.message, "error"));
  });
  // The button tells, from the start, whether clients wrote.
  void call<{ comments: Comment[] }>(commentsUrl).then(({ comments }) => count(comments), () => undefined);
}
