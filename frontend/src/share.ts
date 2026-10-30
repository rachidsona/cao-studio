/**
 * Page du lien client : le meuble en 3D (le modèle GLB figé au partage, en mètres, Y vers le haut), qu'on tourne au
 * doigt ; la réalité augmentée pour le voir chez soi (Scene Viewer sur Android, Quick Look sur iPhone avec un USDZ
 * fait sur place) ; et les commentaires, attachés au besoin à un point du meuble (une pastille numérotée).
 * Les points sont échangés en millimètres dans le repère du modèle : `summary.offset` dit comment passer de l'un
 * à l'autre.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { qrSvg } from "./io/qr";

type Vec3 = [number, number, number];

interface ShareComment {
  id: number;
  author: string;
  body: string;
  position: Vec3 | null;
  from_owner: boolean;
  created_at: string;
}

interface ShareData {
  title: string;
  summary: { size?: Vec3; parts?: number; price?: number; offset?: Vec3; date?: string; unit?: "mm" | "cm" | "m" | "in" };
  modelUrl: string;
  commentsUrl: string;
  pageUrl: string;
  allowComments: boolean;
  comments: ShareComment[];
}

const data = JSON.parse(document.getElementById("share-data")?.textContent ?? "{}") as ShareData;
const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
const offset: Vec3 = data.summary.offset ?? [0, 0, 0];

/** Model millimetres (Z up) ↔ the GLB's metres (Y up, centred on the floor). */
const toScene = (p: Vec3) => new THREE.Vector3((p[0] - offset[0]) / 1000, (p[2] - offset[2]) / 1000, -(p[1] - offset[1]) / 1000);
const toModel = (v: THREE.Vector3): Vec3 => [v.x * 1000 + offset[0], -v.z * 1000 + offset[1], v.y * 1000 + offset[2]].map((c) => Math.round(c * 10) / 10) as Vec3;

const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "");
const dateText = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

function summary(): void {
  const s = data.summary;
  const rows: [string, string][] = [];
  if (s.size) {
    const unit = s.unit ?? "mm";
    const per = { mm: 1, cm: 10, m: 1000, in: 25.4 }[unit];
    const shown = s.size.map((v) => (v / per).toLocaleString("fr-FR", { maximumFractionDigits: unit === "mm" ? 0 : 1 }));
    rows.push(["Dimensions", `${shown.join(" × ")} ${unit === "in" ? "po" : unit}`]);
  }
  if (s.parts) rows.push(["Pièces", String(s.parts)]);
  if (typeof s.price === "number") rows.push(["Prix indicatif", s.price.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) + " TTC"]);
  if (s.date) rows.push(["Version du", new Date(s.date).toLocaleDateString("fr-FR")]);
  const dl = $<HTMLDListElement>("[data-share-summary]")!;
  dl.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement("dt");
    dt.className = "text-gray-500";
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.className = "font-medium";
    dd.textContent = v;
    return [el("div", dt, dd)];
  }));
  dl.hidden = rows.length === 0;
}

function el(tag: string, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  node.append(...children);
  return node;
}

// ---- viewer -----------------------------------------------------------------------------------

const host = $<HTMLDivElement>("[data-share-viewer]")!;
const status = $<HTMLParagraphElement>("[data-share-status]")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
host.prepend(renderer.domElement);
renderer.domElement.className = "block h-full w-full touch-none";
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
camera.position.set(2, 1.6, 2.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7c6a, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 4);
scene.add(sun);
let model: THREE.Object3D | null = null;
const markers = new Map<string, { at: THREE.Vector3; node: HTMLElement }>();

function resize(): void {
  const { clientWidth: w, clientHeight: h } = host;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  const { clientWidth: w, clientHeight: h } = host;
  for (const { at, node } of markers.values()) {
    const p = at.clone().project(camera);
    node.style.transform = `translate(${((p.x + 1) / 2) * w - 12}px, ${((1 - p.y) / 2) * h - 12}px)`;
    node.hidden = p.z > 1;
  }
});

function setMarker(key: string, position: Vec3 | null, label: string, pending = false): void {
  markers.get(key)?.node.remove();
  markers.delete(key);
  if (!position) return;
  const node = el("span", label);
  node.className = `pointer-events-none absolute left-0 top-0 flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow ${pending ? "bg-orange-500" : "bg-sky-600"}`;
  host.append(node);
  markers.set(key, { at: toScene(position), node });
}

new GLTFLoader().load(
  data.modelUrl,
  (gltf) => {
    model = gltf.scene;
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0.7, 0.5, 0.9).normalize().multiplyScalar(size * 1.3));
    camera.near = size / 100;
    camera.far = size * 20;
    camera.updateProjectionMatrix();
    status.remove();
    void setupAr(gltf.scene);
  },
  undefined,
  () => (status.textContent = "Le modèle n'a pas pu être chargé."),
);

// ---- augmented reality --------------------------------------------------------------------------

async function setupAr(object: THREE.Object3D): Promise<void> {
  const button = $<HTMLAnchorElement>("[data-share-ar]")!;
  const hint = $<HTMLParagraphElement>("[data-share-ar-hint]")!;
  const modelUrl = new URL(data.modelUrl, location.href).href;
  if (/android/i.test(navigator.userAgent)) {
    const fallback = encodeURIComponent(location.href);
    button.href = `intent://arvr.google.com/scene-viewer/1.2?file=${encodeURIComponent(modelUrl)}&mode=ar_preferred&title=${encodeURIComponent(data.title)}#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`;
    button.hidden = false;
    return;
  }
  if (document.createElement("a").relList.supports("ar")) {
    // Quick Look takes a USDZ, made here from the model; its link must hold an image.
    const usdz = await new USDZExporter().parseAsync(object);
    button.href = URL.createObjectURL(new Blob([usdz], { type: "model/vnd.usdz+zip" }));
    button.rel = "ar";
    button.prepend(Object.assign(document.createElement("img"), { src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", alt: "", width: 1, height: 1 }));
    button.hidden = false;
    return;
  }
  hint.innerHTML = `<span class="flex items-center gap-3"><span class="inline-block size-20 bg-white p-1">${qrSvg(data.pageUrl)}</span><span>Pour voir le meuble chez vous en réalité augmentée, ouvrez cette page sur votre téléphone (scannez le code).</span></span>`;
}

// ---- comments --------------------------------------------------------------------------------------

let comments = data.comments;
let pending: Vec3 | null = null;

function renderComments(): void {
  const list = $<HTMLOListElement>("[data-share-comments]")!;
  let n = 0;
  for (const key of [...markers.keys()]) if (key !== "pending") setMarker(key, null, "");
  const items = comments.map((c) => {
    const number = c.position ? ++n : 0;
    if (c.position) setMarker(`c${c.id}`, c.position, String(number));
    const head = el("div", el("b", c.author), c.from_owner ? " · atelier" : "", ` · ${dateText(c.created_at)}`, number ? ` · point ${number}` : "");
    head.className = "text-xs text-gray-500";
    const body = el("p", c.body);
    body.className = "whitespace-pre-wrap";
    const item = el("li", head, body);
    item.className = ` border p-2 ${c.from_owner ? "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950" : "border-gray-200 dark:border-gray-800"}`;
    return item;
  });
  list.replaceChildren(...(items.length ? items : [Object.assign(el("li", "Aucun commentaire pour l'instant."), { className: "text-gray-500" })]));
}

function setupForm(): void {
  const form = $<HTMLFormElement>("[data-share-form]")!;
  if (!data.allowComments) return;
  form.hidden = false;
  const error = $<HTMLParagraphElement>("[data-share-error]")!;
  const point = $<HTMLParagraphElement>("[data-share-point]")!;
  try {
    (form.elements.namedItem("author") as HTMLInputElement).value = localStorage.getItem("cao.share.author") ?? "";
  } catch {
    // The name is only remembered as a convenience.
  }
  // A tap (not a drag) on the model picks the point of the next message.
  let down: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || !model || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObject(model, true)[0];
    pending = hit ? toModel(hit.point) : null;
    setMarker("pending", pending, "＋", true);
    point.textContent = pending ? "Message attaché au point marqué en orange (touchez ailleurs pour le changer, dans le vide pour l'enlever)." : "Touchez le meuble pour attacher le message à un endroit précis (facultatif).";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const author = (form.elements.namedItem("author") as HTMLInputElement).value.trim();
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value.trim();
    if (!author || !body) return;
    try {
      const response = await fetch(data.commentsUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRFToken": csrf() },
        body: JSON.stringify({ author, body, position: pending }),
      });
      const payload = (await response.json().catch(() => ({}))) as ShareComment & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Erreur ${response.status}`);
      comments = [...comments, payload];
      (form.elements.namedItem("body") as HTMLTextAreaElement).value = "";
      pending = null;
      setMarker("pending", null, "");
      point.textContent = "Message envoyé. Touchez le meuble pour attacher le suivant à un endroit précis (facultatif).";
      try {
        localStorage.setItem("cao.share.author", author);
      } catch {
        // See above.
      }
      renderComments();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}

summary();
renderComments();
setupForm();
