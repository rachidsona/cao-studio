/**
 * « Bons de commande » : la liste d'achat du projet partagée entre les fournisseurs de l'atelier
 * (document/purchase-orders.ts). On nomme ses fournisseurs, ce que chacun vend (panneaux, tasseaux, chants,
 * quincaillerie) et comment le joindre ; un article se confie à un autre d'un choix dans sa ligne. Les fournisseurs
 * sont gardés par ce navigateur, comme les tarifs du devis. Les bons s'impriment, ou se téléchargent en un .zip (une
 * page et un CSV par fournisseur).
 */
import { strToU8, zipSync, type Zippable } from "three/examples/jsm/libs/fflate.module.js";
import { cutList } from "../../document/cut-list";
import { modelHardware } from "../../document/hardware";
import type { PurchaseLine } from "../../document/purchase";
import { FAMILIES, NO_SUPPLIERS, orderCsv, ordersHtml, ORDERS_CSS, parseSuppliers, purchaseOrders, supplierFile, type SupplierSettings } from "../../document/purchase-orders";
import { download, el, slugify } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { purchaseLines } from "./production";
import { partsOf } from "./workshop";
import { loadRates } from "./workshop-documents";
import { openModal, pageHtml, printHtml } from "./workshop-ui";

const KEY = "cao.suppliers";
const FIELD = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const SMALL = "h-8 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

export function loadSuppliers(): SupplierSettings {
  try {
    return parseSuppliers(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return structuredClone(NO_SUPPLIERS);
  }
}

function saveSuppliers(settings: SupplierSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not kept: this session only.
  }
}

const today = () => new Date().toLocaleDateString("fr-FR");
/** A number for this batch of orders: the date and time, as the workshop files them. */
const orderNumber = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

/** The orders of these lines, ready to print or to keep: one page, and one CSV a supplier. */
export function orderFiles(lines: readonly PurchaseLine[], project: string, settings: SupplierSettings = loadSuppliers()): Map<string, string> {
  const orders = purchaseOrders(lines, settings, loadRates());
  const files = new Map<string, string>();
  if (!orders.length) return files;
  const number = orderNumber();
  files.set("bons-de-commande.html", pageHtml({ title: "Bons de commande", html: ordersHtml(orders, project, today(), number), css: ORDERS_CSS }));
  for (const o of orders) files.set(`bon-${supplierFile(o)}.csv`, `﻿${orderCsv(o)}`);
  return files;
}

export function openPurchaseOrders(editor: Editor, lines: PurchaseLine[], project: string): void {
  const settings = loadSuppliers();
  const holder = el("div", { class: "space-y-3 text-xs", "data-purchase-orders": "" });
  const changed = () => {
    saveSuppliers(settings);
    draw();
  };
  const draw = () => {
    // The suppliers: name, contact, what they sell.
    const cards = settings.suppliers.map((s) => {
      const name = el("input", { type: "text", class: FIELD, value: s.name, "aria-label": "Nom du fournisseur" });
      name.addEventListener("change", () => ((s.name = name.value.trim() || s.name), changed()));
      const contact = el("textarea", { class: `${FIELD} h-14 py-1`, "aria-label": `Coordonnées de ${s.name}` }, s.contact ?? "");
      contact.addEventListener("change", () => ((s.contact = contact.value.trim() || undefined), changed()));
      const families = FAMILIES.map(([f, label]) => {
        const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: s.families.includes(f), "aria-label": `${s.name} vend : ${label}` });
        box.addEventListener("change", () => ((s.families = box.checked ? [...s.families, f] : s.families.filter((x) => x !== f)), changed()));
        return el("label", { class: "flex items-center gap-1" }, box, label);
      });
      const remove = el("button", { type: "button", class: SMALL, "aria-label": `Retirer ${s.name}` }, "Retirer");
      remove.addEventListener("click", () => {
        settings.suppliers = settings.suppliers.filter((x) => x !== s);
        settings.articles = Object.fromEntries(Object.entries(settings.articles).filter(([, id]) => id !== s.id));
        changed();
      });
      return el("div", { class: "space-y-1 border border-gray-200 p-2 dark:border-gray-700", "data-supplier": s.id }, el("div", { class: "flex gap-1" }, name, remove), contact, el("div", { class: "flex flex-wrap gap-3" }, ...families));
    });
    const add = el("button", { type: "button", class: SMALL }, "Ajouter un fournisseur");
    add.addEventListener("click", () => {
      const used = new Set(settings.suppliers.map((s) => s.id));
      let n = settings.suppliers.length + 1;
      while (used.has(`f${n}`)) n++;
      settings.suppliers.push({ id: `f${n}`, name: `Fournisseur ${n}`, families: settings.suppliers.length ? [] : FAMILIES.map(([f]) => f) });
      changed();
    });
    // The orders: each line with its supplier, to give it to another.
    const orders = purchaseOrders(lines, settings, loadRates());
    const tables = orders.map((o) => {
      const rows = o.lines.map((l) => {
        const pick = el(
          "select",
          { class: FIELD, "aria-label": `Fournisseur de ${l.label}` },
          el("option", { value: "", selected: !settings.articles[l.label] }, "Selon sa famille"),
          ...settings.suppliers.map((s) => el("option", { value: s.id, selected: settings.articles[l.label] === s.id }, s.name)),
        );
        pick.addEventListener("change", () => {
          if (pick.value) settings.articles[l.label] = pick.value;
          else delete settings.articles[l.label];
          changed();
        });
        return el("tr", {}, el("td", { class: "py-1 pr-2" }, l.label), el("td", { class: "py-1 pr-2 text-right font-mono" }, `${l.quantity.toLocaleString("fr-FR")} ${l.unit}`), el("td", { class: "w-40 py-1" }, pick));
      });
      const head = o.supplier ? o.supplier.name : "À attribuer";
      const total = `${o.total.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD HT${o.unpriced ? `, ${o.unpriced} sans prix` : ""}`;
      return el("div", { class: "space-y-1", "data-order": o.supplier?.id ?? "" }, el("h4", { class: "font-semibold" }, `${head} — ${o.lines.length} article${o.lines.length > 1 ? "s" : ""}, ${total}`), el("table", { class: "w-full" }, el("tbody", {}, ...rows)));
    });
    holder.replaceChildren(
      el("h3", { class: "text-sm font-semibold" }, "Fournisseurs"),
      ...(cards.length ? cards : [el("p", { class: "text-gray-500" }, "Aucun fournisseur : ajoutez-en un, il vendra tout d'abord.")]),
      add,
      el("h3", { class: "text-sm font-semibold" }, "Bons"),
      ...(tables.length ? tables : [el("p", { class: "text-gray-500" }, "Rien à commander : tout vient du stock de chutes.")]),
      el("p", { class: "text-2xs text-gray-500" }, "Prix indicatifs, tirés des tarifs du devis. Les fournisseurs sont gardés par ce navigateur."),
    );
  };
  draw();
  const close = openModal("Bons de commande", holder, [
    {
      label: "Imprimer les bons",
      run: () => {
        const orders = purchaseOrders(lines, settings, loadRates());
        if (!orders.length) return editor.notify("Rien à commander.", "info");
        printHtml("Bons de commande", ordersHtml(orders, project, today(), orderNumber()), ORDERS_CSS, false);
      },
    },
    {
      label: "Télécharger (.zip)",
      run: () => {
        const files = orderFiles(lines, project, settings);
        if (!files.size) return editor.notify("Rien à commander.", "info");
        const zipped: Zippable = {};
        for (const [name, text] of files) zipped[name] = strToU8(text);
        const data = zipSync(zipped, { level: 6 });
        download(new Blob([data.slice().buffer as ArrayBuffer], { type: "application/zip" }), `${slugify(project)}-bons-de-commande.zip`);
      },
    },
    { label: "Fermer", run: () => close() },
  ]);
}

export function bindPurchaseOrders(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector('[data-workshop="purchase-orders"]')?.addEventListener("click", () => {
    const { rows } = cutList(editor.doc, partsOf(viewport, editor.doc));
    if (!rows.length) return editor.notify("Aucune pièce : il n'y a rien à commander.", "info");
    const project = document.title.split("·")[0]?.trim() || "Projet";
    void purchaseLines(rows, modelHardware(editor.doc)).then((lines) => openPurchaseOrders(editor, lines, project));
  });
}
