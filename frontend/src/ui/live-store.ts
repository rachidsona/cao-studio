/**
 * Enregistrer aussitôt : un réglage d'un panneau, une fois posé (un moment sans autre changement), est enregistré
 * dans le document, une fois par changement — la vue 3D montre chaque réglage sans attendre OK (comme Module ou la
 * Répartition qu'on modifie).
 */
export interface LiveStore {
  /** What is stored now (nothing to store until it changes). */
  reset(key: string): void;
  /** `key`: the settings as they are; `store` runs a moment later when they changed and stay so. */
  schedule(key: string, store: () => void): void;
  cancel(): void;
}

export function liveStore(delay = 400): LiveStore {
  let timer: number | undefined;
  let stored = "";
  return {
    reset: (key) => void (stored = key),
    schedule(key, store) {
      window.clearTimeout(timer);
      if (key === stored) return;
      timer = window.setTimeout(() => {
        stored = key;
        store();
      }, delay);
    },
    cancel: () => window.clearTimeout(timer),
  };
}
