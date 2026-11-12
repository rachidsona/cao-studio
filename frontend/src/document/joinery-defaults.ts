/**
 * Les valeurs de menuiserie par défaut, écrites une fois (audit d'architecture du 11/11/2026 : elles étaient recopiées
 * dans les générateurs du dressing, de la cuisine et dans les outils, au risque de diverger) :
 *
 * - DOOR_DEFAULTS : les portes posées d'office (jeu de 3 mm, panneau de 18 mm, poignées) — dressing, Répartition,
 *   portes sur niches, caisson tiré d'une case ;
 * - WALL_THICKNESS : l'épaisseur des murs dessinés par un plan (dressing, cuisine) ;
 * - CORNER_GAP : le jeu laissé dans un angle de cuisine entre deux linéaires.
 *
 * Le pas du système 32 mm est celui des perçages (features/joinery.ts DRILLING_32, repris par
 * sketcher/partition-face-edit.ts PITCH). Un standard du projet (document/standards.ts) prime sur ces valeurs là où il
 * s'applique.
 */
import type { DoorSettings } from "./sketch";

export const DOOR_DEFAULTS: Readonly<Pick<DoorSettings, "gap" | "thickness" | "handles">> = { gap: 3, thickness: 18, handles: true };

/** A plan's walls (mm). */
export const WALL_THICKNESS = 100;

/** Room left in a kitchen corner between two runs (mm). */
export const CORNER_GAP = 50;
