/** Le catalogue de l'atelier servi par Django (`/api/catalog/`) : matières, règles de quincaillerie, profil. */
import { ApiError } from "./api";

export interface CatalogMaterial {
  id: string;
  name: string;
  thickness: number;
  /** € HT per m². */
  price: number;
  color: string;
  category: "melamine" | "wood" | "glass" | "marble" | "stone" | "metal" | "laminate" | "solid";
  sheet: [number, number];
  default: boolean;
}

export interface HardwareRule {
  name: string;
  description: string;
  unit: string;
  price: number;
  quantity: number;
  /** How the quantity is counted from the furniture; "" : by hand (the price only). */
  mode: "" | "cabinet" | "door" | "door_hinge" | "shelf" | "niche" | "side";
  perUnit: number;
}

export interface CompanyProfile {
  name: string;
  slogan: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** A data URL, or empty. */
  logo: string;
}

export interface ServerCatalog {
  materials: CatalogMaterial[];
  hardware: HardwareRule[];
  company: CompanyProfile;
}

/** The catalogue, or null when the server has none to give (an older server, a network failure): the built-in one then. */
export async function loadCatalog(url: string | undefined): Promise<ServerCatalog | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) throw new ApiError(`Catalogue : ${response.status}`, response.status);
    return (await response.json()) as ServerCatalog;
  } catch (error) {
    console.warn("Catalogue de l'atelier non chargé :", error);
    return null;
  }
}
