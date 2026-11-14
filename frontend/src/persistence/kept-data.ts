/**
 * Ce qu'on garde pour tous ses projets — « Mes caissons », « Mes modules », « Mes découpes », « Mes murs », les styles
 * de dressing, les fournisseurs, les tarifs du devis, les standards de l'atelier, l'étiquette, le G-code et les calques
 * DXF, les étiquettes de pièces, les matières du rendu — est gardé par le serveur (/api/kept/, apps/projects/kept.py)
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
  "cao.part-tags",
  "cao.render-materials",
  "cao.worktop-bars",
]);

const URL = "/api/kept/";
const DELAY = 800;

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
      if (response.ok || (response.status >= 400 && response.status < 500)) return;
    } catch {
      // Offline for now.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
  }
}

/** This key's copy sent to the server a moment later (the last of quick changes only). */
function send(key: string, read: (key: string) => string | null): void {
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
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }
  const proto = Storage.prototype;
  const [setItem, getItem, removeItem] = [proto.setItem, proto.getItem, proto.removeItem];
  const read = (key: string) => getItem.call(storage, key);
  const changed = (key: string) => (ready ? send(key, read) : early.add(key));
  proto.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value);
    if (this === storage && KEPT_KEYS.has(key)) changed(key);
  };
  proto.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key);
    if (this === storage && KEPT_KEYS.has(key)) changed(key);
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
        setItem.call(storage, key, kept);
      } catch {
        // Too big for this browser: the server keeps it.
      }
    } else if (read(key) !== null) send(key, read);
  }
  early.clear();
}
