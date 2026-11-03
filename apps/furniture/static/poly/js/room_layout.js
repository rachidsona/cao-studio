/*
 * The layout of the room editor (workshop /poly/, room_editor.html), around the editor itself (room_editor.js):
 * - modes above the plan — Sélection, Murs, Ouvertures, Mesurer — each with its own panel on the left;
 * - the library in tabs (Cuisine, Dressing, Appareils, Plans de travail);
 * - one « Sélection » panel on the right (what is clicked), the lists folded under it;
 * - a bar under the view (Contrôles, Devis, Versions) whose pills open their detail;
 * - Annuler / Rétablir (server history: room_history.py), the keyboard (Suppr, R, Échap, Ctrl+Z, Ctrl+Maj+Z);
 * - a measure of two points in the plan;
 * - what is folded, the view (plan, 3D, côte à côte) and the detail open, kept in this browser.
 */
const room = window.__polyRoom;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const STORE = 'poly.room.layout';
const SVG_NS = 'http://www.w3.org/2000/svg';

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}') || {};
  } catch {
    return {};
  }
}

function writeStore(patch) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...readStore(), ...patch }));
  } catch {
    // Not kept: this page only.
  }
}

const cm = (mm) => (Math.round(Number(mm) / 10 * 10) / 10).toLocaleString('fr-FR');
const typing = (target) => target?.isContentEditable || ['input', 'textarea', 'select'].includes((target?.tagName || '').toLowerCase());
const dialogOpen = () => Boolean(document.querySelector('.poly-dialog, .dim-calc:not([hidden])'));

// ---------------------------------------------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------------------------------------------
let mode = 'select';

const HINTS = {
  select: 'Cliquez pour sélectionner · glissez pour déplacer · R tourne · Suppr retire · Ctrl+Z annule',
  walls: 'Glissez un sommet pour modifier un mur · cliquez un mur pour ses cotes, sa cote pour la taper',
  openings: 'Cliquez une fenêtre ou une porte pour la modifier, ou ajoutez-en une à gauche',
  measure: 'Cliquez deux points : ils s’accrochent aux angles (Maj : point libre) · Échap efface',
};

function setMode(next) {
  mode = next;
  $$('[data-room-mode]').forEach((button) => button.classList.toggle('active', button.dataset.roomMode === next));
  $$('[data-mode-panel]').forEach((panel) => { panel.hidden = panel.dataset.modePanel !== next; });
  const settings = $('[data-room-settings]');
  if (settings && next === 'walls') settings.open = true;
  document.body.dataset.roomMode = next;
  const hint = $('#room-hint');
  if (hint && room.state.view !== '3d') hint.textContent = HINTS[next];
  if (next !== 'measure') clearMeasure();
  if (next === 'openings' && room.state.selectedOpeningId) room.beginEditOpening(room.state.selectedOpeningId);
}

$$('[data-room-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.roomMode)));

// ---------------------------------------------------------------------------------------------------------------
// Library: the « Plans » tab (worktops placed by hand)
// ---------------------------------------------------------------------------------------------------------------
const worktopsTab = $('[data-lib-worktops]');
function showWorktopsTab(on) {
  $('[data-lib-worktops-panel]').hidden = !on;
  $('[data-lib-presets]').hidden = on;
  const hint = $('#library-hint');
  if (hint) hint.hidden = on;
  worktopsTab?.classList.toggle('active', on);
}
worktopsTab?.addEventListener('click', () => {
  $$('.room-lib-tabs button').forEach((button) => button.classList.toggle('active', button === worktopsTab));
  showWorktopsTab(true);
});
$$('.room-lib-tabs [data-category]').forEach((button) => button.addEventListener('click', () => showWorktopsTab(false)));
$('[data-add-worktop]')?.addEventListener('click', () => $('#btn-add-worktop')?.click());

// ---------------------------------------------------------------------------------------------------------------
// The « Sélection » panel
// ---------------------------------------------------------------------------------------------------------------
function renderSelection(scroll = false) {
  const s = room.state;
  const opening = s.selectedOpeningId ? room.openingById(s.selectedOpeningId) : null;
  const nothing = !s.selectedItemId && !s.selectedApplianceId && !s.selectedWorktopId && !s.selectedWallId && !opening;
  $('[data-selection-empty]').hidden = !nothing;
  const card = $('[data-opening-selection]');
  card.hidden = !opening;
  if (opening) {
    $('[data-opening-selection-name]').textContent = opening.name || opening.kind_label;
    $('[data-opening-selection-dims]').textContent = `${opening.kind_label} · ${cm(opening.width)} × ${cm(opening.height)} cm · à ${cm(opening.offset)} cm du début du mur · allège ${cm(opening.sill)} cm`;
  }
  // What was picked shows first on the right (its list folded below).
  if (!nothing && scroll) $('.room-right')?.scrollTo({ top: 0, behavior: 'smooth' });
}

$('[data-opening-edit]')?.addEventListener('click', () => {
  const id = room.state.selectedOpeningId;
  setMode('openings');
  if (id) room.beginEditOpening(id);
});
$('[data-opening-delete]')?.addEventListener('click', () => {
  const opening = room.openingById(room.state.selectedOpeningId);
  if (opening) room.deleteOpening(opening);
});

// ---------------------------------------------------------------------------------------------------------------
// Folded sections, remembered
// ---------------------------------------------------------------------------------------------------------------
const folded = readStore().details || {};
$$('details[data-remember]').forEach((details) => {
  const key = details.dataset.remember;
  if (key in folded) details.open = Boolean(folded[key]);
  details.addEventListener('toggle', () => {
    const now = readStore().details || {};
    writeStore({ details: { ...now, [key]: details.open } });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The bar under the view: Contrôles, Devis, Versions
// ---------------------------------------------------------------------------------------------------------------
const drawer = $('[data-drawer]');
function openDock(name) {
  const open = name && drawer.hidden === false && drawer.dataset.open === name ? null : name;
  drawer.hidden = !open;
  drawer.dataset.open = open || '';
  $$('[data-dock-panel]').forEach((panel) => { panel.hidden = panel.dataset.dockPanel !== open; });
  $$('[data-dock]').forEach((pill) => pill.setAttribute('aria-pressed', String(pill.dataset.dock === open)));
  writeStore({ dock: open });
}
$$('[data-dock]').forEach((pill) => pill.addEventListener('click', () => openDock(pill.dataset.dock)));

function renderDock() {
  const payload = room.state.payload;
  const warnings = payload.warnings || [];
  const checks = $('[data-dock="checks"]');
  checks.classList.toggle('is-warn', warnings.length > 0);
  checks.classList.toggle('is-ok', warnings.length === 0);
  $('[data-dock-label="checks"]').textContent = warnings.length ? `Contrôles : ${warnings.length} alerte${warnings.length > 1 ? 's' : ''}` : 'Contrôles : rien à signaler';
  const total = Number(payload.summary?.total_ttc || 0);
  $('[data-dock-label="quote"]').textContent = `Devis : ${total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })} TTC`;
  const versions = (payload.versions || []).length;
  $('[data-dock-label="versions"]').textContent = `Versions : ${versions}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Annuler / Rétablir
// ---------------------------------------------------------------------------------------------------------------
let stepping = false;
async function step(direction) {
  if (stepping) return;
  const counts = room.state.payload.history || { undo: 0, redo: 0 };
  if (!counts[direction]) {
    room.setStatus(direction === 'undo' ? 'Rien à annuler.' : 'Rien à rétablir.');
    return;
  }
  stepping = true;
  try {
    const data = await room.api(room.urls[direction], {});
    room.applyPayload(data.payload, { status: data.message });
    room.toast(data.message);
  } catch (error) {
    room.toast(error.message, true);
  } finally {
    stepping = false;
  }
}
function renderHistory() {
  const counts = room.state.payload.history || { undo: 0, redo: 0 };
  const undo = $('[data-room-undo]');
  const redo = $('[data-room-redo]');
  undo.disabled = !counts.undo;
  redo.disabled = !counts.redo;
  undo.title = counts.undo ? `Annuler (Ctrl+Z) — ${counts.undo} étape${counts.undo > 1 ? 's' : ''}` : 'Rien à annuler';
  redo.title = counts.redo ? `Rétablir (Ctrl+Maj+Z) — ${counts.redo} étape${counts.redo > 1 ? 's' : ''}` : 'Rien à rétablir';
}
$('[data-room-undo]')?.addEventListener('click', () => step('undo'));
$('[data-room-redo]')?.addEventListener('click', () => step('redo'));

// ---------------------------------------------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------------------------------------------
document.addEventListener('keydown', (event) => {
  if (typing(event.target) || dialogOpen()) return;
  const key = event.key.toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  if (mod && key === 'z') {
    event.preventDefault();
    step(event.shiftKey ? 'redo' : 'undo');
    return;
  }
  if (mod && key === 'y') {
    event.preventDefault();
    step('redo');
    return;
  }
  if (mod || event.altKey) return;
  if (key === 'escape' && !document.body.classList.contains('room-presentation')) {
    if (mode === 'measure' && measure.points.length) clearMeasure();
    else room.clearSelection();
    return;
  }
  if (key === 'r') {
    const delta = event.shiftKey ? -90 : 90;
    if (room.state.selectedItemId) room.rotateItem(delta);
    else if (room.state.selectedApplianceId) room.rotateAppliance(delta);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Mesurer: two points of the plan, hooked to the corners of walls, cabinets and appliances
// ---------------------------------------------------------------------------------------------------------------
const measure = { points: [] };

function corners() {
  const p = room.state.payload;
  const out = [];
  p.walls.forEach((w) => out.push([w.x1, w.y1], [w.x2, w.y2]));
  p.items.forEach((i) => (i.corners || []).forEach((c) => out.push(c)));
  p.appliances.forEach((a) => (a.corners || []).forEach((c) => out.push(c)));
  return out;
}

/** The point clicked, on the nearest corner within 14 pixels (unless Maj is held). */
export function snapPoint(point, candidates, reach) {
  let best = null;
  for (const [x, y] of candidates) {
    const d = Math.hypot(x - point.x, y - point.y);
    if (d <= reach && (!best || d < best.d)) best = { x, y, d };
  }
  return best ? { x: best.x, y: best.y, snapped: true } : { x: point.x, y: point.y, snapped: false };
}

function drawMeasure() {
  const svg = $('#room-plan');
  if (!svg) return;
  svg.querySelector('[data-measure-layer]')?.remove();
  if (!measure.points.length) return;
  const scale = 1 / (svg.getScreenCTM()?.a || 1);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('data-measure-layer', '');
  g.setAttribute('pointer-events', 'none');
  const [a, b] = measure.points;
  const dot = (p) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', 6 * scale);
    c.setAttribute('fill', p.snapped ? '#0ea5e9' : '#f59e0b');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 2 * scale);
    g.append(c);
  };
  if (b) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.setAttribute('stroke', '#0ea5e9'); line.setAttribute('stroke-width', 3 * scale); line.setAttribute('stroke-dasharray', `${8 * scale} ${5 * scale}`);
    g.append(line);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', (a.x + b.x) / 2); text.setAttribute('y', (a.y + b.y) / 2 - 10 * scale);
    text.setAttribute('font-size', 15 * scale); text.setAttribute('font-weight', '700'); text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#0369a1'); text.setAttribute('paint-order', 'stroke'); text.setAttribute('stroke', '#fff'); text.setAttribute('stroke-width', 4 * scale);
    text.textContent = `${cm(Math.hypot(b.x - a.x, b.y - a.y))} cm`;
    g.append(text);
  }
  measure.points.forEach(dot);
  svg.append(g);
}

function showMeasureResult() {
  const box = $('[data-measure-result]');
  const [a, b] = measure.points;
  box.hidden = !b;
  if (!b) return;
  $('[data-measure-distance]').textContent = `${cm(Math.hypot(b.x - a.x, b.y - a.y))} cm`;
  $('[data-measure-deltas]').textContent = `ΔX ${cm(Math.abs(b.x - a.x))} cm · ΔY ${cm(Math.abs(b.y - a.y))} cm`;
}

function clearMeasure() {
  measure.points = [];
  drawMeasure();
  showMeasureResult();
}
$('[data-measure-clear]')?.addEventListener('click', clearMeasure);

// In measure mode, a click on the plan is a point: the editor does not get it (no selection, no drag).
$('#plan-view')?.addEventListener('pointerdown', (event) => {
  if (mode !== 'measure' || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const svg = $('#room-plan');
  const raw = room.svgPoint(event);
  const reach = 14 / (svg.getScreenCTM()?.a || 1);
  const point = event.shiftKey ? { x: raw.x, y: raw.y, snapped: false } : snapPoint(raw, corners(), reach);
  if (measure.points.length >= 2) measure.points = [];
  measure.points.push(point);
  drawMeasure();
  showMeasureResult();
}, true);

// ---------------------------------------------------------------------------------------------------------------
// Views remembered
// ---------------------------------------------------------------------------------------------------------------
$$('.room-view-tabs [data-view]').forEach((button) => button.addEventListener('click', () => {
  writeStore({ view: button.dataset.view });
  if (mode !== 'select' && button.dataset.view === '3d') setMode('select');
}));

// ---------------------------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------------------------
window.addEventListener('poly-room:payload', () => {
  renderDock();
  renderHistory();
  renderSelection();
  drawMeasure();
});
window.addEventListener('poly-room:selection', () => renderSelection(true));
window.addEventListener('poly-room:plan', drawMeasure);

const saved = readStore();
const presenting = document.body.classList.contains('room-presentation');
if (!presenting && ['3d', 'split'].includes(saved.view)) room.setView(saved.view);
setMode('select');
renderDock();
renderHistory();
renderSelection();
if (saved.dock) openDock(saved.dock);
