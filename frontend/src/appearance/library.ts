/**
 * Bibliothèque d'apparences (comme celle de Fusion) : bois de différentes essences, mélaminés, verres, marbres et
 * pierres (Statuario, Calacatta Oro, Arabescato, Emperador, quartzite Taj Mahal…), plans en pierre frittée (les teintes
 * Dekton : Aura, Entzo, Laurent, Kelya, Sirius, Kreta…), métaux, laques et peintures (teintes RAL), plastiques, tissus et
 * cuirs, bétons. Chaque apparence décrit sa
 * surface (couleurs, motif calculé, rugosité, métal, vernis, transparence) ; les textures sont calculées
 * (appearance/textures.ts), sauf les bois en photo (static/textures/bois, CC0) et les images qu'on importe soi-même
 * (« Mes motifs », gardées avec le projet : appearance/custom.ts). Chaque essence de bois tire son veinage d'une de ces
 * photos : le fil droit d'un noyer tranché sur quartier, raccordé sans couture, dans ses propres couleurs. Une matière de l'atelier a son apparence par défaut.
 */

export type Pattern = "plain" | "wood" | "marble" | "veined" | "sintered" | "granite" | "terrazzo" | "concrete" | "fabric" | "leather" | "brushed" | "slate" | "cork";
export type CategoryId = "wood" | "melamine" | "glass" | "stone" | "sintered" | "metal" | "paint" | "plastic" | "light" | "textile" | "concrete" | "custom";

export interface Appearance {
  id: string;
  name: string;
  category: CategoryId;
  /** Base colour (sRGB hex). */
  color: string;
  /** Second colour of the motif: grain, veins, speckles, weave. */
  color2?: string;
  pattern: Pattern;
  roughness: number;
  metalness?: number;
  /** Varnish / lacquer layer over the surface (0…1) and its roughness. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** Glass and clear plastics: light goes through (0…1), with this refractive index. */
  transmission?: number;
  ior?: number;
  /** Light given off (LED strips and spots), in the render: its strength; the view only shows it lit. */
  emissive?: number;
  /** Velvet-like sheen of fabrics (0…1). */
  sheen?: number;
  /** Size of one tile of the motif (mm): along the grain (or u), across it. */
  tile?: [number, number];
  /** Relief of the motif (0 flat … 1 marked), drawn as a normal map. */
  relief?: number;
  /** The colour may be chosen (paints, lacquers, plastics). */
  paintable?: boolean;
  /** A photo of the surface (its URL): drawn instead of the computed motif, its relief taken from its shades. */
  image?: string;
  /**
   * A wood drawn in its own colours from the shades of a photo of real wood (its URL; the photo seamless, its grain
   * along its width): its rings, pores and knots, the dark of the photo in `color2`, the light in `color`.
   */
  grain?: string;
  /** Its grain photo is straight grain, made to tile with no seam (appearance/textures.ts, seamlessGrain). */
  straight?: boolean;
  /**
   * One photo over the whole board, never repeated (the library's woods: a panel in one piece, as a veneer leaf):
   * stretched to its length along the grain and to its width, however long it is. `tile` then only sizes the swatch.
   */
  whole?: boolean;
}

/** The sintered stones (Dekton…): veined like a marble, or even like a cement; matt unless said polished. */
const SINTERED: Appearance[] = [
  { id: "dekton-aura", name: "Dekton Aura (blanc, veines grises)", category: "sintered", color: "#f2f1ee", color2: "#8a8d91", pattern: "veined", roughness: 0.4, tile: [1800, 1800] },
  { id: "dekton-entzo", name: "Dekton Entzo (blanc, veines dorées)", category: "sintered", color: "#f4f1ea", color2: "#b48b4c", pattern: "veined", roughness: 0.3, clearcoat: 0.2, tile: [2000, 2000] },
  { id: "dekton-opera", name: "Dekton Opera (blanc, veines ocre)", category: "sintered", color: "#efe9df", color2: "#a8875c", pattern: "veined", roughness: 0.4, tile: [1800, 1800] },
  { id: "dekton-rem", name: "Dekton Rem (gris clair veiné)", category: "sintered", color: "#e8e6e2", color2: "#a7a7a6", pattern: "veined", roughness: 0.45, tile: [1600, 1600] },
  { id: "dekton-laurent", name: "Dekton Laurent (noir, veines dorées)", category: "sintered", color: "#1b1a1a", color2: "#b8925a", pattern: "veined", roughness: 0.35, tile: [1800, 1800] },
  { id: "dekton-zenith", name: "Dekton Zenith (blanc uni)", category: "sintered", color: "#f6f6f4", color2: "#e7e7e4", pattern: "sintered", roughness: 0.5, tile: [800, 800], relief: 0.04 },
  { id: "dekton-danae", name: "Dekton Danae (beige ciment)", category: "sintered", color: "#cfc6b8", color2: "#b2a795", pattern: "sintered", roughness: 0.6, tile: [800, 800], relief: 0.05 },
  { id: "dekton-kreta", name: "Dekton Kreta (gris béton)", category: "sintered", color: "#b5b3ae", color2: "#8f8c86", pattern: "sintered", roughness: 0.6, tile: [800, 800], relief: 0.05 },
  { id: "dekton-bergen", name: "Dekton Bergen (gris chaud)", category: "sintered", color: "#9a948b", color2: "#74706a", pattern: "sintered", roughness: 0.55, tile: [800, 800], relief: 0.05 },
  { id: "dekton-keon", name: "Dekton Keon (gris ciment foncé)", category: "sintered", color: "#8e8a84", color2: "#5f5c58", pattern: "sintered", roughness: 0.6, tile: [800, 800], relief: 0.05 },
  { id: "dekton-kelya", name: "Dekton Kelya (gris anthracite)", category: "sintered", color: "#2e2d2c", color2: "#474542", pattern: "sintered", roughness: 0.55, tile: [800, 800], relief: 0.04 },
  { id: "dekton-sirius", name: "Dekton Sirius (noir profond)", category: "sintered", color: "#121212", color2: "#2a2a2a", pattern: "sintered", roughness: 0.5, tile: [800, 800], relief: 0.04 },
  { id: "dekton-trilium", name: "Dekton Trilium (oxyde rouille)", category: "sintered", color: "#6b5a4c", color2: "#a0552c", pattern: "sintered", roughness: 0.6, tile: [800, 800], relief: 0.12 },
];

export const CATEGORIES: { id: CategoryId; name: string }[] = [
  { id: "wood", name: "Bois" },
  { id: "melamine", name: "Mélaminés et panneaux" },
  { id: "paint", name: "Laques et peintures" },
  { id: "glass", name: "Verres et miroirs" },
  { id: "stone", name: "Marbres et pierres" },
  { id: "sintered", name: "Dekton et céramiques frittées" },
  { id: "metal", name: "Métaux" },
  { id: "plastic", name: "Plastiques" },
  { id: "light", name: "Éclairage (LED)" },
  { id: "textile", name: "Tissus et cuirs" },
  { id: "concrete", name: "Bétons et sols" },
  { id: "custom", name: "Mes motifs (images importées)" },
];

/**
 * A tile of a wood's grain on the board (mm, along the grain then across): its photo's lines at their real spacing (the
 * photo of straight walnut grain is a metre wide).
 */
const WOOD_TILE: [number, number] = [1000, 1000];

/** The photo every wood takes its grain from: straight grain (fil, quarter cut), made to tile with no seam. */
const STRAIGHT_GRAIN = "/static/textures/bois/noyer-fil.jpg";

const wood = (id: string, name: string, color: string, color2: string, finish: "raw" | "oiled" | "varnished" = "oiled"): Appearance => ({
  id,
  name,
  category: "wood",
  color,
  color2,
  pattern: "wood",
  roughness: finish === "raw" ? 0.72 : finish === "oiled" ? 0.5 : 0.42,
  clearcoat: finish === "varnished" ? 0.6 : 0,
  clearcoatRoughness: 0.15,
  tile: WOOD_TILE,
  relief: finish === "raw" ? 0.35 : 0.15,
  grain: STRAIGHT_GRAIN,
  straight: true,
});

/**
 * A wood in photo (static/textures/bois, grain along the image's width): `color` is its mean shade, for its swatch
 * while it loads; `tile`, the size of the photo on the board (mm, along the grain then across).
 */
const photo = (id: string, name: string, file: string, color: string, finish: "oiled" | "varnished" = "oiled", tile: [number, number] = [1000, 1000]): Appearance => ({
  ...wood(id, name, color, color, finish),
  image: `/static/textures/bois/${file}.jpg`,
  tile,
  whole: true,
  relief: 0.2,
});

/** RAL colours most used in furniture, as satin lacquers. */
const RAL: [string, string, string][] = [
  ["9010", "Blanc pur", "#f1ede1"],
  ["9016", "Blanc signalisation", "#f1f0ea"],
  ["9001", "Blanc crème", "#e9e0d2"],
  ["1015", "Ivoire clair", "#e6d2b5"],
  ["1013", "Blanc perlé", "#e3d9c6"],
  ["7035", "Gris clair", "#c5c7c4"],
  ["7044", "Gris soie", "#b9b7a9"],
  ["7004", "Gris de sécurité", "#9b9b9b"],
  ["7039", "Gris quartz", "#6b665e"],
  ["7016", "Gris anthracite", "#383e42"],
  ["9005", "Noir foncé", "#0e0e10"],
  ["5011", "Bleu acier", "#1a2b3c"],
  ["5014", "Bleu pigeon", "#637d96"],
  ["5024", "Bleu pastel", "#5d9bbf"],
  ["6021", "Vert pâle (sauge)", "#89ac76"],
  ["6003", "Vert olive", "#424632"],
  ["6009", "Vert sapin", "#27352a"],
  ["1005", "Jaune miel (moutarde)", "#c89f04"],
  ["3015", "Rose clair", "#d8a0a6"],
  ["3009", "Rouge oxyde (brique)", "#6d342d"],
  ["3020", "Rouge signalisation", "#c1121c"],
  ["2001", "Orangé rouge (terracotta)", "#ba4827"],
  ["8017", "Brun chocolat", "#45322e"],
  ["1019", "Beige gris (taupe)", "#9e9287"],
];

export const APPEARANCES: Appearance[] = [
  // ---- Bois en photo ----
  photo("photo-oak-light", "Chêne clair (photo)", "chene-clair", "#b09066"),
  photo("photo-oak", "Chêne (photo)", "chene", "#7b634e"),
  photo("photo-walnut", "Noyer (photo)", "noyer", "#41342e", "varnished"),
  // Walnut veneers: quarter cut (fil, straight grain), and flat cut (ramage, the cathedral figure of a leaf).
  photo("photo-walnut-straight", "Noyer fil (photo)", "noyer-fil", "#967f6e", "varnished"),
  photo("photo-walnut-crown", "Noyer ramage (photo)", "noyer-ramage", "#a68579", "varnished", [600, 450]),
  photo("photo-wenge", "Wengé (photo)", "wenge", "#2f2017"),
  photo("photo-beech", "Hêtre (photo)", "hetre", "#ac8a6c"),
  photo("photo-birch", "Bouleau (photo)", "bouleau", "#ad8c62"),
  photo("photo-cherry", "Merisier (photo)", "merisier", "#b0733f", "varnished"),
  photo("photo-pine", "Pin noueux (photo)", "pin-noueux", "#b49d85"),
  // ---- Bois ----
  wood("wood-oak", "Chêne naturel huilé", "#c69c6d", "#8e6239"),
  wood("wood-oak-light", "Chêne blanchi", "#ddc8a8", "#a88e6c"),
  wood("wood-oak-smoked", "Chêne fumé", "#7b5a3e", "#4a3220"),
  wood("wood-oak-varnished", "Chêne verni", "#c08d58", "#7f5530", "varnished"),
  wood("wood-oak-raw", "Chêne brut", "#c9a77f", "#937049", "raw"),
  wood("wood-walnut", "Noyer", "#6b4a34", "#3d2618", "oiled"),
  wood("wood-walnut-american", "Noyer américain", "#5a3c2a", "#2e1c12", "varnished"),
  wood("wood-beech", "Hêtre", "#d9b38c", "#b98a5e", "oiled"),
  wood("wood-ash", "Frêne", "#dcc9a6", "#a8916b"),
  wood("wood-maple", "Érable", "#e6d3b3", "#c9ae86", "oiled"),
  wood("wood-cherry", "Merisier", "#a5603b", "#6f3a20", "varnished"),
  wood("wood-pine", "Pin", "#dfbe86", "#b07d3e", "raw"),
  wood("wood-teak", "Teck", "#a2703f", "#6a4422"),
  wood("wood-wenge", "Wengé", "#3b2a20", "#1b120c", "oiled"),
  wood("wood-mahogany", "Acajou", "#7c3a26", "#4a1d10", "varnished"),
  wood("wood-birch", "Bouleau", "#e3cba0", "#c2a272", "oiled"),
  wood("wood-bamboo", "Bambou", "#d8bb7c", "#a88a4c", "oiled"),
  wood("wood-zebrano", "Zebrano", "#d6b98b", "#4f3a26", "oiled"),

  // ---- Mélaminés et panneaux ----
  { id: "melamine-white", name: "Mélaminé blanc", category: "melamine", color: "#f1f1ef", pattern: "plain", roughness: 0.42 },
  { id: "melamine-pearl", name: "Mélaminé gris perle", category: "melamine", color: "#c9c9c4", pattern: "plain", roughness: 0.45 },
  { id: "melamine-anthracite", name: "Mélaminé anthracite", category: "melamine", color: "#3f4448", pattern: "plain", roughness: 0.45 },
  { id: "melamine-black", name: "Mélaminé noir", category: "melamine", color: "#1c1c1e", pattern: "plain", roughness: 0.45 },
  { ...wood("melamine-oak", "Mélaminé chêne", "#c9a26b", "#94703f"), category: "melamine", roughness: 0.5, relief: 0.05 },
  { ...wood("melamine-walnut", "Mélaminé noyer", "#7a5236", "#46301e", "oiled"), category: "melamine", roughness: 0.5, relief: 0.05 },
  { id: "mdf-raw", name: "MDF brut", category: "melamine", color: "#b8916a", color2: "#a37c56", pattern: "concrete", roughness: 0.88, tile: [400, 400], relief: 0.08 },
  { id: "hdf", name: "Panneau de fond (HDF)", category: "melamine", color: "#d9c3a0", color2: "#c6ad86", pattern: "concrete", roughness: 0.8, tile: [400, 400], relief: 0.05 },
  { ...wood("plywood-birch", "Contreplaqué bouleau", "#e2c99b", "#c09f6b", "raw"), category: "melamine" },
  { id: "osb", name: "OSB", category: "melamine", color: "#c9a46a", color2: "#8c6a3a", pattern: "terrazzo", roughness: 0.8, tile: [300, 300], relief: 0.3 },

  // ---- Laques et peintures ----
  { id: "lacquer-white-gloss", name: "Laque blanche brillante", category: "paint", color: "#f6f6f4", pattern: "plain", roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, paintable: true },
  { id: "lacquer-black-gloss", name: "Laque noire brillante", category: "paint", color: "#0d0d0f", pattern: "plain", roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, paintable: true },
  { id: "lacquer-satin", name: "Laque satinée (couleur au choix)", category: "paint", color: "#d9d4ca", pattern: "plain", roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.2, paintable: true },
  { id: "paint-matte", name: "Peinture mate (couleur au choix)", category: "paint", color: "#e8e4dc", pattern: "plain", roughness: 0.9, paintable: true },
  ...RAL.map(([code, name, color]): Appearance => ({ id: `ral-${code}`, name: `${name} — RAL ${code}`, category: "paint", color, pattern: "plain", roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.2, paintable: true })),

  // ---- Verres et miroirs ----
  { id: "glass-clear", name: "Verre clair", category: "glass", color: "#e8f1ee", pattern: "plain", roughness: 0, transmission: 1, ior: 1.52 },
  { id: "glass-extra-clear", name: "Verre extra-clair", category: "glass", color: "#ffffff", pattern: "plain", roughness: 0, transmission: 1, ior: 1.52 },
  { id: "glass-frosted", name: "Verre dépoli (satiné)", category: "glass", color: "#eef3f2", pattern: "plain", roughness: 0.35, transmission: 1, ior: 1.52 },
  { id: "glass-smoked", name: "Verre fumé gris", category: "glass", color: "#7a7f82", pattern: "plain", roughness: 0, transmission: 0.9, ior: 1.52 },
  { id: "glass-bronze", name: "Verre bronze", category: "glass", color: "#a9865e", pattern: "plain", roughness: 0, transmission: 0.9, ior: 1.52 },
  { id: "glass-green", name: "Verre teinté vert", category: "glass", color: "#9fc5ad", pattern: "plain", roughness: 0, transmission: 0.95, ior: 1.52 },
  { id: "glass-lacquered-white", name: "Verre laqué blanc", category: "glass", color: "#f2f2ef", pattern: "plain", roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0, paintable: true },
  { id: "glass-lacquered-black", name: "Verre laqué noir", category: "glass", color: "#101012", pattern: "plain", roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0, paintable: true },
  { id: "mirror", name: "Miroir", category: "glass", color: "#f4f6f7", pattern: "plain", roughness: 0, metalness: 1 },

  // ---- Marbres et pierres ----
  { id: "marble-carrara", name: "Marbre de Carrare", category: "stone", color: "#ecebe8", color2: "#8e9196", pattern: "marble", roughness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [1400, 1400] },
  { id: "marble-calacatta", name: "Marbre Calacatta", category: "stone", color: "#f3efe8", color2: "#b39062", pattern: "marble", roughness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [1600, 1600] },
  { id: "marble-marquina", name: "Marbre noir Marquina", category: "stone", color: "#17171a", color2: "#d9d6cf", pattern: "marble", roughness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.04, tile: [1200, 1200] },
  { id: "marble-green", name: "Marbre vert", category: "stone", color: "#1f3a30", color2: "#a9c2b2", pattern: "marble", roughness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [1000, 1000] },
  { id: "marble-pink", name: "Marbre rose", category: "stone", color: "#d9b8aa", color2: "#f3e6df", pattern: "marble", roughness: 0.14, clearcoat: 0.4, clearcoatRoughness: 0.06, tile: [1200, 1200] },
  { id: "marble-statuario", name: "Marbre Statuario (grandes veines grises)", category: "stone", color: "#f4f3f0", color2: "#6f7277", pattern: "veined", roughness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [1800, 1800] },
  { id: "marble-calacatta-oro", name: "Marbre Calacatta Oro (veines dorées)", category: "stone", color: "#f5f1e9", color2: "#b08a4e", pattern: "veined", roughness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [2000, 2000] },
  { id: "marble-arabescato", name: "Marbre Arabescato", category: "stone", color: "#f1f0ed", color2: "#4d4f53", pattern: "marble", roughness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [900, 900] },
  { id: "marble-emperador-dark", name: "Marbre Emperador foncé", category: "stone", color: "#4a3427", color2: "#cdb08a", pattern: "marble", roughness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [900, 900] },
  { id: "marble-emperador-light", name: "Marbre Emperador clair", category: "stone", color: "#b49a7c", color2: "#e8dcc6", pattern: "marble", roughness: 0.12, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [900, 900] },
  { id: "quartzite-taj-mahal", name: "Quartzite Taj Mahal", category: "stone", color: "#e9e0d0", color2: "#c4a983", pattern: "veined", roughness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.06, tile: [2200, 2200] },
  { id: "travertine", name: "Travertin", category: "stone", color: "#d8c5a6", color2: "#b49b76", pattern: "marble", roughness: 0.5, tile: [900, 900], relief: 0.25 },
  { id: "granite-black", name: "Granit noir", category: "stone", color: "#1d1d1f", color2: "#6a6a6e", pattern: "granite", roughness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.05, tile: [300, 300] },
  { id: "granite-grey", name: "Granit gris moucheté", category: "stone", color: "#8f8f8f", color2: "#2b2b2d", pattern: "granite", roughness: 0.2, clearcoat: 0.3, tile: [300, 300] },
  { id: "quartz-white", name: "Quartz blanc", category: "stone", color: "#ecebe7", color2: "#b9b6ae", pattern: "granite", roughness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.04, tile: [200, 200] },
  { id: "terrazzo", name: "Terrazzo", category: "stone", color: "#e6e1d8", color2: "#7e7466", pattern: "terrazzo", roughness: 0.25, clearcoat: 0.3, tile: [500, 500] },
  { id: "slate", name: "Ardoise", category: "stone", color: "#3b4045", color2: "#2a2e32", pattern: "slate", roughness: 0.65, tile: [600, 600], relief: 0.45 },

  // ---- Dekton et céramiques frittées (teintes de la gamme Dekton ; plans de travail, crédences, façades) ----
  ...SINTERED,

  // ---- Métaux ----
  { id: "steel-brushed", name: "Inox brossé", category: "metal", color: "#c4c6c8", color2: "#a9abad", pattern: "brushed", roughness: 0.32, metalness: 1, tile: [200, 200], relief: 0.02 },
  { id: "aluminium-brushed", name: "Aluminium brossé", category: "metal", color: "#d4d6d8", color2: "#b8babc", pattern: "brushed", roughness: 0.3, metalness: 1, tile: [200, 200], relief: 0.02 },
  { id: "aluminium-black", name: "Aluminium anodisé noir", category: "metal", color: "#26272a", pattern: "plain", roughness: 0.4, metalness: 1 },
  { id: "chrome", name: "Chrome poli", category: "metal", color: "#eceeef", pattern: "plain", roughness: 0.03, metalness: 1 },
  { id: "brass-brushed", name: "Laiton brossé", category: "metal", color: "#c9a560", color2: "#a8864a", pattern: "brushed", roughness: 0.3, metalness: 1, tile: [200, 200], relief: 0.02 },
  { id: "gold", name: "Or poli", category: "metal", color: "#f2c45a", pattern: "plain", roughness: 0.08, metalness: 1 },
  { id: "copper", name: "Cuivre", category: "metal", color: "#d08a63", pattern: "plain", roughness: 0.2, metalness: 1 },
  { id: "steel-black", name: "Acier noir mat", category: "metal", color: "#2b2b2c", pattern: "plain", roughness: 0.65, metalness: 0.8, paintable: true },
  { id: "steel-raw", name: "Acier brut", category: "metal", color: "#7d7f80", color2: "#5f6162", pattern: "concrete", roughness: 0.5, metalness: 1, tile: [300, 300], relief: 0.1 },

  // ---- Plastiques ----
  { id: "plastic-white", name: "Plastique blanc", category: "plastic", color: "#f2f2f0", pattern: "plain", roughness: 0.35, paintable: true },
  { id: "plastic-black", name: "Plastique noir", category: "plastic", color: "#1b1b1c", pattern: "plain", roughness: 0.4, paintable: true },
  { id: "plastic-grey", name: "Polypropylène gris", category: "plastic", color: "#8c8f92", pattern: "plain", roughness: 0.55, paintable: true },
  { id: "acrylic-clear", name: "Plexiglas transparent", category: "plastic", color: "#f4f7f8", pattern: "plain", roughness: 0.02, transmission: 1, ior: 1.49 },
  { id: "acrylic-opal", name: "Plexiglas opale", category: "plastic", color: "#f5f5f3", pattern: "plain", roughness: 0.3, transmission: 0.55, ior: 1.49 },
  { id: "rubber-black", name: "Caoutchouc noir", category: "plastic", color: "#1e1e1f", pattern: "plain", roughness: 0.9 },

  // ---- Éclairage : rubans et spots LED (document/lighting.ts) ----
  { id: "led-warm", name: "LED blanc chaud 2700 K", category: "light", color: "#ffd29a", pattern: "plain", roughness: 0.4, emissive: 14 },
  { id: "led-neutral", name: "LED blanc neutre 4000 K", category: "light", color: "#fff0d8", pattern: "plain", roughness: 0.4, emissive: 14 },
  { id: "led-cool", name: "LED blanc froid 6000 K", category: "light", color: "#e9f1ff", pattern: "plain", roughness: 0.4, emissive: 14 },

  // ---- Tissus et cuirs ----
  { id: "fabric-linen", name: "Lin naturel", category: "textile", color: "#cfc3ad", color2: "#b4a68c", pattern: "fabric", roughness: 0.9, sheen: 0.4, tile: [12, 12], relief: 0.6, paintable: true },
  { id: "fabric-grey", name: "Tissu gris chiné", category: "textile", color: "#8a8c8e", color2: "#6c6e70", pattern: "fabric", roughness: 0.92, sheen: 0.4, tile: [10, 10], relief: 0.6, paintable: true },
  { id: "velvet-blue", name: "Velours bleu nuit", category: "textile", color: "#1f2a4a", pattern: "plain", roughness: 0.85, sheen: 1, paintable: true },
  { id: "velvet-green", name: "Velours vert", category: "textile", color: "#2f4a35", pattern: "plain", roughness: 0.85, sheen: 1, paintable: true },
  { id: "leather-cognac", name: "Cuir cognac", category: "textile", color: "#8a4b26", color2: "#6b3519", pattern: "leather", roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.4, tile: [120, 120], relief: 0.5 },
  { id: "leather-black", name: "Cuir noir", category: "textile", color: "#1d1b1a", color2: "#0e0d0c", pattern: "leather", roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4, tile: [120, 120], relief: 0.5 },
  { id: "leather-white", name: "Cuir blanc cassé", category: "textile", color: "#e9e2d6", color2: "#d3c9b8", pattern: "leather", roughness: 0.55, tile: [120, 120], relief: 0.5 },

  // ---- Bétons et sols ----
  { id: "concrete-waxed", name: "Béton ciré", category: "concrete", color: "#9b9a96", color2: "#7f7e7a", pattern: "concrete", roughness: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.3, tile: [1500, 1500], relief: 0.05 },
  { id: "concrete-raw", name: "Béton brut", category: "concrete", color: "#a3a19c", color2: "#7c7a75", pattern: "concrete", roughness: 0.85, tile: [800, 800], relief: 0.35 },
  { id: "cork", name: "Liège", category: "concrete", color: "#b98b5e", color2: "#7e5631", pattern: "cork", roughness: 0.85, tile: [150, 150], relief: 0.4 },
  { id: "plaster-white", name: "Enduit blanc", category: "concrete", color: "#eceae4", color2: "#dcd9d1", pattern: "concrete", roughness: 0.9, tile: [1000, 1000], relief: 0.15, paintable: true },
];

/** A body without appearance nor material: a neutral satin grey, like Fusion's default. */
export const DEFAULT_APPEARANCE: Appearance = { id: "default", name: "Par défaut", category: "plastic", color: "#f8f8f8", pattern: "plain", roughness: 0.38 };
/** Walls of the room (kitchen layout): matte white paint. */
export const WALL_APPEARANCE: Appearance = { id: "wall", name: "Mur peint", category: "paint", color: "#ebe7e0", pattern: "plain", roughness: 0.92 };

/** The appearance of each workshop material when the body has none of its own. */
export const MATERIAL_APPEARANCE: Record<string, string> = {
  "melamine-white": "melamine-white",
  "melamine-oak": "melamine-oak",
  "melamine-walnut": "melamine-walnut",
  "melamine-anthracite": "melamine-anthracite",
  mdf: "mdf-raw",
  "lacquer-white": "lacquer-white-gloss",
  "birch-plywood": "plywood-birch",
  "solid-oak": "wood-oak-varnished",
  "pine-batten": "wood-pine",
  "oak-batten": "wood-oak-raw",
  hdf: "hdf",
};

const byId = new Map(APPEARANCES.map((a) => [a.id, a]));

/** The images imported in the open project (« Mes motifs »), set by appearance/custom.ts. */
let custom = new Map<string, Appearance>();

export function setCustomAppearances(list: Appearance[]): void {
  custom = new Map(list.map((a) => [a.id, a]));
}

/** What tells an appearance apart in the caches: its id, and for an imported image which image it is. */
export const appearanceKey = (a: Appearance): string => (a.image?.startsWith("data:") ? `${a.id}@${a.image.length}:${a.image.slice(-32)}` : a.id);

/** The library and the images of the open project. */
export function allAppearances(): Appearance[] {
  return [...APPEARANCES, ...custom.values()];
}

export function appearanceById(id: string | undefined): Appearance | undefined {
  return id ? (byId.get(id) ?? custom.get(id)) : undefined;
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Appearances of a category (all when null) whose name holds every word of the query (accents and case ignored). */
export function searchAppearances(query: string, category: CategoryId | null): Appearance[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return allAppearances().filter((a) => (!category || a.category === category) && words.every((w) => fold(`${a.name} ${a.id}`).includes(w)));
}
