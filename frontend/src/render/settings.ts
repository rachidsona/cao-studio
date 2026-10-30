/**
 * Réglages du mode Rendu (comme les « Paramètres de scène » de Fusion) : environnement et éclairage, fond, sol,
 * caméra, qualité, finitions des matières et format des images. Gardés dans le navigateur ; relus et vérifiés champ
 * par champ, car ce qui vient du stockage n'est pas sûr.
 */
import type { Finish } from "../appearance/three-materials";

export type { Finish };

export type EnvironmentId = "studio-light" | "studio-dark" | "interior" | "outdoor" | "overcast";
export type Background = "environment" | "color" | "editor";
export type Ground = "shadows" | "studio" | "wood" | "none";
export type ToneMap = "aces" | "agx" | "neutral";
export type ImageFormat = "view" | "hd" | "4k" | "square" | "a4";

export interface RenderSettings {
  environment: EnvironmentId;
  /** Multiplies the light of the environment. */
  brightness: number;
  /** Turns the environment around the vertical (degrees), as in KeyShot. */
  rotation: number;
  /** Time of day of the sun (outdoor), 6 to 20 h, as in Enscape. */
  hour: number;
  background: Background;
  backgroundColor: string;
  /** Blur of the environment seen behind the model (0 sharp, 1 very blurred). */
  backgroundBlur: number;
  ground: Ground;
  groundColor: string;
  /** Reflections of the ground (0 matte, 1 mirror-like). */
  reflections: number;
  /** Focal length (mm, 24×36 film). */
  focal: number;
  /** Exposure compensation (EV). */
  exposure: number;
  toneMapping: ToneMap;
  depthOfField: boolean;
  fStop: number;
  /** Distance of the sharp plane (mm); null: the centre of the view. */
  focusDistance: number | null;
  /** Samples after which the view stops refining. */
  samples: number;
  bounces: number;
  /** Finish chosen per appearance id (lacquered, satin…); "auto" keeps the appearance's own. */
  finishes: Record<string, Finish>;
  imageFormat: ImageFormat;
  imageSamples: number;
}

export const ENVIRONMENTS: { id: EnvironmentId; name: string }[] = [
  { id: "studio-light", name: "Studio clair" },
  { id: "studio-dark", name: "Studio sombre" },
  { id: "interior", name: "Intérieur (fenêtre)" },
  { id: "outdoor", name: "Extérieur (ciel et soleil)" },
  { id: "overcast", name: "Ciel couvert" },
];

export const FINISHES: { id: Finish; name: string }[] = [
  { id: "auto", name: "Celle de la matière" },
  { id: "matte", name: "Mat" },
  { id: "satin", name: "Satiné" },
  { id: "gloss", name: "Brillant" },
  { id: "lacquer", name: "Laqué" },
];

export const IMAGE_FORMATS: { id: ImageFormat; name: string; size: [number, number] | null }[] = [
  { id: "view", name: "Vue actuelle", size: null },
  { id: "hd", name: "HD 1920 × 1080", size: [1920, 1080] },
  { id: "4k", name: "4K 3840 × 2160", size: [3840, 2160] },
  { id: "square", name: "Carré 2048 × 2048", size: [2048, 2048] },
  { id: "a4", name: "A4 paysage 300 dpi", size: [3508, 2480] },
];

export const DEFAULT_SETTINGS: RenderSettings = {
  environment: "studio-light",
  brightness: 1,
  rotation: 0,
  hour: 15,
  background: "environment",
  backgroundColor: "#e8eaed",
  backgroundBlur: 0.25,
  ground: "shadows",
  groundColor: "#d9dadc",
  reflections: 0.15,
  focal: 35,
  exposure: 0,
  toneMapping: "aces",
  depthOfField: false,
  fStop: 5.6,
  focusDistance: null,
  samples: 400,
  bounces: 6,
  finishes: {},
  imageFormat: "hd",
  imageSamples: 600,
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
const number = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const color = (value: unknown, fallback: string): string => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

/** Settings read back from storage (or anything else): every field checked, missing or wrong ones take the default. */
export function normalizeSettings(raw: unknown): RenderSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const finishes: Record<string, Finish> = {};
  if (r.finishes && typeof r.finishes === "object") {
    for (const [id, finish] of Object.entries(r.finishes as Record<string, unknown>)) {
      if (/^[a-z0-9-]{1,40}$/.test(id)) finishes[id] = oneOf(finish, FINISHES.map((f) => f.id), "auto");
    }
  }
  return {
    environment: oneOf(r.environment, ENVIRONMENTS.map((e) => e.id), d.environment),
    brightness: number(r.brightness, 0.1, 4, d.brightness),
    rotation: number(r.rotation, 0, 360, d.rotation),
    hour: number(r.hour, 6, 20, d.hour),
    background: oneOf(r.background, ["environment", "color", "editor"] as const, d.background),
    backgroundColor: color(r.backgroundColor, d.backgroundColor),
    backgroundBlur: number(r.backgroundBlur, 0, 1, d.backgroundBlur),
    ground: oneOf(r.ground, ["shadows", "studio", "wood", "none"] as const, d.ground),
    groundColor: color(r.groundColor, d.groundColor),
    reflections: number(r.reflections, 0, 1, d.reflections),
    focal: number(r.focal, 12, 300, d.focal),
    exposure: number(r.exposure, -4, 4, d.exposure),
    toneMapping: oneOf(r.toneMapping, ["aces", "agx", "neutral"] as const, d.toneMapping),
    depthOfField: typeof r.depthOfField === "boolean" ? r.depthOfField : d.depthOfField,
    fStop: number(r.fStop, 0.7, 32, d.fStop),
    focusDistance: r.focusDistance === null ? null : typeof r.focusDistance === "number" && r.focusDistance > 0 ? Math.min(r.focusDistance, 1e7) : d.focusDistance,
    samples: number(r.samples, 16, 5000, d.samples),
    bounces: Math.round(number(r.bounces, 2, 16, d.bounces)),
    finishes,
    imageFormat: oneOf(r.imageFormat, IMAGE_FORMATS.map((f) => f.id), d.imageFormat),
    imageSamples: number(r.imageSamples, 16, 5000, d.imageSamples),
  };
}

const KEY = "cao.render.settings";

export function loadSettings(): RenderSettings {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: RenderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* private mode: the settings last for this page only */
  }
}

/** Vertical field of view (degrees) of a lens on 24×36 film. */
export const focalToFov = (focal: number): number => (2 * Math.atan(12 / focal) * 180) / Math.PI;

/**
 * Where the sun is at an hour of the day (northern hemisphere, mid-latitudes): rising in the east at 6 h, highest
 * in the south at 13 h, setting in the west at 20 h. Degrees: elevation above the horizon, azimuth from the north
 * (+Y) turning towards the east (+X).
 */
export function sunPosition(hour: number): { elevation: number; azimuth: number } {
  const t = (Math.min(20, Math.max(6, hour)) - 6) / 14;
  return { elevation: 58 * Math.sin(Math.PI * t), azimuth: 90 + 180 * t };
}
