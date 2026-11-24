/**
 * Ce qu'on garde pour tous ses projets — « Mes caissons », « Mes modules », « Mes découpes », « Mes murs », les styles
 * de dressing, les fournisseurs, les tarifs du devis, les standards de l'atelier, l'étiquette, le G-code, les calques
 * DXF et les machines, les étiquettes de pièces, les matières du rendu, et la disposition de l'interface (colonnes
 * d'outils et leurs noms, colonne Sélection et vue, outils du ruban, raccourcis) — est gardé par le serveur (/api/kept/, apps/projects/kept.py)
 * et plus seulement par ce navigateur : il suit le compte sur un autre ordinateur, et ne se perd plus quand on vide
 * le navigateur. Le navigateur en garde une copie, que chaque partie de l'éditeur lit comme avant.
 * À l'ouverture, ce que le serveur a remplace la copie ; ce que le serveur n'a pas encore (gardé avant) lui est
 * envoyé ; chaque changement lui est envoyé un instant après. Sans serveur (hors ligne), tout reste dans le navigateur.
 */
export const KEPT_KEYS = new Set([
  "cao.kitchen-own-units",
  "cao.my-dressing-modules",
  "cao.my-cutouts",
  "cao.my-walls",
  "cao.dressing-styles",
  "cao.suppliers",
  "cao.quote-rates",
  "cao.workshop-standards",
  "cao.label-template",
  "cao.gcode",
  "cao.dxf-layers",
  "cao.dxf-machines",
  "cao.part-tags",
  "cao.render-materials",
  "cao.worktop-bars",
  // The interface as one has arranged it: the same in another browser or at another address of the server.
  "cao.tool-columns",
  "cao.side-tools",
  "cao.ribbon-hidden.model",
  "cao.ribbon-hidden.sketch",
  "cao.ribbon-order.model",
  "cao.ribbon-order.sketch",
  "cao.ribbon-groups-3",
  "cao.ribbon-shown",
  "cao.steps-shown",
  "cao.steps-ribbon",
  "cao.shortcuts",
]);

const URL = "/api/kept/";
const DELAY = 800;
/** The keys changed here and not yet taken by the server (a reload too soon after a change): this browser's is the newer. */
const PENDING = "cao.kept-pending";

/** Changed before the server answered: this browser's is the newer. */
const early = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let ready = false;
let started = false;

const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "");

/** The sends, one after the other (a database may take one write at a time). */
let queue: Promise<unknown> = Promise.resolve();

/** One copy sent; refused or lost, tried again a little later (twice at most). */
async function put(key: string, read: (key: string) => string | null, tries = 3): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const response = await fetch(`${URL}${encodeURIComponent(key)}/`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRFToken": csrf() },
        // The copy as it is when sent: a later change is not lost.
        body: JSON.stringify({ value: read(key) }),
      });
      if (response.ok || (response.status >= 400 && response.status < 500)) return pending(key, false);
    } catch {
      // Offline for now.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
  }
}

let getRaw: ((key: string) => string | null) | null = null;
let setRaw: ((key: string, value: string) => void) | null = null;

/** The keys waiting to be sent, kept in this browser. */
function pendingKeys(): Set<string> {
  try {
    const raw: unknown = JSON.parse(getRaw?.(PENDING) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

/** This key marked as waiting to be sent, or as sent. */
function pending(key: string, waiting: boolean): void {
  const keys = pendingKeys();
  if (waiting === keys.has(key)) return;
  if (waiting) keys.add(key);
  else keys.delete(key);
  try {
    setRaw?.(PENDING, JSON.stringify([...keys]));
  } catch {
    // Not remembered: the server's copy wins at the next visit.
  }
}

/** This key's copy sent to the server a moment later (the last of quick changes only). */
function send(key: string, read: (key: string) => string | null): void {
  pending(key, true);
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    queue = queue.then(() => put(key, read));
  }, DELAY));
}

/** Starts keeping: writes of the kept keys go to the server too; then the server's copy is taken. */
export async function startKeptData(): Promise<void> {
  if (started) return;
  started = true;
  let local: Storage;
  try {
    local = window.localStorage;
  } catch {
    return;
  }
  const proto = Storage.prototype;
  const [setItem, getItem, removeItem] = [proto.setItem, proto.getItem, proto.removeItem];
  const read = (key: string) => getItem.call(local, key);
  getRaw = read;
  setRaw = (key, value) => setItem.call(local, key, value);
  // Changed before the last visit ended, not sent: this browser's copy is the newer.
  for (const key of pendingKeys()) if (KEPT_KEYS.has(key)) early.add(key);
  const changed = (key: string) => (ready ? send(key, read) : early.add(key));
  proto.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value);
    if (this === local && KEPT_KEYS.has(key)) changed(key);
  };
  proto.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key);
    if (this === local && KEPT_KEYS.has(key)) changed(key);
  };
  let data: Record<string, string> | null = null;
  try {
    const response = await fetch(URL, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (response.ok) data = ((await response.json()) as { data?: Record<string, string> }).data ?? null;
  } catch {
    // Offline: the browser's copy only, as before.
  }
  ready = true;
  if (!data) return;
  for (const key of KEPT_KEYS) {
    const kept = data[key];
    if (early.has(key)) send(key, read);
    else if (typeof kept === "string") {
      try {
        setItem.call(local, key, kept);
      } catch {
        // Too big for this browser: the server keeps it.
      }
    } else if (read(key) !== null) send(key, read);
  }
  early.clear();
}
