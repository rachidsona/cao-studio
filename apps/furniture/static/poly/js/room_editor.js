import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { surfaceMaterial } from './materials3d.js';
import { applianceFront, doorSpans } from './appliance3d.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const payloadNode = document.getElementById('room-payload');
const configNode = document.getElementById('room-config');
const config = JSON.parse(configNode.textContent);
const urls = config.urls;

const state = {
  payload: JSON.parse(payloadNode.textContent),
  selectedItemId: null,
  selectedApplianceId: null,
  selectedWorktopId: null,
  selectedOpeningId: null,
  selectedWallId: null,
  editingOpeningId: null,
  libraryCategory: 'kitchen',
  view: 'plan',
  drag: null,
  roomKey: '',
};

const three = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  roomGroup: null,
  itemsGroup: null,
  appliancesGroup: null,
  itemGroups: new Map(),
  applianceGroups: new Map(),
  raycaster: null,
  pointer: null,
  down: null,
  resizeObserver: null,
};

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function cm(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(number / 10);
}

function cmValue(value) {
  return (Number(value) / 10).toFixed(1);
}

function toMm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number * 10 : 0;
}

function euro(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message, isError = false) {
  let host = $('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`;
  node.textContent = message;
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 250);
  }, 3800);
}

async function api(url, body = null, method = 'POST') {
  const options = {
    method,
    headers: {
      'X-CSRFToken': document.querySelector('meta[name="csrf-token"]')?.content || '',
      Accept: 'application/json',
    },
  };
  if (body !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  if (!response.ok || !data || data.ok === false) {
    throw new Error(data?.error || `Erreur serveur (${response.status}).`);
  }
  return data;
}

function setStatus(left, right = null) {
  $('#room-status-left').textContent = left;
  if (right !== null) $('#room-status-right').textContent = right;
}

function wallById(id) {
  return state.payload.walls.find((wall) => wall.id === Number(id)) || null;
}

function itemById(id) {
  return state.payload.items.find((item) => item.id === Number(id)) || null;
}

function applianceById(id) {
  return state.payload.appliances.find((appliance) => appliance.id === Number(id)) || null;
}

function worktopById(id) {
  return state.payload.worktops.find((worktop) => worktop.id === Number(id)) || null;
}

function openingById(id) {
  return state.payload.openings.find((opening) => opening.id === Number(id)) || null;
}

const APPLIANCE_BADGES = {
  sink: 'Évier',
  hob: 'Plaque',
  hood: 'Hotte',
  oven: 'Four',
  fridge: 'Froid',
  dishwasher: 'Lave-v.',
  microwave: 'Micro-ondes',
  washing_machine: 'Lave-linge',
  other: 'Appareil',
};

// ----------------------------------------------------------------------
// Payload / rendu général
// ----------------------------------------------------------------------
function applyPayload(payload, options = {}) {
  const previousRoomKey = state.roomKey;
  state.payload = payload;
  const itemExists = payload.items.some((item) => item.id === state.selectedItemId);
  if (!itemExists) state.selectedItemId = null;
  if (!payload.appliances.some((appliance) => appliance.id === state.selectedApplianceId)) {
    state.selectedApplianceId = null;
  }
  if (!payload.worktops.some((worktop) => worktop.id === state.selectedWorktopId)) {
    state.selectedWorktopId = null;
  }
  if (!payload.openings.some((opening) => opening.id === state.selectedOpeningId)) {
    state.selectedOpeningId = null;
    if (state.editingOpeningId) resetOpeningForm();
  }
  if (!payload.walls.some((wall) => wall.id === state.selectedWallId)) {
    state.selectedWallId = null;
  }
  state.roomKey = `${payload.project.room_width}:${payload.project.room_depth}:${payload.project.room_height}`;

  renderHeader();
  renderRoomForm();
  renderPresets();
  renderAvailableCabinets();
  renderOpeningFormWalls();
  renderOpeningList();
  renderItemList();
  renderItemProps();
  renderApplianceList();
  renderApplianceProps();
  renderWorktopList();
  renderWorktopProps();
  renderWallProps();
  renderDressing();
  renderWarnings();
  renderQuote();
  renderVersions();
  renderPlan();
  rebuild3D();
  if (state.view !== 'plan' && previousRoomKey && previousRoomKey !== state.roomKey) {
    fitCamera();
  }
  if (options.selectItemId) {
    selectItem(options.selectItemId);
  }
  if (options.selectApplianceId) {
    selectAppliance(options.selectApplianceId);
  }
  if (options.selectWorktopId) {
    selectWorktop(options.selectWorktopId);
  }
  setStatus(
    options.status || 'Prêt.',
    `${payload.items.length} caisson(s) · ${payload.appliances.length} appareil(s) · ${payload.stats.area_m2.toFixed(2)} m² · ${payload.stats.wall_length} mm de murs`
  );
  window.dispatchEvent(new CustomEvent('poly-room:payload'));
}

function renderHeader() {
  const project = state.payload.project;
  $('#room-header-sub').textContent =
    `${project.room_type_label} · ${cm(project.room_width)} × ${cm(project.room_depth)} × ${cm(project.room_height)} cm · ${state.payload.items.length} caisson(s) · ${state.payload.appliances.length} appareil(s)`;
  $('#room-area-label').textContent = `${state.payload.stats.area_m2.toFixed(2)} m²`;
  $('#opening-count').textContent = state.payload.openings.length;
  $('#item-count').textContent = state.payload.items.length;
  $('#appliance-count').textContent = state.payload.appliances.length;
  $('#version-count').textContent = state.payload.versions.length;
  $('#item-list-empty').hidden = state.payload.items.length > 0;
  $('#appliance-list-empty').hidden = state.payload.appliances.length > 0;
}

function renderRoomForm() {
  const project = state.payload.project;
  $('#room-type').value = project.room_type;
  $('#room-width').value = cmValue(project.room_width);
  $('#room-depth').value = cmValue(project.room_depth);
  $('#room-height').value = cmValue(project.room_height);
  $('#wall-thickness').value = cmValue(project.wall_thickness);
  $('#worktop-thickness').value = cmValue(project.worktop_thickness);
  $('#worktop-overhang').value = cmValue(project.worktop_overhang);
  $('#worktop-color').value = project.worktop_color || '#d9d2c5';
}

function renderPresets() {
  const host = $('#preset-list');
  host.innerHTML = '';
  const isAppliance = state.libraryCategory === 'appliance';
  const presets = isAppliance
    ? (state.payload.appliance_presets || [])
    : state.payload.presets.filter(
      (preset) => preset.category === state.libraryCategory
    );
  $('#library-count').textContent = isAppliance ? 'appareils' : 'caissons';
  $('#library-hint').textContent = isAppliance
    ? "Les appareils sont posés automatiquement : un évier ou une plaque sur un caisson bas libre, une hotte au-dessus d'une plaque."
    : 'Chaque modèle crée un caisson paramétrique éditable, posé automatiquement contre un mur libre.';
  if (!presets.length) {
    host.innerHTML = '<p class="empty-mini">Aucun modèle dans cette catégorie.</p>';
    return;
  }
  presets.forEach((preset) => {
    const card = document.createElement('article');
    card.className = 'preset-card';
    card.innerHTML = `
      <div class="preset-head">
        <strong>${escapeHtml(preset.name)}</strong>
        <span class="chip">${escapeHtml(preset.badge || '')}</span>
      </div>
      <div class="preset-dims">${cm(preset.width)} × ${cm(preset.height)} × ${cm(preset.depth)} cm${preset.price ? ` · ${euro(preset.price)}` : ''}</div>
      <p>${escapeHtml(preset.description || '')}</p>
      <button class="btn btn-sm btn-primary" type="button">${isAppliance ? 'Poser dans la pièce' : 'Ajouter à la pièce'}</button>
    `;
    card.querySelector('button').addEventListener('click', (event) => {
      if (isAppliance) addAppliancePreset(preset.key, event.currentTarget);
      else addPreset(preset.key, event.currentTarget);
    });
    host.appendChild(card);
  });
}

function renderAvailableCabinets() {
  const select = $('#existing-cabinet');
  const button = $('#btn-add-existing');
  const current = select.value;
  select.innerHTML = '';
  const cabinets = state.payload.available_cabinets || [];
  if (!cabinets.length) {
    select.innerHTML = '<option value="">Aucun caisson disponible</option>';
    select.disabled = true;
    button.disabled = true;
    return;
  }
  select.disabled = false;
  button.disabled = false;
  cabinets.forEach((cabinet) => {
    const option = document.createElement('option');
    option.value = cabinet.id;
    option.textContent = `${cabinet.name} (${cm(cabinet.width)} × ${cm(cabinet.height)} × ${cm(cabinet.depth)} cm)`;
    select.appendChild(option);
  });
  if (cabinets.some((cabinet) => String(cabinet.id) === current)) select.value = current;
}

function renderOpeningFormWalls() {
  const select = $('#opening-wall');
  const current = select.value;
  select.innerHTML = '';
  state.payload.walls.forEach((wall) => {
    const option = document.createElement('option');
    option.value = wall.id;
    option.textContent = `${wall.name} · ${cm(wall.length)} cm`;
    select.appendChild(option);
  });
  if (state.payload.walls.some((wall) => String(wall.id) === current)) {
    select.value = current;
  } else if (state.selectedWallId) {
    select.value = String(state.selectedWallId);
  }
  select.disabled = state.payload.walls.length === 0;
}

function renderOpeningList() {
  const host = $('#opening-list');
  host.innerHTML = '';
  if (!state.payload.openings.length) {
    host.innerHTML = '<p class="empty-mini">Aucune ouverture. Ajoutez une porte ou une fenêtre.</p>';
    return;
  }
  state.payload.openings.forEach((opening) => {
    const wall = wallById(opening.wall_id);
    const row = document.createElement('div');
    row.className = `room-row${opening.id === state.selectedOpeningId ? ' selected' : ''}`;
    row.innerHTML = `
      <button class="room-row-main" type="button">
        <span class="room-row-title">${escapeHtml(opening.name)}</span>
        <span class="room-row-meta">${escapeHtml(wall?.name || 'Mur')} · ${cm(opening.offset)} cm · ${cm(opening.width)} × ${cm(opening.height)} cm</span>
      </button>
      <span class="room-row-actions">
        <button class="icon-btn" type="button" title="Modifier">✎</button>
        <button class="icon-btn danger" type="button" title="Supprimer">✕</button>
      </span>
    `;
    row.querySelector('.room-row-main').addEventListener('click', () => beginEditOpening(opening.id));
    row.querySelectorAll('.icon-btn')[0].addEventListener('click', () => beginEditOpening(opening.id));
    row.querySelectorAll('.icon-btn')[1].addEventListener('click', () => deleteOpening(opening));
    host.appendChild(row);
  });
}

function renderItemList() {
  const host = $('#item-list');
  host.innerHTML = '';
  if (!state.payload.items.length) return;
  state.payload.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = `room-row${item.id === state.selectedItemId ? ' selected' : ''}`;
    row.innerHTML = `
      <button class="room-row-main" type="button">
        <span class="room-row-title">${escapeHtml(item.name)}</span>
        <span class="room-row-meta">${cm(item.width)} × ${cm(item.height)} × ${cm(item.depth)} cm · ${cm(item.pos_x)}, ${cm(item.pos_y)} cm${item.elevation ? ` · +${cm(item.elevation)} cm` : ''}</span>
      </button>
      <span class="room-row-price">${item.price ? euro(item.price) : '—'}</span>
      <button class="room-row-delete" type="button" title="Retirer de la pièce">✕</button>
    `;
    row.querySelector('.room-row-main').addEventListener('click', () => selectItem(item.id));
    row.querySelector('.room-row-delete').addEventListener('click', (event) => {
      event.stopPropagation();
      confirmDeleteItem(item.id);
    });
    host.appendChild(row);
  });
}

function renderItemProps() {
  const item = itemById(state.selectedItemId);
  const panel = $('#item-props');
  if (!item) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $('#item-props-name').textContent = item.name;
  $('#item-props-dims').textContent =
    `${item.material} · ${cm(item.width)} × ${cm(item.height)} × ${cm(item.depth)} cm`;
  $('#item-x').value = cmValue(item.pos_x);
  $('#item-y').value = cmValue(item.pos_y);
  $('#item-rotation').value = Number(item.rotation).toFixed(1);
  $('#item-elevation').value = cmValue(item.elevation);
  $('#item-edit-link').href = config.editUrl.replace('/0/', `/${item.cabinet_id}/`);
}

function renderApplianceList() {
  const host = $('#appliance-list');
  host.innerHTML = '';
  if (!state.payload.appliances.length) return;
  state.payload.appliances.forEach((appliance) => {
    const row = document.createElement('div');
    row.className = `room-row${appliance.id === state.selectedApplianceId ? ' selected' : ''}`;
    row.innerHTML = `
      <button class="room-row-main" type="button">
        <span class="room-row-title">${escapeHtml(appliance.name)}</span>
        <span class="room-row-meta">${escapeHtml(appliance.kind_label)} · ${cm(appliance.width)} × ${cm(appliance.height)} × ${cm(appliance.depth)} cm · ${cm(appliance.pos_x)}, ${cm(appliance.pos_y)} cm${appliance.elevation ? ` · +${cm(appliance.elevation)} cm` : ''}</span>
      </button>
      <span class="room-row-price">${appliance.price ? euro(appliance.price) : '—'}</span>
      <button class="room-row-delete" type="button" title="Retirer l'appareil">✕</button>
    `;
    row.querySelector('.room-row-main').addEventListener('click', () => selectAppliance(appliance.id));
    row.querySelector('.room-row-delete').addEventListener('click', (event) => {
      event.stopPropagation();
      confirmDeleteAppliance(appliance.id);
    });
    host.appendChild(row);
  });
}

function renderApplianceProps() {
  const appliance = applianceById(state.selectedApplianceId);
  const panel = $('#appliance-props');
  if (!appliance) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $('#appliance-props-name').textContent = appliance.name;
  $('#appliance-props-dims').textContent =
    `${appliance.kind_label} · ${cm(appliance.width)} × ${cm(appliance.height)} × ${cm(appliance.depth)} cm`;
  $('#appliance-x').value = cmValue(appliance.pos_x);
  $('#appliance-y').value = cmValue(appliance.pos_y);
  $('#appliance-rotation').value = Number(appliance.rotation).toFixed(1);
  $('#appliance-elevation').value = cmValue(appliance.elevation);
  $('#appliance-width').value = cmValue(appliance.width);
  $('#appliance-depth').value = cmValue(appliance.depth);
  $('#appliance-height').value = cmValue(appliance.height);
  $('#appliance-price').value = Number(appliance.price).toFixed(0);
}

function renderWorktopList() {
  const host = $('#worktop-list');
  const empty = $('#worktop-list-empty');
  host.innerHTML = '';
  const worktops = (state.payload.worktops || []).filter((w) => w.explicit);
  $('#worktop-count').textContent = worktops.length;
  if (empty) empty.hidden = worktops.length > 0;
  worktops.forEach((worktop) => {
    const row = document.createElement('div');
    row.className = `room-row${worktop.id === state.selectedWorktopId ? ' selected' : ''}`;
    row.innerHTML = `
      <button class="room-row-main" type="button">
        <span class="room-row-title">${escapeHtml(worktop.name || 'Plan de travail')}</span>
        <span class="room-row-meta">${cm(worktop.width)} × ${cm(worktop.depth)} cm · ép. ${cm(worktop.thickness)} cm · +${cm(worktop.surface)} cm</span>
      </button>
      <button class="room-row-delete" type="button" title="Supprimer">✕</button>
    `;
    row.querySelector('.room-row-main').addEventListener('click', () => selectWorktop(worktop.id));
    row.querySelector('.room-row-delete').addEventListener('click', (event) => {
      event.stopPropagation();
      confirmDeleteWorktop(worktop.id);
    });
    host.appendChild(row);
  });
}

function renderWorktopProps() {
  const worktop = worktopById(state.selectedWorktopId);
  const panel = $('#worktop-props');
  if (!worktop) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $('#worktop-width').value = cmValue(worktop.width);
  $('#worktop-depth').value = cmValue(worktop.depth);
  $('#worktop-thickness').value = cmValue(worktop.thickness);
  $('#worktop-elevation').value = cmValue(worktop.surface ?? worktop.elevation);
  $('#worktop-x').value = cmValue(worktop.pos_x);
  $('#worktop-y').value = cmValue(worktop.pos_y);
  $('#worktop-rotation').value = Number(worktop.rotation).toFixed(1);
  $('#worktop-color').value = worktop.color || '#d9d2c5';
}

function renderWallProps() {
  const wall = wallById(state.selectedWallId);
  const panel = $('#wall-props');
  if (!wall) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $('#wall-props-name').textContent = wall.name;
  $('#wall-x1').value = cmValue(wall.x1);
  $('#wall-y1').value = cmValue(wall.y1);
  $('#wall-x2').value = cmValue(wall.x2);
  $('#wall-y2').value = cmValue(wall.y2);
  $('#wall-height').value = cmValue(wall.height);
  $('#wall-thickness-value').value = cmValue(wall.thickness);
  $('#wall-length-label').textContent =
    `Longueur ${cm(wall.length)} cm · angle ${Number(wall.angle).toFixed(1)}°`;
}

function renderDressing() {
  const host = $('#dressing-summary');
  const dressing = state.payload.dressing;
  if (!host || !dressing || !dressing.rail_count) {
    if (host) host.hidden = true;
    return;
  }
  const height =
    dressing.rail_height_min === dressing.rail_height_max
      ? `${cm(dressing.rail_height_min)} cm`
      : `${cm(dressing.rail_height_min)} à ${cm(dressing.rail_height_max)} cm`;
  const length = Number(dressing.rail_length_m || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  host.hidden = false;
  host.innerHTML = `
    <strong>Penderie</strong>
    <span>${dressing.rail_count} tringle(s) · ${length} m · hauteur ${height}</span>
  `;
}

function renderWarnings() {
  const host = $('#warning-list');
  const warnings = state.payload.warnings || [];
  $('#warning-count').textContent = warnings.length;
  if (!warnings.length) {
    const dressing = state.payload.project?.room_type === 'dressing';
    host.innerHTML = dressing
      ? '<p class="room-ok">Aucun conflit détecté : les caissons sont dans la pièce et les règles de dressing sont respectées.</p>'
      : '<p class="room-ok">Aucun conflit détecté : les caissons et appareils sont dans la pièce, les plans de travail sont cohérents et les règles ergonomiques sont respectées.</p>';
    return;
  }
  const list = document.createElement('ul');
  list.className = 'warning-list';
  warnings.forEach((warning) => {
    const item = document.createElement('li');
    item.textContent = warning.message;
    list.appendChild(item);
  });
  host.innerHTML = '';
  host.appendChild(list);
}

function renderQuote() {
  const summary = state.payload.summary;
  const host = $('#quote-summary');
  const cabinetLines = summary.lines
    .map(
      (line) => `
        <div class="quote-line">
          <span>${escapeHtml(line.name)}</span>
          <span>${euro(line.total)}</span>
        </div>`
    )
    .join('');
  const applianceLines = (summary.appliance_lines || [])
    .map(
      (line) => `
        <div class="quote-line">
          <span>${escapeHtml(line.name)} <small>· ${escapeHtml(line.kind_label)}</small></span>
          <span>${euro(line.price)}</span>
        </div>`
    )
    .join('');
  const lines = cabinetLines + applianceLines;
  host.innerHTML = `
    <div class="quote-lines">${lines || '<p class="empty-mini">Aucun article chiffré.</p>'}</div>
    <div class="quote-totals">
      <div class="total-row"><span>Matières</span><span>${euro(summary.materials)}</span></div>
      <div class="total-row"><span>Quincaillerie</span><span>${euro(summary.hardware)}</span></div>
      <div class="total-row"><span>Appareils</span><span>${euro(summary.appliances)}</span></div>
      <div class="total-row"><span>Marge ${summary.margin_percent.toFixed(1)} %</span><span>${euro(summary.margin)}</span></div>
      <div class="total-row"><span>Total HT</span><span>${euro(summary.total_ht)}</span></div>
      <div class="total-row"><span>TVA ${summary.tax_rate.toFixed(1)} %</span><span>${euro(summary.tax)}</span></div>
      <div class="total-row grand"><span>Total TTC</span><span>${euro(summary.total_ttc)}</span></div>
    </div>
  `;
}

function renderVersions() {
  const host = $('#version-list');
  host.innerHTML = '';
  if (!state.payload.versions.length) {
    host.innerHTML = '<p class="empty-mini">Aucune version enregistrée.</p>';
    return;
  }
  state.payload.versions.forEach((version) => {
    const row = document.createElement('div');
    row.className = 'room-row version-row';
    row.innerHTML = `
      <div class="room-row-main static">
        <span class="room-row-title">${escapeHtml(version.name)}</span>
        <span class="room-row-meta">${escapeHtml(version.created_label)} · ${version.item_count} caisson(s)${version.note ? ` · ${escapeHtml(version.note)}` : ''}</span>
      </div>
      <button class="btn btn-sm btn-ghost" type="button">Restaurer</button>
    `;
    row.querySelector('button').addEventListener('click', () => restoreVersion(version));
    host.appendChild(row);
  });
}

// ----------------------------------------------------------------------
// Plan 2D
// ----------------------------------------------------------------------
function svgElement(tag, attributes = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
  if (parent) parent.appendChild(node);
  return node;
}

function renderPlan() {
  const svg = $('#room-plan');
  const walls = state.payload.walls;
  svg.innerHTML = '';

  if (!walls.length) {
    $('#plan-empty').hidden = false;
    return;
  }
  $('#plan-empty').hidden = true;

  const xs = [];
  const ys = [];
  walls.forEach((wall) => {
    const half = Number(wall.thickness) / 2;
    xs.push(wall.x1 - half, wall.x1 + half, wall.x2 - half, wall.x2 + half);
    ys.push(wall.y1 - half, wall.y1 + half, wall.y2 - half, wall.y2 + half);
  });
  state.payload.items.forEach((item) => {
    item.corners.forEach(([x, y]) => {
      xs.push(x);
      ys.push(y);
    });
  });
  state.payload.appliances.forEach((appliance) => {
    appliance.corners.forEach(([x, y]) => {
      xs.push(x);
      ys.push(y);
    });
  });
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = state.payload.project.room_width;
    maxY = state.payload.project.room_depth;
  }
  const span = Math.max(maxX - minX, maxY - minY, 1000);
  const margin = Math.max(350, span * 0.10);
  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;
  const width = maxX - minX;
  const height = maxY - minY;
  svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const defs = svgElement('defs', {}, svg);
  const minor = svgElement('pattern', {
    id: 'plan-grid-minor',
    width: 500,
    height: 500,
    patternUnits: 'userSpaceOnUse',
  }, defs);
  svgElement('path', {
    d: 'M 500 0 L 0 0 0 500',
    fill: 'none',
    stroke: '#e9e4da',
    'stroke-width': 6,
  }, minor);
  const major = svgElement('pattern', {
    id: 'plan-grid-major',
    width: 1000,
    height: 1000,
    patternUnits: 'userSpaceOnUse',
  }, defs);
  svgElement('rect', { width: 1000, height: 1000, fill: 'url(#plan-grid-minor)' }, major);
  svgElement('path', {
    d: 'M 1000 0 L 0 0 0 1000',
    fill: 'none',
    stroke: '#d8d2c6',
    'stroke-width': 10,
  }, major);

  svgElement('rect', {
    x: minX,
    y: minY,
    width,
    height,
    fill: '#fbfaf7',
  }, svg);
  svgElement('rect', {
    x: minX,
    y: minY,
    width,
    height,
    fill: 'url(#plan-grid-major)',
    opacity: 0.9,
  }, svg);

  const floorPoints = walls.map((wall) => `${wall.x1},${wall.y1}`).join(' ');
  svgElement('polygon', {
    points: floorPoints,
    fill: '#f3eee5',
    stroke: 'none',
  }, svg);

  const font = Math.max(65, Math.min(150, width / 38));
  const smallFont = font * 0.82;

  // Murs
  walls.forEach((wall) => {
    const line = svgElement('line', {
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      stroke: wall.id === state.selectedWallId ? '#0f766e' : '#d3ccc0',
      'stroke-width': wall.thickness,
      'stroke-linecap': 'butt',
      class: 'plan-wall',
    }, svg);
    line.dataset.wallId = wall.id;
    const center = svgElement('line', {
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      stroke: wall.id === state.selectedWallId ? '#0f766e' : '#b9b0a2',
      'stroke-width': Math.max(8, font * 0.07),
      'stroke-linecap': 'butt',
      'pointer-events': 'none',
    }, svg);
    center.classList.add('plan-wall-center');

    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (length < 1) return;
    const ux = (wall.x2 - wall.x1) / length;
    const uy = (wall.y2 - wall.y1) / length;
    const nx = -uy;
    const ny = ux;
    const midX = (wall.x1 + wall.x2) / 2;
    const midY = (wall.y1 + wall.y2) / 2;
    let angle = (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;
    const labelX = midX + nx * (wall.thickness / 2 + margin * 0.42);
    const labelY = midY + ny * (wall.thickness / 2 + margin * 0.42);
    const text = svgElement('text', {
      x: labelX,
      y: labelY,
      'font-size': smallFont,
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-weight': 700,
      fill: '#667085',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      transform: `rotate(${angle} ${labelX} ${labelY})`,
      'pointer-events': 'all',
      class: 'plan-wall-dim',
    }, svg);
    text.dataset.wallId = wall.id;
    const title = svgElement('title', {}, text);
    title.textContent = 'Cliquer pour modifier la longueur du mur';
    text.textContent = `${cm(length)} cm`;
  });

  // Ouvertures
  state.payload.openings.forEach((opening) => {
    const wall = wallById(opening.wall_id);
    if (!wall) return;
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (length < 1) return;
    const ux = (wall.x2 - wall.x1) / length;
    const uy = (wall.y2 - wall.y1) / length;
    const nx = -uy;
    const ny = ux;
    const thickness = wall.thickness + 20;
    const start = opening.offset;
    const end = opening.offset + opening.width;
    const corners = [
      [wall.x1 + ux * start + nx * thickness / 2, wall.y1 + uy * start + ny * thickness / 2],
      [wall.x1 + ux * end + nx * thickness / 2, wall.y1 + uy * end + ny * thickness / 2],
      [wall.x1 + ux * end - nx * thickness / 2, wall.y1 + uy * end - ny * thickness / 2],
      [wall.x1 + ux * start - nx * thickness / 2, wall.y1 + uy * start - ny * thickness / 2],
    ];
    const fill = opening.kind === 'window'
      ? '#dbeafe'
      : opening.kind === 'door'
        ? '#fef3c7'
        : '#eef2f6';
    const polygon = svgElement('polygon', {
      points: corners.map((point) => point.join(',')).join(' '),
      fill,
      stroke: opening.id === state.selectedOpeningId ? '#2078CF' : '#94a3b8',
      'stroke-width': opening.id === state.selectedOpeningId ? 25 : 10,
      'stroke-dasharray': opening.kind === 'window' ? '60 35' : null,
      class: 'plan-opening',
    }, svg);
    polygon.dataset.openingId = opening.id;
    const middleX = (corners[0][0] + corners[2][0]) / 2;
    const middleY = (corners[0][1] + corners[2][1]) / 2;
    const label = svgElement('text', {
      x: middleX,
      y: middleY,
      'font-size': smallFont * 0.82,
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-weight': 700,
      fill: '#475467',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      transform: `rotate(${(Math.atan2(uy, ux) * 180) / Math.PI} ${middleX} ${middleY})`,
      'pointer-events': 'none',
    }, svg);
    label.textContent = `${cm(opening.width)} cm`;
  });

  // Plans de travail (sous les caissons)
  state.payload.worktops.forEach((worktop) => {
    const points = worktop.corners.map(([x, y]) => `${x},${y}`).join(' ');
    const selected = worktop.explicit && worktop.id === state.selectedWorktopId;
    const polygon = svgElement('polygon', {
      points,
      fill: worktop.color || '#d9d2c5',
      'fill-opacity': 0.55,
      stroke: selected ? '#2078CF' : '#a89f8f',
      'stroke-width': selected ? 30 : 12,
      'stroke-dasharray': selected ? null : '45 28',
      'stroke-linejoin': 'round',
      class: `plan-worktop${worktop.explicit ? ' plan-worktop-explicit' : ''}${selected ? ' selected' : ''}`,
    }, svg);
    if (worktop.explicit) {
      polygon.dataset.worktopId = worktop.id;
      const title = svgElement('title', {}, polygon);
      title.textContent = `${worktop.name || 'Plan de travail'} · ${cm(worktop.width)} × ${cm(worktop.depth)} cm`;
    }
  });

  // Caissons
  state.payload.items.forEach((item) => {
    const selected = item.id === state.selectedItemId;
    const group = svgElement('g', { class: `plan-item${selected ? ' selected' : ''}` }, svg);
    group.dataset.itemId = item.id;
    const points = item.corners.map(([x, y]) => `${x},${y}`).join(' ');
    svgElement('polygon', {
      points,
      fill: item.color || '#ffffff',
      'fill-opacity': 0.94,
      stroke: selected ? '#2078CF' : '#64748b',
      'stroke-width': selected ? 30 : 12,
      'stroke-linejoin': 'round',
    }, group);
    const front = [item.corners[3], item.corners[2]];
    svgElement('line', {
      x1: front[0][0],
      y1: front[0][1],
      x2: front[1][0],
      y2: front[1][1],
      stroke: selected ? '#2078CF' : '#475467',
      'stroke-width': selected ? 40 : 25,
      'stroke-linecap': 'round',
    }, group);
    const xsItem = item.corners.map((point) => point[0]);
    const ysItem = item.corners.map((point) => point[1]);
    const centerX = (Math.min(...xsItem) + Math.max(...xsItem)) / 2;
    const centerY = (Math.min(...ysItem) + Math.max(...ysItem)) / 2;
    let angle = Number(item.rotation) || 0;
    if (angle > 90 && angle < 270) angle -= 180;
    const textGroup = svgElement('g', {
      transform: `rotate(${angle} ${centerX} ${centerY})`,
      'pointer-events': 'none',
    }, group);
    const name = item.name.length > 22 ? `${item.name.slice(0, 21)}…` : item.name;
    const title = svgElement('text', {
      x: centerX,
      y: centerY - smallFont * 0.28,
      'font-size': smallFont,
      'font-weight': 700,
      fill: '#18212b',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, textGroup);
    title.textContent = name;
    const dims = svgElement('text', {
      x: centerX,
      y: centerY + smallFont * 0.72,
      'font-size': smallFont * 0.8,
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fill: '#667085',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, textGroup);
    dims.textContent = `${cm(item.width)} × ${cm(item.depth)} cm${item.elevation ? ` · +${cm(item.elevation)}` : ''}`;

    const delX = Math.max(...xsItem) + smallFont * 0.35;
    const delY = Math.min(...ysItem) - smallFont * 0.35;
    const del = svgElement('circle', {
      cx: delX,
      cy: delY,
      r: smallFont * 0.55,
      fill: '#dc2626',
      stroke: '#ffffff',
      'stroke-width': smallFont * 0.12,
      class: 'plan-delete-item',
    }, group);
    del.dataset.itemId = item.id;
    const delText = svgElement('text', {
      x: delX,
      y: delY,
      'font-size': smallFont * 0.72,
      'font-weight': 700,
      fill: '#ffffff',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'pointer-events': 'none',
    }, group);
    delText.textContent = '✕';
  });

  // Appareils (au-dessus des caissons et du plan de travail)
  state.payload.appliances.forEach((appliance) => {
    const selected = appliance.id === state.selectedApplianceId;
    const group = svgElement('g', {
      class: `plan-appliance${selected ? ' selected' : ''}`,
    }, svg);
    group.dataset.applianceId = appliance.id;
    const points = appliance.corners.map(([x, y]) => `${x},${y}`).join(' ');
    svgElement('polygon', {
      points,
      fill: appliance.color || '#cbd5e1',
      'fill-opacity': 0.78,
      stroke: selected ? '#2078CF' : '#475467',
      'stroke-width': selected ? 30 : 14,
      'stroke-linejoin': 'round',
      'stroke-dasharray': appliance.kind === 'hood' ? '55 30' : null,
    }, group);

    const xsAppliance = appliance.corners.map((point) => point[0]);
    const ysAppliance = appliance.corners.map((point) => point[1]);
    const centerX = (Math.min(...xsAppliance) + Math.max(...xsAppliance)) / 2;
    const centerY = (Math.min(...ysAppliance) + Math.max(...ysAppliance)) / 2;
    const width = Number(appliance.width) || 0;
    const depth = Number(appliance.depth) || 0;
    const angle = Number(appliance.rotation) || 0;
    const symbol = svgElement('g', {
      transform: `rotate(${angle} ${centerX} ${centerY})`,
      'pointer-events': 'none',
    }, group);
    const dark = ['hob', 'oven', 'microwave'].includes(appliance.kind);
    const iconStroke = dark ? '#f8fafc' : '#1f2937';
    const iconWidth = Math.max(10, smallFont * 0.11);
    const minSpan = Math.min(width, depth);
    const icon = (tag, attributes) => svgElement(tag, {
      fill: 'none',
      stroke: iconStroke,
      'stroke-width': iconWidth,
      ...attributes,
    }, symbol);

    if (appliance.kind === 'sink') {
      icon('rect', {
        x: centerX - width * 0.32,
        y: centerY - depth * 0.26,
        width: width * 0.64,
        height: depth * 0.52,
        rx: minSpan * 0.04,
      });
      icon('circle', {
        cx: centerX,
        cy: centerY,
        r: Math.max(18, minSpan * 0.055),
      });
    } else if (appliance.kind === 'hob') {
      [-0.21, 0.21].forEach((sx) => {
        [-0.18, 0.18].forEach((sy) => {
          icon('circle', {
            cx: centerX + width * sx,
            cy: centerY + depth * sy,
            r: Math.max(18, minSpan * 0.09),
          });
        });
      });
    } else if (appliance.kind === 'hood') {
      icon('rect', {
        x: centerX - width * 0.36,
        y: centerY - depth * 0.3,
        width: width * 0.72,
        height: depth * 0.6,
        'stroke-dasharray': '40 25',
      });
      icon('path', {
        d: `M ${centerX - width * 0.18} ${centerY + depth * 0.12} L ${centerX} ${centerY + depth * 0.28} L ${centerX + width * 0.18} ${centerY + depth * 0.12}`,
      });
    } else if (appliance.kind === 'fridge') {
      icon('line', {
        x1: centerX,
        y1: centerY - depth * 0.45,
        x2: centerX,
        y2: centerY + depth * 0.45,
      });
      icon('line', {
        x1: centerX + width * 0.05,
        y1: centerY - depth * 0.18,
        x2: centerX + width * 0.16,
        y2: centerY - depth * 0.18,
      });
    } else if (appliance.kind === 'oven') {
      icon('rect', {
        x: centerX - width * 0.3,
        y: centerY - depth * 0.32,
        width: width * 0.6,
        height: depth * 0.5,
      });
      icon('line', {
        x1: centerX - width * 0.3,
        y1: centerY + depth * 0.1,
        x2: centerX + width * 0.3,
        y2: centerY + depth * 0.1,
      });
    } else if (['dishwasher', 'washing_machine'].includes(appliance.kind)) {
      icon('circle', {
        cx: centerX,
        cy: centerY + depth * 0.02,
        r: Math.max(18, minSpan * 0.22),
      });
      icon('rect', {
        x: centerX - width * 0.28,
        y: centerY - depth * 0.36,
        width: width * 0.56,
        height: depth * 0.08,
      });
    } else if (appliance.kind === 'microwave') {
      icon('rect', {
        x: centerX - width * 0.34,
        y: centerY - depth * 0.26,
        width: width * 0.5,
        height: depth * 0.52,
      });
      icon('rect', {
        x: centerX + width * 0.2,
        y: centerY - depth * 0.26,
        width: width * 0.14,
        height: depth * 0.52,
      });
    } else {
      icon('line', {
        x1: centerX - width * 0.26,
        y1: centerY - depth * 0.26,
        x2: centerX + width * 0.26,
        y2: centerY + depth * 0.26,
      });
      icon('line', {
        x1: centerX - width * 0.26,
        y1: centerY + depth * 0.26,
        x2: centerX + width * 0.26,
        y2: centerY - depth * 0.26,
      });
    }

    const badge = APPLIANCE_BADGES[appliance.kind] || 'Appareil';
    const badgeText = svgElement('text', {
      x: centerX,
      y: centerY + smallFont * 0.02,
      'font-size': smallFont * 0.86,
      'font-weight': 700,
      fill: dark ? '#ffffff' : '#18212b',
      stroke: dark ? 'rgba(31,41,55,.35)' : 'rgba(255,255,255,.9)',
      'stroke-width': smallFont * 0.14,
      'paint-order': 'stroke',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'pointer-events': 'none',
    }, group);
    badgeText.textContent = badge;
    const title = svgElement('title', {}, group);
    title.textContent = `${appliance.name} · ${cm(appliance.width)} × ${cm(appliance.depth)} cm`;

    const delX = Math.max(...xsAppliance) + smallFont * 0.35;
    const delY = Math.min(...ysAppliance) - smallFont * 0.35;
    const del = svgElement('circle', {
      cx: delX,
      cy: delY,
      r: smallFont * 0.55,
      fill: '#dc2626',
      stroke: '#ffffff',
      'stroke-width': smallFont * 0.12,
      class: 'plan-delete-item',
    }, group);
    del.dataset.applianceId = appliance.id;
    const delText = svgElement('text', {
      x: delX,
      y: delY,
      'font-size': smallFont * 0.72,
      'font-weight': 700,
      fill: '#ffffff',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'pointer-events': 'none',
    }, group);
    delText.textContent = '✕';
  });

  // Poignées de sommets
  walls.forEach((wall) => {
    const handle = svgElement('circle', {
      cx: wall.x1,
      cy: wall.y1,
      r: Math.max(55, font * 0.45),
      fill: '#ffffff',
      stroke: wall.id === state.selectedWallId ? '#0f766e' : '#0f766e',
      'stroke-width': Math.max(12, font * 0.1),
      class: 'plan-vertex',
    }, svg);
    handle.dataset.wallId = wall.id;
    const title = svgElement('title', {}, handle);
    title.textContent = 'Glisser pour modifier l’angle du mur';
  });

  // Cotes générales
  const dimensionY = maxY - margin * 0.35;
  svgElement('line', {
    x1: minX + margin * 0.5,
    y1: dimensionY,
    x2: maxX - margin * 0.5,
    y2: dimensionY,
    stroke: '#98a2b3',
    'stroke-width': 8,
    'pointer-events': 'none',
  }, svg);
  const widthLabel = svgElement('text', {
    x: (minX + maxX) / 2,
    y: dimensionY - smallFont * 0.7,
    'font-size': smallFont,
    'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    'font-weight': 700,
    fill: '#667085',
    'text-anchor': 'middle',
    'pointer-events': 'none',
  }, svg);
  widthLabel.textContent = `Largeur ${cm(maxX - minX - margin)} cm`;

  svg.onpointerdown = onPlanPointerDown;
  svg.onpointermove = onPlanPointerMove;
  svg.onpointerup = onPlanPointerUp;
  svg.onpointercancel = onPlanPointerUp;
  window.dispatchEvent(new CustomEvent('poly-room:plan'));
}

function svgPoint(event) {
  const svg = $('#room-plan');
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  return point.matrixTransform(matrix.inverse());
}

// ----------------------------------------------------------------------
// Accrochage magnétique entre meubles
// ----------------------------------------------------------------------
const SNAP_DISTANCE = 160; // mm

function rotatePoint(lx, ly, deg) {
  const rad = (Number(deg) || 0) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: lx * cos - ly * sin, y: lx * sin + ly * cos };
}

function rectOffsets(width, depth, rotation) {
  const points = [[0, 0], [width, 0], [width, depth], [0, depth]]
    .map(([lx, ly]) => rotatePoint(lx, ly, rotation));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function resolveOverlaps(nextX, nextY, width, depth, rotation, exclude = {}, elevation = null, height = 0) {
  const off = rectOffsets(width, depth, rotation);
  const targets = [
    ...state.payload.items.filter((item) => item.id !== exclude.item),
    ...state.payload.appliances.filter(
      (appliance) => appliance.id !== exclude.appliance
    ),
  ];
  let x = nextX;
  let y = nextY;
  let resolved = false;
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (const target of targets) {
      const draggedBottom = (Number(elevation) || 0) + (Number(height) || 0);
      const targetBottom = (Number(target.elevation) || 0) + (Number(target.height) || 0);
      if (
        (Number(elevation) || 0) >= targetBottom
        || draggedBottom <= (Number(target.elevation) || 0)
      ) {
        continue;
      }
      const to = rectOffsets(
        Number(target.width),
        Number(target.depth),
        Number(target.rotation) || 0
      );
      const tx = Number(target.pos_x);
      const ty = Number(target.pos_y);
      const overlapX = Math.min(x + off.right, tx + to.right)
        - Math.max(x + off.left, tx + to.left);
      const overlapY = Math.min(y + off.bottom, ty + to.bottom)
        - Math.max(y + off.top, ty + to.top);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if (overlapX < overlapY) {
        const pushLeft = (x + off.right) - (tx + to.left);
        const pushRight = (tx + to.right) - (x + off.left);
        x += pushLeft < pushRight ? -pushLeft : pushRight;
      } else {
        const pushUp = (y + off.bottom) - (ty + to.top);
        const pushDown = (ty + to.bottom) - (y + off.top);
        y += pushUp < pushDown ? -pushUp : pushDown;
      }
      moved = true;
      resolved = true;
    }
    if (!moved) break;
  }
  return { x, y, resolved };
}

function snapRect(nextX, nextY, width, depth, rotation, exclude = {}, elevation = null, height = 0) {
  const off = rectOffsets(width, depth, rotation);
  let dx = Infinity;
  let dy = Infinity;
  let bestTarget = null;
  let bestDist = 1e9;
  const targets = [
    ...state.payload.items.filter((item) => item.id !== exclude.item),
    ...state.payload.appliances.filter(
      (appliance) => appliance.id !== exclude.appliance
    ),
  ];
  for (const target of targets) {
    const to = rectOffsets(
      Number(target.width),
      Number(target.depth),
      Number(target.rotation) || 0
    );
    const tx = Number(target.pos_x);
    const ty = Number(target.pos_y);
    const candidatesX = [
      tx + to.left - (nextX + off.right),
      tx + to.right - (nextX + off.left),
    ];
    const candidatesY = [
      ty + to.top - (nextY + off.top),
      ty + to.bottom - (nextY + off.bottom),
    ];
    for (const candidate of candidatesX) {
      if (Math.abs(candidate) < Math.abs(dx)) dx = candidate;
    }
    for (const candidate of candidatesY) {
      if (Math.abs(candidate) < Math.abs(dy)) dy = candidate;
    }
    const cx = nextX + width / 2;
    const cy = nextY + depth / 2;
    const ocx = tx + (to.left + to.right) / 2;
    const ocy = ty + (to.top + to.bottom) / 2;
    const dist = Math.hypot(cx - ocx, cy - ocy);
    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = target;
    }
  }
  const snappedX = Math.abs(dx) <= SNAP_DISTANCE;
  const snappedY = Math.abs(dy) <= SNAP_DISTANCE;
  let x = nextX + (snappedX ? dx : 0);
  let y = nextY + (snappedY ? dy : 0);

  // Résolution des chevauchements : si le caisson chevauche un voisin, on le
  // pousse jusqu'au contact (face contre face), sans jamais se croiser.
  const overlap = resolveOverlaps(
    x, y, width, depth, rotation, exclude, elevation, height
  );
  x = overlap.x;
  y = overlap.y;
  const overlapResolved = overlap.resolved;

  let snappedElevation = null;
  if (
    (snappedX || snappedY)
    && bestTarget
    && bestTarget.elevation !== undefined
    && Number(elevation) > 0
    && Number(bestTarget.elevation) > 0
  ) {
    snappedElevation = Number(bestTarget.elevation) || 0;
  }
  return {
    x,
    y,
    snappedX: snappedX || overlapResolved,
    snappedY: snappedY || overlapResolved,
    elevation: snappedElevation,
  };
}

const ENCASTABLE_KINDS = new Set(['sink', 'hob', 'oven', 'microwave']);

function snapApplianceToCabinet(appliance, posX, posY) {
  if (!ENCASTABLE_KINDS.has(appliance.kind)) return null;
  const acx = posX + appliance.width / 2;
  const acy = posY + appliance.depth / 2;
  let best = null;
  let bestDist = 1e9;
  for (const item of state.payload.items) {
    const corners = item.corners || [];
    if (corners.length < 4) continue;
    const icx = (corners[0][0] + corners[2][0]) / 2;
    const icy = (corners[0][1] + corners[2][1]) / 2;
    const dist = Math.hypot(acx - icx, acy - icy);
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }
  const threshold = 260;
  if (!best || bestDist > threshold) return null;
  const corners = best.corners;
  const icx = (corners[0][0] + corners[2][0]) / 2;
  const icy = (corners[0][1] + corners[2][1]) / 2;
  return {
    x: icx - appliance.width / 2,
    y: icy - appliance.depth / 2,
    rotation: Number(best.rotation) || 0,
  };
}

function roomBounds() {
  const walls = state.payload.walls;
  if (!walls || walls.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, Number(wall.x1), Number(wall.x2));
    minY = Math.min(minY, Number(wall.y1), Number(wall.y2));
    maxX = Math.max(maxX, Number(wall.x1), Number(wall.x2));
    maxY = Math.max(maxY, Number(wall.y1), Number(wall.y2));
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function clampToRoom(nextX, nextY, width, depth, rotation) {
  const bounds = roomBounds();
  if (!bounds) return { x: nextX, y: nextY };
  const off = rectOffsets(width, depth, rotation);
  // Le contour des murs est leur ligne médiane : on recule d'une demi-épaisseur
  // pour que le caisson s'arrête contre la face intérieure du mur (et non sur
  // sa ligne du milieu).
  let thickness = Number(state.payload.project?.wall_thickness) || 100;
  for (const wall of state.payload.walls) {
    thickness = Math.max(thickness, Number(wall.thickness) || 0);
  }
  const inset = thickness / 2;
  const minX = bounds.minX + inset;
  const minY = bounds.minY + inset;
  const maxX = bounds.maxX - inset;
  const maxY = bounds.maxY - inset;
  let x = nextX;
  let y = nextY;
  const left = x + off.left;
  const right = x + off.right;
  const top = y + off.top;
  const bottom = y + off.bottom;
  const spanX = right - left;
  const spanY = bottom - top;
  if (spanX > maxX - minX) {
    x = minX - off.left;
  } else if (left < minX) {
    x += minX - left;
  } else if (right > maxX) {
    x -= right - maxX;
  }
  if (spanY > maxY - minY) {
    y = minY - off.top;
  } else if (top < minY) {
    y += minY - top;
  } else if (bottom > maxY) {
    y -= bottom - maxY;
  }
  return { x, y };
}

function onPlanPointerDown(event) {
  const target = event.target;
  const dimNode = target.closest?.('.plan-wall-dim');
  if (dimNode) {
    event.preventDefault();
    openDimCalc(Number(dimNode.dataset.wallId));
    return;
  }
  const deleteNode = target.closest?.('.plan-delete-item');
  if (deleteNode) {
    event.preventDefault();
    if (deleteNode.dataset.itemId !== undefined) {
      confirmDeleteItem(Number(deleteNode.dataset.itemId));
    } else if (deleteNode.dataset.applianceId !== undefined) {
      confirmDeleteAppliance(Number(deleteNode.dataset.applianceId));
    }
    return;
  }
  const vertex = target.closest?.('.plan-vertex');
  if (vertex) {
    startVertexDrag(event, Number(vertex.dataset.wallId));
    return;
  }
  const worktopNode = target.closest?.('.plan-worktop-explicit');
  if (worktopNode) {
    event.preventDefault();
    selectWorktop(Number(worktopNode.dataset.worktopId));
    return;
  }
  const itemNode = target.closest?.('.plan-item');
  if (itemNode) {
    const item = itemById(itemNode.dataset.itemId);
    if (!item) return;
    selectItem(item.id);
    startItemDrag(event, item, itemNode);
    return;
  }
  const applianceNode = target.closest?.('.plan-appliance');
  if (applianceNode) {
    const appliance = applianceById(applianceNode.dataset.applianceId);
    if (!appliance) return;
    selectAppliance(appliance.id);
    startApplianceDrag(event, appliance, applianceNode);
    return;
  }
  const openingNode = target.closest?.('.plan-opening');
  if (openingNode) {
    beginEditOpening(Number(openingNode.dataset.openingId));
    return;
  }
  const wallNode = target.closest?.('.plan-wall');
  if (wallNode) {
    selectWall(Number(wallNode.dataset.wallId));
    return;
  }
  clearSelection();
}

function startItemDrag(event, item, node) {
  const point = svgPoint(event);
  state.drag = {
    type: 'item',
    itemId: item.id,
    start: point,
    originX: Number(item.pos_x),
    originY: Number(item.pos_y),
    node,
    moved: false,
    pointerId: event.pointerId,
  };
  $('#room-plan').setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function startApplianceDrag(event, appliance, node) {
  const point = svgPoint(event);
  state.drag = {
    type: 'appliance',
    applianceId: appliance.id,
    start: point,
    originX: Number(appliance.pos_x),
    originY: Number(appliance.pos_y),
    node,
    moved: false,
    pointerId: event.pointerId,
  };
  $('#room-plan').setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function startVertexDrag(event, wallId) {
  const walls = state.payload.walls;
  const wall = wallById(wallId);
  if (!wall) return;
  const index = walls.findIndex((candidate) => candidate.id === wallId);
  const previous = walls[(index - 1 + walls.length) % walls.length];
  const previousConnected = previous && previous.id !== wall.id &&
    Math.hypot(previous.x2 - wall.x1, previous.y2 - wall.y1) < 2;
  const point = svgPoint(event);
  const preview = svgElement('g', { class: 'vertex-preview' }, $('#room-plan'));
  const circle = svgElement('circle', {
    cx: point.x,
    cy: point.y,
    r: 90,
    fill: '#2078CF',
    'fill-opacity': 0.2,
    stroke: '#2078CF',
    'stroke-width': 15,
  }, preview);
  const lineA = svgElement('line', {
    x1: point.x,
    y1: point.y,
    x2: wall.x2,
    y2: wall.y2,
    stroke: '#2078CF',
    'stroke-width': 12,
    'stroke-dasharray': '45 30',
  }, preview);
  const lineB = previousConnected
    ? svgElement('line', {
      x1: point.x,
      y1: point.y,
      x2: previous.x1,
      y2: previous.y1,
      stroke: '#2078CF',
      'stroke-width': 12,
      'stroke-dasharray': '45 30',
    }, preview)
    : null;
  state.drag = {
    type: 'vertex',
    wallId,
    previousId: previousConnected ? previous.id : null,
    start: point,
    origin: { x: wall.x1, y: wall.y1 },
    node: wall,
    previous,
    preview,
    circle,
    lineA,
    lineB,
    moved: false,
    pointerId: event.pointerId,
  };
  $('#room-plan').setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPlanPointerMove(event) {
  const drag = state.drag;
  if (!drag) return;
  const point = svgPoint(event);
  const dx = point.x - drag.start.x;
  const dy = point.y - drag.start.y;
  if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
  if (!drag.moved) return;

  if (drag.type === 'item') {
    const item = itemById(drag.itemId);
    if (!item) return;
    const snap = event.shiftKey ? 1 : 10;
    const gridX = Math.round((drag.originX + dx) / snap) * snap;
    const gridY = Math.round((drag.originY + dy) / snap) * snap;
    const magnet = snapRect(gridX, gridY, item.width, item.depth, item.rotation, { item: item.id }, item.elevation, item.height);
    const clamp = clampToRoom(magnet.x, magnet.y, item.width, item.depth, item.rotation);
    const nextX = clamp.x;
    const nextY = clamp.y;
    item.pos_x = nextX;
    item.pos_y = nextY;
    if (magnet.elevation !== null) item.elevation = magnet.elevation;
    drag.node.setAttribute('transform', `translate(${nextX - drag.originX} ${nextY - drag.originY})`);
    update3DItemTransform(item);
    const snapped = magnet.snappedX || magnet.snappedY ? ' · accroché' : '';
    setStatus(`Caisson « ${item.name} » · X ${cm(nextX)} cm · Y ${cm(nextY)} cm${snapped}`);
    return;
  }

  if (drag.type === 'appliance') {
    const appliance = applianceById(drag.applianceId);
    if (!appliance) return;
    const snap = event.shiftKey ? 1 : 10;
    const gridX = Math.round((drag.originX + dx) / snap) * snap;
    const gridY = Math.round((drag.originY + dy) / snap) * snap;
    const magnet = snapRect(gridX, gridY, appliance.width, appliance.depth, appliance.rotation, { appliance: appliance.id }, appliance.elevation, appliance.height);
    const attach = snapApplianceToCabinet(appliance, magnet.x, magnet.y);
    let nextX = magnet.x;
    let nextY = magnet.y;
    let attached = false;
    if (attach) {
      nextX = attach.x;
      nextY = attach.y;
      appliance.rotation = attach.rotation;
      attached = true;
    }
    const clamp = clampToRoom(nextX, nextY, appliance.width, appliance.depth, appliance.rotation);
    nextX = clamp.x;
    nextY = clamp.y;
    appliance.pos_x = nextX;
    appliance.pos_y = nextY;
    if (magnet.elevation !== null) appliance.elevation = magnet.elevation;
    drag.node.setAttribute('transform', `translate(${nextX - drag.originX} ${nextY - drag.originY})`);
    update3DApplianceTransform(appliance);
    const snapped = (magnet.snappedX || magnet.snappedY || attached) ? (attached ? ' · attaché au caisson' : ' · accroché') : '';
    setStatus(`Appareil « ${appliance.name} » · X ${cm(nextX)} cm · Y ${cm(nextY)} cm${snapped}`);
    return;
  }

  if (drag.type === 'vertex') {
    const snap = event.shiftKey ? 1 : 10;
    const nextX = Math.round((drag.origin.x + dx) / snap) * snap;
    const nextY = Math.round((drag.origin.y + dy) / snap) * snap;
    drag.circle.setAttribute('cx', nextX);
    drag.circle.setAttribute('cy', nextY);
    drag.lineA.setAttribute('x1', nextX);
    drag.lineA.setAttribute('y1', nextY);
    if (drag.lineB) {
      drag.lineB.setAttribute('x1', nextX);
      drag.lineB.setAttribute('y1', nextY);
    }
    setStatus(`Sommet · X ${cm(nextX)} cm · Y ${cm(nextY)} cm`);
  }
}

async function onPlanPointerUp(event) {
  const drag = state.drag;
  if (!drag) return;
  state.drag = null;
  try {
    $('#room-plan').releasePointerCapture?.(event.pointerId);
  } catch (error) {
    // ignore
  }
  if (!drag.moved) {
    if (drag.type === 'vertex') renderPlan();
    return;
  }
  if (drag.type === 'item') {
    const item = itemById(drag.itemId);
    if (!item) return;
    try {
      const data = await api(`${urls.items}${item.id}/`, {
        pos_x: item.pos_x,
        pos_y: item.pos_y,
        rotation: item.rotation,
        elevation: item.elevation,
      });
      applyPayload(data.payload, { status: data.message });
      toast(data.message);
    } catch (error) {
      toast(error.message, true);
      refresh();
    }
    return;
  }
  if (drag.type === 'appliance') {
    const appliance = applianceById(drag.applianceId);
    if (!appliance) return;
    try {
      const data = await api(`${urls.appliances}${appliance.id}/`, {
        pos_x: appliance.pos_x,
        pos_y: appliance.pos_y,
        rotation: appliance.rotation,
        elevation: appliance.elevation,
      });
      applyPayload(data.payload, { status: data.message });
      toast(data.message);
    } catch (error) {
      toast(error.message, true);
      refresh();
    }
    return;
  }
  if (drag.type === 'vertex') {
    const point = svgPoint(event);
    const snap = event.shiftKey ? 1 : 10;
    const nextX = Math.round(point.x / snap) * snap;
    const nextY = Math.round(point.y / snap) * snap;
    const wall = wallById(drag.wallId);
    if (!wall) return;
    const rows = [
      {
        id: wall.id,
        x1: nextX,
        y1: nextY,
        x2: wall.x2,
        y2: wall.y2,
        height: wall.height,
        thickness: wall.thickness,
      },
    ];
    if (drag.previousId) {
      const previous = wallById(drag.previousId);
      if (previous) {
        rows.push({
          id: previous.id,
          x1: previous.x1,
          y1: previous.y1,
          x2: nextX,
          y2: nextY,
          height: previous.height,
          thickness: previous.thickness,
        });
      }
    }
    try {
      const data = await api(urls.walls, { walls: rows });
      applyPayload(data.payload, { status: data.message });
    } catch (error) {
      toast(error.message, true);
      refresh();
    }
  }
}

// ----------------------------------------------------------------------
// Sélection
// ----------------------------------------------------------------------
function updateSelectionUI() {
  $$('.plan-item').forEach((node) => {
    const selected = Number(node.dataset.itemId) === state.selectedItemId;
    node.classList.toggle('selected', selected);
    const polygon = node.querySelector('polygon');
    if (polygon) {
      polygon.setAttribute('stroke', selected ? '#2078CF' : '#64748b');
      polygon.setAttribute('stroke-width', selected ? 30 : 12);
    }
    const front = node.querySelector('line');
    if (front) {
      front.setAttribute('stroke', selected ? '#2078CF' : '#475467');
      front.setAttribute('stroke-width', selected ? 40 : 25);
    }
  });
  $$('.plan-appliance').forEach((node) => {
    const selected = Number(node.dataset.applianceId) === state.selectedApplianceId;
    node.classList.toggle('selected', selected);
    const polygon = node.querySelector('polygon');
    if (polygon) {
      polygon.setAttribute('stroke', selected ? '#2078CF' : '#475467');
      polygon.setAttribute('stroke-width', selected ? 30 : 14);
    }
  });
  $$('.plan-worktop-explicit').forEach((node) => {
    const selected = Number(node.dataset.worktopId) === state.selectedWorktopId;
    node.classList.toggle('selected', selected);
    node.setAttribute('stroke', selected ? '#2078CF' : '#a89f8f');
    node.setAttribute('stroke-width', selected ? 30 : 12);
    node.setAttribute('stroke-dasharray', selected ? null : '45 28');
  });
  $$('.plan-wall').forEach((node) => {
    node.setAttribute('stroke', Number(node.dataset.wallId) === state.selectedWallId ? '#0f766e' : '#d3ccc0');
  });
  $$('.plan-opening').forEach((node) => {
    node.setAttribute('stroke', Number(node.dataset.openingId) === state.selectedOpeningId ? '#2078CF' : '#94a3b8');
    node.setAttribute('stroke-width', Number(node.dataset.openingId) === state.selectedOpeningId ? 25 : 10);
  });
  renderItemList();
  renderItemProps();
  renderApplianceList();
  renderApplianceProps();
  renderWorktopList();
  renderWorktopProps();
  renderWallProps();
  update3DSelection();
  update3DActionBar();
  window.dispatchEvent(new CustomEvent('poly-room:selection'));
}

function update3DActionBar() {
  const bar = $('#room-3d-actions');
  const label = $('#room-3d-actions-label');
  const editLink = $('#btn-edit-selected');
  if (!bar) return;
  const item = itemById(state.selectedItemId);
  const appliance = applianceById(state.selectedApplianceId);
  if (item) {
    bar.hidden = false;
    label.textContent = item.name;
    if (editLink) {
      editLink.hidden = false;
      editLink.href = (config.editUrl || '/poly/cabinet/0/').replace('/0/', `/${item.cabinet_id}/`);
    }
  } else if (appliance) {
    bar.hidden = false;
    label.textContent = appliance.name;
    if (editLink) editLink.hidden = true;
  } else {
    bar.hidden = true;
    label.textContent = '';
    if (editLink) editLink.hidden = true;
  }
}

function selectItem(id) {
  state.selectedItemId = Number(id);
  state.selectedApplianceId = null;
  state.selectedWorktopId = null;
  state.selectedWallId = null;
  state.selectedOpeningId = null;
  updateSelectionUI();
}

function selectAppliance(id) {
  state.selectedApplianceId = Number(id);
  state.selectedItemId = null;
  state.selectedWorktopId = null;
  state.selectedWallId = null;
  state.selectedOpeningId = null;
  updateSelectionUI();
}

function selectWorktop(id) {
  state.selectedWorktopId = Number(id);
  state.selectedItemId = null;
  state.selectedApplianceId = null;
  state.selectedWallId = null;
  state.selectedOpeningId = null;
  updateSelectionUI();
}

function selectWall(id) {
  state.selectedWallId = Number(id);
  state.selectedItemId = null;
  state.selectedApplianceId = null;
  state.selectedWorktopId = null;
  state.selectedOpeningId = null;
  updateSelectionUI();
}

function selectOpening(id) {
  state.selectedOpeningId = Number(id);
  state.selectedItemId = null;
  state.selectedApplianceId = null;
  state.selectedWorktopId = null;
  state.selectedWallId = null;
  updateSelectionUI();
}

function clearSelection() {
  state.selectedItemId = null;
  state.selectedApplianceId = null;
  state.selectedWorktopId = null;
  state.selectedWallId = null;
  state.selectedOpeningId = null;
  updateSelectionUI();
}

// ----------------------------------------------------------------------
// Actions pièce
// ----------------------------------------------------------------------
async function refresh() {
  try {
    const data = await api(urls.room, null, 'GET');
    applyPayload(data.payload);
  } catch (error) {
    toast(error.message, true);
  }
}

async function addPreset(key, button) {
  if (button) button.disabled = true;
  try {
    const data = await api(urls.items, { preset_key: key });
    applyPayload(data.payload, { status: data.message, selectItemId: data.item_id });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function addAppliancePreset(key, button) {
  if (button) button.disabled = true;
  try {
    const data = await api(urls.appliances, {
      preset_key: key,
      cabinet_id: state.selectedItemId || null,
    });
    applyPayload(data.payload, {
      status: data.message,
      selectApplianceId: data.appliance_id,
    });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function addExistingCabinet() {
  const select = $('#existing-cabinet');
  if (!select.value) return;
  try {
    const data = await api(urls.items, { cabinet_id: Number(select.value) });
    applyPayload(data.payload, { status: data.message, selectItemId: data.item_id });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveRoom(resetWalls = false) {
  if (resetWalls && !await window.polyConfirm('Réinitialiser les murs de la pièce ? Les ouvertures seront supprimées.')) {
    return;
  }
  try {
    const data = await api(urls.roomUpdate, {
      room_type: $('#room-type').value,
      room_width: toMm($('#room-width').value),
      room_depth: toMm($('#room-depth').value),
      room_height: toMm($('#room-height').value),
      wall_thickness: toMm($('#wall-thickness').value),
      worktop_thickness: toMm($('#worktop-thickness').value),
      worktop_overhang: toMm($('#worktop-overhang').value),
      worktop_color: $('#worktop-color').value,
      reset_walls: resetWalls,
    });
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveItem(event) {
  event.preventDefault();
  const item = itemById(state.selectedItemId);
  if (!item) return;
  try {
    const pos_x = toMm($('#item-x').value);
    const pos_y = toMm($('#item-y').value);
    const rotation = Number($('#item-rotation').value) || 0;
    const elevation = toMm($('#item-elevation').value);
    const resolved = resolveOverlaps(
      pos_x, pos_y, item.width, item.depth, rotation,
      { item: item.id }, elevation, item.height
    );
    const data = await api(`${urls.items}${item.id}/`, {
      pos_x: resolved.x,
      pos_y: resolved.y,
      rotation,
      elevation,
    });
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function rotateItem(delta) {
  const item = itemById(state.selectedItemId);
  if (!item) return;
  try {
    const rotation = (Number(item.rotation) + delta + 360) % 360;
    const resolved = resolveOverlaps(
      item.pos_x, item.pos_y, item.width, item.depth, rotation,
      { item: item.id }, item.elevation, item.height
    );
    const data = await api(`${urls.items}${item.id}/`, {
      pos_x: resolved.x,
      pos_y: resolved.y,
      rotation,
      elevation: item.elevation,
    });
    applyPayload(data.payload, { status: `Rotation ${rotation.toFixed(0)}°.` });
  } catch (error) {
    toast(error.message, true);
  }
}

async function confirmDeleteItem(id) {
  const item = itemById(id);
  if (!item) return;
  if (!await window.polyConfirm(`Retirer « ${item.name} » de la pièce ? Le caisson restera dans la bibliothèque.`)) {
    return;
  }
  try {
    const data = await api(`${urls.items}${id}/delete/`, {});
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

function deleteItem() {
  confirmDeleteItem(state.selectedItemId);
}

async function saveAppliance(event) {
  event.preventDefault();
  const appliance = applianceById(state.selectedApplianceId);
  if (!appliance) return;
  try {
    const pos_x = toMm($('#appliance-x').value);
    const pos_y = toMm($('#appliance-y').value);
    const rotation = Number($('#appliance-rotation').value) || 0;
    const elevation = toMm($('#appliance-elevation').value);
    const width = toMm($('#appliance-width').value);
    const depth = toMm($('#appliance-depth').value);
    const height = toMm($('#appliance-height').value);
    const resolved = resolveOverlaps(
      pos_x, pos_y, width, depth, rotation,
      { appliance: appliance.id }, elevation, height
    );
    const data = await api(`${urls.appliances}${appliance.id}/`, {
      pos_x: resolved.x,
      pos_y: resolved.y,
      rotation,
      elevation,
      width,
      depth,
      height,
      price: Number($('#appliance-price').value) || 0,
    });
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function rotateAppliance(delta) {
  const appliance = applianceById(state.selectedApplianceId);
  if (!appliance) return;
  try {
    const rotation = (Number(appliance.rotation) + delta + 360) % 360;
    const resolved = resolveOverlaps(
      appliance.pos_x, appliance.pos_y, appliance.width, appliance.depth, rotation,
      { appliance: appliance.id }, appliance.elevation, appliance.height
    );
    const data = await api(`${urls.appliances}${appliance.id}/`, {
      pos_x: resolved.x,
      pos_y: resolved.y,
      rotation,
      elevation: appliance.elevation,
    });
    applyPayload(data.payload, { status: `Rotation ${rotation.toFixed(0)}°.` });
  } catch (error) {
    toast(error.message, true);
  }
}

async function confirmDeleteAppliance(id) {
  const appliance = applianceById(id);
  if (!appliance) return;
  if (!await window.polyConfirm(`Retirer l'appareil « ${appliance.name} » de la pièce ?`)) {
    return;
  }
  try {
    const data = await api(`${urls.appliances}${id}/delete/`, {});
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

function deleteAppliance() {
  confirmDeleteAppliance(state.selectedApplianceId);
}

async function addWorktop() {
  try {
    const data = await api(urls.worktops, {});
    applyPayload(data.payload, {
      status: data.message,
      selectWorktopId: data.worktop_id,
    });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveWorktop(event) {
  event.preventDefault();
  const worktop = worktopById(state.selectedWorktopId);
  if (!worktop) return;
  try {
    const data = await api(`${urls.worktops}${worktop.id}/`, {
      width: toMm($('#worktop-width').value),
      depth: toMm($('#worktop-depth').value),
      thickness: toMm($('#worktop-thickness').value),
      elevation: toMm($('#worktop-elevation').value),
      pos_x: toMm($('#worktop-x').value),
      pos_y: toMm($('#worktop-y').value),
      rotation: Number($('#worktop-rotation').value) || 0,
      color: $('#worktop-color').value,
    });
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function confirmDeleteWorktop(id) {
  const worktop = worktopById(id);
  if (!worktop) return;
  if (!await window.polyConfirm(`Supprimer « ${worktop.name || 'Plan de travail'} » ?`)) return;
  try {
    const data = await api(`${urls.worktops}${id}/delete/`, {});
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

function deleteWorktop() {
  confirmDeleteWorktop(state.selectedWorktopId);
}

async function saveWall(event) {
  event.preventDefault();
  const wall = wallById(state.selectedWallId);
  if (!wall) return;
  try {
    const data = await api(urls.walls, {
      walls: [
        {
          id: wall.id,
          x1: toMm($('#wall-x1').value),
          y1: toMm($('#wall-y1').value),
          x2: toMm($('#wall-x2').value),
          y2: toMm($('#wall-y2').value),
          height: toMm($('#wall-height').value),
          thickness: toMm($('#wall-thickness-value').value),
        },
      ],
    });
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

// ----------------------------------------------------------------------
// Calculatrice de cote des murs
// ----------------------------------------------------------------------
let dimCalcContext = null;

function evaluateLength(raw) {
  const cleaned = String(raw == null ? '' : raw).trim().replace(',', '.');
  if (!cleaned || !/^[\d\s.+\-*/()]+$/.test(cleaned)) return null;
  try {
    const value = Function(`"use strict"; return (${cleaned});`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value;
  } catch (error) {
    return null;
  }
}

function openDimCalc(wallId) {
  const wall = wallById(wallId);
  const host = $('#dim-calc');
  if (!wall || !host) return;
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  dimCalcContext = wallId;
  $('#dim-calc-title').textContent =
    `Longueur du mur ${wall.name || wall.index + 1}`;
  $('#dim-calc-value').value = cmValue(length);
  host.hidden = false;
  requestAnimationFrame(() => {
    $('#dim-calc-value').focus();
    $('#dim-calc-value').select();
  });
}

function closeDimCalc() {
  const host = $('#dim-calc');
  if (host) host.hidden = true;
  dimCalcContext = null;
}

function adjustDimCalc(step) {
  const input = $('#dim-calc-value');
  const current = evaluateLength(input.value) ?? 0;
  input.value = String(Math.round((current + step) * 10) / 10);
}

async function applyDimCalc() {
  if (dimCalcContext == null) return;
  const value = evaluateLength($('#dim-calc-value').value);
  if (value == null || value <= 0) {
    toast('Valeur invalide : saisissez une longueur en cm (ex. 250 ou 180+40).', true);
    return;
  }
  const wall = wallById(dimCalcContext);
  if (!wall) return;
  const newLength = value * 10;
  const project = state.payload.project;
  const horizontal = Math.abs(wall.y2 - wall.y1) < 1;
  const vertical = Math.abs(wall.x2 - wall.x1) < 1;
  try {
    let data;
    if (horizontal) {
      // Mur horizontal : redimensionne la largeur de la pièce.
      data = await api(urls.roomUpdate, {
        room_type: project.room_type,
        room_width: newLength,
        room_depth: project.room_depth,
        room_height: project.room_height,
      });
    } else if (vertical) {
      // Mur vertical : redimensionne la profondeur de la pièce.
      data = await api(urls.roomUpdate, {
        room_type: project.room_type,
        room_width: project.room_width,
        room_depth: newLength,
        room_height: project.room_height,
      });
    } else {
      // Mur en biais : déplace l'extrémité le long de sa direction.
      const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      const ux = (wall.x2 - wall.x1) / length;
      const uy = (wall.y2 - wall.y1) / length;
      data = await api(urls.walls, {
        walls: [
          {
            id: wall.id,
            x1: wall.x1,
            y1: wall.y1,
            x2: wall.x1 + ux * newLength,
            y2: wall.y1 + uy * newLength,
          },
        ],
      });
    }
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
  closeDimCalc();
}

// ----------------------------------------------------------------------
// Ouvertures
// ----------------------------------------------------------------------
function defaultOpeningValues(kind) {
  if (kind === 'door' || kind === 'passage') {
    return { height: 210, sill: 0 };
  }
  return { height: 120, sill: 90 };
}

function resetOpeningForm() {
  state.editingOpeningId = null;
  $('#opening-id').value = '';
  $('#opening-submit').textContent = 'Ajouter';
  $('#opening-cancel').hidden = true;
  $('#opening-name').value = '';
  $('#opening-kind').value = 'window';
  $('#opening-offset').value = '20';
  const values = defaultOpeningValues('window');
  $('#opening-height').value = String(values.height);
  $('#opening-sill').value = String(values.sill);
  $('#opening-width').value = '90';
  if (state.selectedWallId) {
    $('#opening-wall').value = String(state.selectedWallId);
  }
}

function beginEditOpening(id) {
  const opening = openingById(id);
  if (!opening) return;
  selectOpening(id);
  state.editingOpeningId = id;
  $('#opening-id').value = String(id);
  $('#opening-submit').textContent = 'Mettre à jour';
  $('#opening-cancel').hidden = false;
  $('#opening-wall').value = String(opening.wall_id);
  $('#opening-kind').value = opening.kind;
  $('#opening-name').value = opening.name === opening.kind_label ? '' : opening.name;
  $('#opening-offset').value = cmValue(opening.offset);
  $('#opening-width').value = cmValue(opening.width);
  $('#opening-height').value = cmValue(opening.height);
  $('#opening-sill').value = cmValue(opening.sill);
  $('#opening-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function submitOpening(event) {
  event.preventDefault();
  const body = {
    wall_id: Number($('#opening-wall').value),
    kind: $('#opening-kind').value,
    name: $('#opening-name').value,
    offset: toMm($('#opening-offset').value),
    width: toMm($('#opening-width').value),
    height: toMm($('#opening-height').value),
    sill: toMm($('#opening-sill').value),
  };
  try {
    const data = state.editingOpeningId
      ? await api(`${urls.openings}${state.editingOpeningId}/`, body)
      : await api(urls.openings, body);
    applyPayload(data.payload, { status: data.message });
    resetOpeningForm();
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function deleteOpening(opening) {
  if (!await window.polyConfirm(`Supprimer l'ouverture « ${opening.name} » ?`)) return;
  try {
    const data = await api(`${urls.openings}${opening.id}/delete/`, {});
    applyPayload(data.payload, { status: data.message });
    resetOpeningForm();
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

// ----------------------------------------------------------------------
// Versions / duplication
// ----------------------------------------------------------------------
async function createVersion(event) {
  event.preventDefault();
  try {
    const data = await api(urls.versions, {
      name: $('#version-name').value,
      note: $('#version-note').value,
    });
    applyPayload(data.payload, { status: data.message });
    $('#version-name').value = '';
    $('#version-note').value = '';
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function restoreVersion(version) {
  if (!await window.polyConfirm(`Restaurer la version « ${version.name} » ? L'agencement actuel sera remplacé.`)) {
    return;
  }
  try {
    const data = await api(`${urls.versions}${version.id}/restore/`, {});
    applyPayload(data.payload, { status: data.message });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function duplicateProject() {
  if (!await window.polyConfirm("Dupliquer l'affaire avec la pièce et tous les caissons ?")) return;
  try {
    const data = await api(urls.duplicate, {});
    toast(data.message);
    window.location.href = data.url;
  } catch (error) {
    toast(error.message, true);
  }
}

// ----------------------------------------------------------------------
// Vue 3D
// ----------------------------------------------------------------------
function init3D() {
  const host = $('#room-3d');
  if (!host) return;
  // Transparent: the view shows the editor's deep blue gradient behind the room (#room-3d in app.css).
  three.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  three.renderer.setClearColor(0x000000, 0);
  three.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  three.renderer.shadowMap.enabled = true;
  three.renderer.shadowMap.type = THREE.PCFShadowMap;
  three.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  three.renderer.toneMappingExposure = 1.05;
  host.appendChild(three.renderer.domElement);

  three.scene = new THREE.Scene();
  three.scene.background = null;
  three.camera = new THREE.PerspectiveCamera(42, 1, 10, 200000);
  three.controls = new OrbitControls(three.camera, three.renderer.domElement);
  three.controls.enableDamping = true;
  three.controls.dampingFactor = 0.08;
  three.controls.maxPolarAngle = Math.PI / 2 - 0.02;
  three.controls.minDistance = 1200;
  three.controls.maxDistance = 40000;
  three.controls.target.set(0, 1000, 0);
  // Le clic gauche sélectionne et déplace les meubles/appareils ;
  // l'orbite se fait au clic droit, le zoom à la molette.
  three.controls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  three.controls.touches = {
    ONE: THREE.TOUCH.PAN,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
  };

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc9c2b6, 1.5);
  three.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.65);
  sun.position.set(4200, 6800, 3200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9000;
  sun.shadow.camera.right = 9000;
  sun.shadow.camera.top = 9000;
  sun.shadow.camera.bottom = -9000;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 30000;
  sun.shadow.bias = -0.0005;
  three.scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-3500, 2800, -2400);
  three.scene.add(fill);

  three.roomGroup = new THREE.Group();
  three.itemsGroup = new THREE.Group();
  three.appliancesGroup = new THREE.Group();
  three.worktopsGroup = new THREE.Group();
  three.scene.add(
    three.roomGroup,
    three.itemsGroup,
    three.appliancesGroup,
    three.worktopsGroup
  );
  three.raycaster = new THREE.Raycaster();
  three.pointer = new THREE.Vector2();

  three.renderer.setAnimationLoop(() => {
    if (state.view === 'plan') return;
    three.controls.update();
    updateWallVisibility();
    three.renderer.render(three.scene, three.camera);
  });

  three.resizeObserver = new ResizeObserver(() => resize3D());
  three.resizeObserver.observe(host);
  resize3D();
  fitCamera();

  three.renderer.domElement.addEventListener('pointerdown', on3DPointerDown);
  three.renderer.domElement.addEventListener('pointermove', on3DPointerMove);
  three.renderer.domElement.addEventListener('pointerup', on3DPointerUp);
  three.renderer.domElement.addEventListener('pointercancel', on3DPointerUp);
  window.addEventListener('pointerup', on3DPointerUp);
}

function resize3D() {
  if (!three.renderer) return;
  const host = $('#room-3d');
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;
  three.renderer.setSize(width, height, false);
  three.camera.aspect = width / height;
  three.camera.updateProjectionMatrix();
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    disposeObject(child);
  }
}

function wallMaterial(color = 0xf1ece3) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

function addEdges(parent, mesh, color) {
  const geometry = new THREE.EdgesGeometry(mesh.geometry);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 });
  const edges = new THREE.LineSegments(geometry, material);
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  edges.scale.copy(mesh.scale);
  parent.add(edges);
  return edges;
}

function buildFloor() {
  const walls = state.payload.walls;
  if (walls.length < 3) return;
  const shape = new THREE.Shape();
  shape.moveTo(walls[0].x1, -walls[0].y1);
  for (let index = 1; index < walls.length; index += 1) {
    shape.lineTo(walls[index].x1, -walls[index].y1);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshStandardMaterial({
    color: 0xe8e1d5,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  three.roomGroup.add(mesh);
}

function buildWalls() {
  const walls = state.payload.walls;
  const openings = state.payload.openings;
  const area = walls.reduce(
    (total, wall) => total + wall.x1 * wall.y2 - wall.x2 * wall.y1,
    0
  );
  const orientation = area >= 0 ? 1 : -1;
  walls.forEach((wall) => {
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (length < 1) return;
    const ux = (wall.x2 - wall.x1) / length;
    const uy = (wall.y2 - wall.y1) / length;
    const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
    const thickness = wall.thickness;
    const wallHeight = wall.height;
    const wallOpenings = openings
      .filter((opening) => opening.wall_id === wall.id)
      .sort((a, b) => a.offset - b.offset);

    // Chaque mur est regroupé pour pouvoir le masquer quand la caméra
    // se trouve à l'extérieur : on obtient une vue « maison de poupée ».
    const wallGroup = new THREE.Group();
    wallGroup.userData.wallCenter = new THREE.Vector3(
      (wall.x1 + wall.x2) / 2,
      wallHeight / 2,
      (wall.y1 + wall.y2) / 2
    );
    wallGroup.userData.wallNormal = new THREE.Vector3(
      -uy * orientation,
      0,
      ux * orientation
    );
    three.roomGroup.add(wallGroup);

    const addSegment = (start, end, y0, y1) => {
      const segmentLength = end - start;
      const segmentHeight = y1 - y0;
      if (segmentLength <= 1 || segmentHeight <= 1) return;
      const geometry = new THREE.BoxGeometry(segmentLength, segmentHeight, thickness);
      const mesh = new THREE.Mesh(geometry, wallMaterial());
      const middle = start + segmentLength / 2;
      mesh.position.set(wall.x1 + ux * middle, y0 + segmentHeight / 2, wall.y1 + uy * middle);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wallGroup.add(mesh);
    };

    let cursor = 0;
    wallOpenings.forEach((opening) => {
      const start = Math.max(0, Math.min(Number(opening.offset), length));
      const end = Math.min(length, start + Number(opening.width));
      if (end <= start) return;
      addSegment(cursor, start, 0, wallHeight);
      const sill = Math.max(0, Math.min(Number(opening.sill), wallHeight));
      const top = Math.min(wallHeight, sill + Number(opening.height));
      if (sill > 1) addSegment(start, end, 0, sill);
      if (top < wallHeight - 1) addSegment(start, end, top, wallHeight);

      const middle = start + (end - start) / 2;
      if (opening.kind === 'window') {
        const glassHeight = Math.max(10, top - sill);
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(end - start, glassHeight, 22),
          new THREE.MeshStandardMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.32,
            roughness: 0.1,
            metalness: 0,
          })
        );
        glass.position.set(wall.x1 + ux * middle, sill + glassHeight / 2, wall.y1 + uy * middle);
        glass.rotation.y = -angle;
        wallGroup.add(glass);
        const frame = new THREE.LineSegments(
          new THREE.EdgesGeometry(glass.geometry),
          new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 })
        );
        frame.position.copy(glass.position);
        frame.rotation.copy(glass.rotation);
        wallGroup.add(frame);
      } else {
        const threshold = new THREE.Mesh(
          new THREE.BoxGeometry(end - start, 18, thickness + 24),
          new THREE.MeshStandardMaterial({
            color: opening.kind === 'door' ? 0xd97706 : 0x94a3b8,
            roughness: 0.8,
          })
        );
        threshold.position.set(wall.x1 + ux * middle, 9, wall.y1 + uy * middle);
        threshold.rotation.y = -angle;
        threshold.receiveShadow = true;
        wallGroup.add(threshold);
      }
      cursor = Math.max(cursor, end);
    });
    addSegment(cursor, length, 0, wallHeight);
  });
}

function updateWallVisibility() {
  if (!three.camera) return;
  const camera = three.camera.position;
  three.roomGroup.children.forEach((child) => {
    const center = child.userData.wallCenter;
    const normal = child.userData.wallNormal;
    if (!center || !normal) return;
    const distance =
      (camera.x - center.x) * normal.x + (camera.z - center.z) * normal.z;
    child.visible = distance > 0;
  });
}

function buildItems() {
  state.payload.items.forEach((item) => {
    const group = new THREE.Group();
    group.position.set(item.pos_x, item.elevation, item.pos_y);
    group.rotation.y = -THREE.MathUtils.degToRad(item.rotation);
    group.userData.itemId = item.id;

    const category = item.material_category || 'solid';
    const carcassMaterial = surfaceMaterial(category, item.color, { roughness: 0.7 });
    const carcass = new THREE.Mesh(
      new THREE.BoxGeometry(item.width, item.height, item.depth),
      carcassMaterial
    );
    carcass.position.set(item.width / 2, item.height / 2, item.depth / 2);
    carcass.castShadow = true;
    carcass.receiveShadow = true;
    group.add(carcass);
    addEdges(group, carcass, 0x8f897b);

    const doorMaterial = surfaceMaterial(category, item.color);
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x625c50,
      roughness: 0.6,
      metalness: 0,
    });
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f4752,
      roughness: 0.3,
      metalness: 0.6,
    });

    // Ovens and microwaves built into this cabinet: its doors leave their heights free.
    const builtInRanges = state.payload.appliances
      .filter((a) => a.built_in_item_id === item.id && ['oven', 'microwave'].includes(a.kind))
      .map((a) => [Number(a.elevation) - Number(item.elevation), Number(a.elevation) - Number(item.elevation) + Number(a.height)]);
    const spans = item.has_doors
      ? doorSpans(item.plinth_height, item.height - 4, builtInRanges)
      : [];
    spans.forEach(([spanLow, spanHigh]) => {
      const count = Math.max(1, Math.round(item.width / 600));
      const gap = 4;
      const doorWidth = Math.max(40, (item.width - gap * (count + 1)) / count);
      const doorHeight = Math.max(40, spanHigh - spanLow);
      const doorThickness = 20;
      for (let index = 0; index < count; index += 1) {
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness),
          doorMaterial
        );
        door.position.set(
          gap + doorWidth / 2 + index * (doorWidth + gap),
          spanLow + doorHeight / 2,
          item.depth - doorThickness / 2
        );
        door.castShadow = true;
        group.add(door);
        addEdges(group, door, 0x6f6a5e);

        // Poignée verticale sur le bord intérieur de chaque porte.
        const handleSide = index < count - 1 ? 1 : -1;
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(6, Math.min(180, doorHeight * 0.6), 26),
          handleMaterial
        );
        handle.position.set(
          gap + doorWidth / 2 + index * (doorWidth + gap) + handleSide * (doorWidth / 2 - 26),
          spanLow + doorHeight / 2,
          item.depth + 3
        );
        handle.castShadow = true;
        group.add(handle);
      }

      // Joints sombres entre les portes pour bien distinguer les vantaux.
      for (let index = 1; index < count; index += 1) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(gap, doorHeight - 6, doorThickness + 2),
          frameMaterial
        );
        strip.position.set(
          gap + index * (doorWidth + gap) - gap / 2,
          spanLow + doorHeight / 2,
          item.depth - doorThickness / 2
        );
        group.add(strip);
      }
    });

    if (item.has_drawers) {
      const count = Math.max(1, Math.min(Number(item.drawer_count) || 2, 10));
      const gap = 4;
      const usable = Math.max(20, item.height - item.plinth_height - gap);
      let drawerHeight = Math.max(20, Math.min(Number(item.drawer_height) || 200, usable));
      if (count * drawerHeight + (count + 1) * gap > usable) {
        drawerHeight = Math.max(20, (usable - (count + 1) * gap) / count);
      }
      const drawerThickness = 20;
      for (let index = 0; index < count; index += 1) {
        const y = item.plinth_height + gap + index * (drawerHeight + gap);
        const drawer = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(1, item.width - 2 * gap), drawerHeight, drawerThickness),
          doorMaterial
        );
        drawer.position.set(item.width / 2, y + drawerHeight / 2, item.depth - drawerThickness / 2);
        drawer.castShadow = true;
        group.add(drawer);
        addEdges(group, drawer, 0x6f6a5e);

        // Poignée horizontale au centre de chaque tiroir.
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(Math.min(160, item.width * 0.4), 7, 26),
          handleMaterial
        );
        handle.position.set(item.width / 2, y + drawerHeight / 2, item.depth + 3);
        handle.castShadow = true;
        group.add(handle);

        // Joint sombre sous chaque tiroir.
        if (index < count - 1) {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(1, item.width - 2 * gap), gap, drawerThickness + 2),
            frameMaterial
          );
          strip.position.set(item.width / 2, y + drawerHeight + gap / 2, item.depth - drawerThickness / 2);
          group.add(strip);
        }
      }
    }

    if (item.has_hanging_rail) {
      const railHeight = Math.min(
        Math.max(Number(item.hanging_rail_height) || 1800, 50),
        Math.max(50, item.height - 50)
      );
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(14, 14, Math.max(10, item.width - 60), 14),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.6 })
      );
      rail.rotation.z = Math.PI / 2;
      rail.position.set(item.width / 2, railHeight, item.depth * 0.45);
      group.add(rail);
    }

    if (item.plinth_height > 0) {
      const plinthDepth = 18;
      const setback = 40;
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(item.width - 8, item.plinth_height - 4, plinthDepth),
        new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.85, metalness: 0.02 })
      );
      plinth.position.set(item.width / 2, (item.plinth_height - 4) / 2 + 2, item.depth - setback - plinthDepth / 2);
      plinth.castShadow = true;
      group.add(plinth);
      // Ligne d'ombre sous le caisson (bord supérieur de la plinthe).
      const plinthTop = new THREE.Mesh(
        new THREE.BoxGeometry(item.width, 5, plinthDepth + 6),
        new THREE.MeshStandardMaterial({ color: 0x55503f, roughness: 0.9 })
      );
      plinthTop.position.set(item.width / 2, item.plinth_height + 1, item.depth - setback - plinthDepth / 2);
      group.add(plinthTop);
    }

    const outline = createOutline(item);
    outline.visible = item.id === state.selectedItemId;
    group.add(outline);
    group.userData.outline = outline;
    group.traverse((child) => {
      child.userData.itemId = item.id;
    });
    three.itemsGroup.add(group);
    three.itemGroups.set(item.id, group);
  });
}

function createOutline(item) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(item.width + 30, item.height + 30, item.depth + 30);
  const fill = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x2078cf,
      transparent: true,
      opacity: 0.10,
      depthWrite: false,
    })
  );
  fill.position.set(item.width / 2, item.height / 2, item.depth / 2);
  group.add(fill);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x2078cf })
  );
  edges.position.copy(fill.position);
  group.add(edges);
  return group;
}

function createApplianceOutline(appliance) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(
    appliance.width + 30,
    appliance.height + 30,
    appliance.depth + 30
  );
  const fill = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0x2078cf,
      transparent: true,
      opacity: 0.10,
      depthWrite: false,
    })
  );
  fill.position.set(appliance.width / 2, appliance.height / 2, appliance.depth / 2);
  group.add(fill);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x2078cf })
  );
  edges.position.copy(fill.position);
  group.add(edges);
  return group;
}

function buildWorktops() {
  (state.payload.worktops || []).forEach((worktop) => {
    const corners = worktop.corners || [];
    if (corners.length < 3) return;
    const shape = new THREE.Shape();
    shape.moveTo(corners[0][0], corners[0][1]);
    for (let index = 1; index < corners.length; index += 1) {
      shape.lineTo(corners[index][0], corners[index][1]);
    }
    shape.closePath();
    const thickness = Number(worktop.thickness) || 38;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 1,
    });
    const material = surfaceMaterial(
      worktop.category || 'stone',
      worktop.color || '#d9d2c5',
      { side: THREE.DoubleSide }
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = Number(worktop.surface) || (
      Number(worktop.height) + thickness
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.worktopId = worktop.explicit ? worktop.id : undefined;
    three.worktopsGroup.add(mesh);
    if (worktop.explicit) three.worktopMeshes.push(mesh);
  });
}

function buildAppliances() {
  state.payload.appliances.forEach((appliance) => {
    const group = new THREE.Group();
    group.position.set(appliance.pos_x, appliance.elevation, appliance.pos_y);
    group.rotation.y = -THREE.MathUtils.degToRad(appliance.rotation);
    group.userData.applianceId = appliance.id;

    const builtIn = Boolean(appliance.built_in_item_id);
    const withFront = ['oven', 'microwave'].includes(appliance.kind);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(withFront ? '#9aa1a9' : (appliance.color || '#cbd5e1')),
      roughness: appliance.kind === 'hob' ? 0.28 : withFront ? 0.4 : 0.55,
      metalness: appliance.kind === 'hob' ? 0.35 : withFront ? 0.6 : 0.08,
    });
    // Built into a cabinet, its body is inside the cabinet's: drawing it would only flicker against it.
    if (!builtIn) {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(appliance.width, appliance.height, appliance.depth),
        material
      );
      body.position.set(appliance.width / 2, appliance.height / 2, appliance.depth / 2);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      addEdges(group, body, 0x475467);
    }

    const width = Number(appliance.width) || 0;
    const height = Number(appliance.height) || 0;
    const depth = Number(appliance.depth) || 0;

    if (appliance.kind === 'sink') {
      const basin = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.62, 12, depth * 0.52),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.25, metalness: 0.65 })
      );
      basin.position.set(width / 2, height + 6, depth * 0.5);
      group.add(basin);
      const faucet = new THREE.Mesh(
        new THREE.CylinderGeometry(16, 20, 220, 18),
        new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.85 })
      );
      faucet.position.set(width / 2, height + 110, depth * 0.14);
      faucet.castShadow = true;
      group.add(faucet);
      const spout = new THREE.Mesh(
        new THREE.CylinderGeometry(12, 12, 130, 16),
        faucet.material
      );
      spout.rotation.z = Math.PI / 2;
      spout.position.set(width / 2 + 55, height + 210, depth * 0.14);
      group.add(spout);
    } else if (appliance.kind === 'hob') {
      const burnerMaterial = new THREE.MeshStandardMaterial({
        color: 0x111827, roughness: 0.3, metalness: 0.2,
      });
      [0.3, 0.7].forEach((sx) => {
        [0.3, 0.7].forEach((sz) => {
          const burner = new THREE.Mesh(
            new THREE.CylinderGeometry(Math.min(width, depth) * 0.09, Math.min(width, depth) * 0.09, 4, 24),
            burnerMaterial
          );
          burner.position.set(width * sx, height + 2, depth * sz);
          group.add(burner);
        });
      });
    } else if (appliance.kind === 'hood') {
      const roomHeight = Number(state.payload.project.room_height) || 2500;
      const chimneyHeight = Math.max(120, Math.min(700, roomHeight - appliance.elevation - height));
      const chimney = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.42, chimneyHeight, depth * 0.42),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.5 })
      );
      chimney.position.set(width / 2, height + chimneyHeight / 2, depth * 0.32);
      chimney.castShadow = true;
      group.add(chimney);
    } else if (appliance.kind === 'fridge' && !builtIn) {
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.92, 6, 8),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 })
      );
      divider.position.set(width / 2, height * 0.62, depth + 4);
      group.add(divider);
    } else if (withFront) {
      group.add(applianceFront(appliance.kind, width, height, depth));
    } else if (['dishwasher', 'washing_machine'].includes(appliance.kind)) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.82, height * 0.62, 8),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45 })
      );
      panel.position.set(width / 2, height * 0.4, depth + 4);
      group.add(panel);
      const drum = new THREE.Mesh(
        new THREE.TorusGeometry(Math.min(width, height) * 0.22, 14, 12, 32),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.5 })
      );
      drum.position.set(width / 2, height * 0.42, depth + 9);
      group.add(drum);
    }

    const outline = createApplianceOutline(appliance);
    outline.visible = appliance.id === state.selectedApplianceId;
    group.add(outline);
    group.userData.outline = outline;
    group.traverse((child) => {
      child.userData.applianceId = appliance.id;
    });
    three.appliancesGroup.add(group);
    three.applianceGroups.set(appliance.id, group);
  });
}

function rebuild3D() {
  if (!three.scene) return;
  clearGroup(three.roomGroup);
  clearGroup(three.itemsGroup);
  clearGroup(three.appliancesGroup);
  clearGroup(three.worktopsGroup);
  three.itemGroups.clear();
  three.applianceGroups.clear();
  three.worktopMeshes = [];
  buildFloor();
  buildWalls();
  buildWorktops();
  buildItems();
  buildAppliances();
}

function update3DSelection() {
  three.itemGroups.forEach((group, id) => {
    if (group.userData.outline) {
      group.userData.outline.visible = id === state.selectedItemId;
    }
  });
  three.applianceGroups.forEach((group, id) => {
    if (group.userData.outline) {
      group.userData.outline.visible = id === state.selectedApplianceId;
    }
  });
}

function update3DItemTransform(item) {
  const group = three.itemGroups.get(item.id);
  if (!group) return;
  group.position.set(item.pos_x, item.elevation, item.pos_y);
  group.rotation.y = -THREE.MathUtils.degToRad(item.rotation);
}

function update3DApplianceTransform(appliance) {
  const group = three.applianceGroups.get(appliance.id);
  if (!group) return;
  group.position.set(appliance.pos_x, appliance.elevation, appliance.pos_y);
  group.rotation.y = -THREE.MathUtils.degToRad(appliance.rotation);
}

function fitCamera(scale = 1) {
  if (!three.camera) return;
  const walls = state.payload.walls;
  if (!walls.length) return;
  const xs = walls.flatMap((wall) => [wall.x1, wall.x2]);
  const ys = walls.flatMap((wall) => [wall.y1, wall.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cz = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY, state.payload.project.room_height, 1500);
  const targetY = Math.min(state.payload.project.room_height * 0.35, 1200);
  three.controls.target.set(cx, targetY, cz);
  three.camera.position.set(
    cx + span * 0.72 * scale,
    span * 0.82 * scale,
    cz + span * 1.05 * scale
  );
  three.camera.near = Math.max(10, span / 2000);
  three.camera.far = span * 30;
  three.camera.updateProjectionMatrix();
  three.controls.update();
}

function set3DPointer(event) {
  const rect = three.renderer.domElement.getBoundingClientRect();
  three.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  three.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  three.raycaster.setFromCamera(three.pointer, three.camera);
}

function pick3DObject(event) {
  set3DPointer(event);
  const hits = three.raycaster.intersectObjects(
    [
      ...three.itemsGroup.children,
      ...three.appliancesGroup.children,
      ...three.worktopsGroup.children,
    ],
    true
  );
  for (const hit of hits) {
    let node = hit.object;
    while (
      node
      && node.userData.itemId === undefined
      && node.userData.applianceId === undefined
      && node.userData.worktopId === undefined
    ) {
      node = node.parent;
    }
    if (!node) continue;
    if (node.userData.applianceId !== undefined) {
      return { type: 'appliance', id: node.userData.applianceId };
    }
    if (node.userData.itemId !== undefined) {
      return { type: 'item', id: node.userData.itemId };
    }
    if (node.userData.worktopId !== undefined) {
      return { type: 'worktop', id: node.userData.worktopId };
    }
  }
  return null;
}

function groundIntersection(event, elevation) {
  set3DPointer(event);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation);
  const point = new THREE.Vector3();
  if (three.raycaster.ray.intersectPlane(plane, point)) {
    return { x: point.x, z: point.z };
  }
  return null;
}

function on3DPointerDown(event) {
  if (event.button !== 0) return;
  three.down = { x: event.clientX, y: event.clientY };
  three.pending = null;
  const target = pick3DObject(event);
  if (target) {
    three.pending = {
      type: target.type,
      id: target.id,
      startX: event.clientX,
      startY: event.clientY,
    };
    three.renderer.domElement.setPointerCapture?.(event.pointerId);
  }
}

function on3DPointerMove(event) {
  if (!three.pending && !three.drag) return;
  if (!three.drag) {
    const dx = event.clientX - three.pending.startX;
    const dy = event.clientY - three.pending.startY;
    if (Math.hypot(dx, dy) < 5) return;
  }

  if (!three.drag) {
    if (three.pending.type === 'worktop') return;
    const item = three.pending.type === 'item' ? itemById(three.pending.id) : null;
    const appliance = three.pending.type === 'appliance' ? applianceById(three.pending.id) : null;
    const elevation = item ? item.elevation : (appliance ? appliance.elevation : 0);
    const start = groundIntersection(
      { clientX: three.pending.startX, clientY: three.pending.startY },
      elevation
    );
    if (!start) return;
    three.drag = {
      type: three.pending.type,
      id: three.pending.id,
      elevation,
      startX: item ? item.pos_x : appliance.pos_x,
      startZ: item ? item.pos_y : appliance.pos_y,
      groundX: start.x,
      groundZ: start.z,
    };
    three.pending = null;
    if (item) selectItem(item.id);
    else if (appliance) selectAppliance(appliance.id);
    three.renderer.domElement.style.cursor = 'grabbing';
    return;
  }

  const point = groundIntersection(event, three.drag.elevation);
  if (!point) return;
  const x = three.drag.startX + (point.x - three.drag.groundX);
  const z = three.drag.startZ + (point.z - three.drag.groundZ);
  let snapped = false;
  if (three.drag.type === 'item') {
    const item = itemById(three.drag.id);
    if (item) {
      const magnet = snapRect(x, z, item.width, item.depth, item.rotation, { item: item.id }, item.elevation, item.height);
      const clamp = clampToRoom(magnet.x, magnet.y, item.width, item.depth, item.rotation);
      item.pos_x = clamp.x;
      item.pos_y = clamp.y;
      if (magnet.elevation !== null) item.elevation = magnet.elevation;
      snapped = magnet.snappedX || magnet.snappedY;
      update3DItemTransform(item);
    }
  } else {
    const appliance = applianceById(three.drag.id);
    if (appliance) {
      const magnet = snapRect(x, z, appliance.width, appliance.depth, appliance.rotation, { appliance: appliance.id }, appliance.elevation, appliance.height);
      const attach = snapApplianceToCabinet(appliance, magnet.x, magnet.y);
      if (attach) {
        appliance.pos_x = attach.x;
        appliance.pos_y = attach.y;
        appliance.rotation = attach.rotation;
        snapped = true;
      } else {
        appliance.pos_x = magnet.x;
        appliance.pos_y = magnet.y;
        snapped = magnet.snappedX || magnet.snappedY;
      }
      const clamp = clampToRoom(appliance.pos_x, appliance.pos_y, appliance.width, appliance.depth, appliance.rotation);
      appliance.pos_x = clamp.x;
      appliance.pos_y = clamp.y;
      if (magnet.elevation !== null) appliance.elevation = magnet.elevation;
      update3DApplianceTransform(appliance);
    }
  }
  const moved = three.drag.type === 'item'
    ? itemById(three.drag.id)
    : applianceById(three.drag.id);
  setStatus(`Déplacement… ${cm(moved ? moved.pos_x : x)} × ${cm(moved ? moved.pos_y : z)} cm${snapped ? ' · accroché' : ''}`);
}

async function on3DPointerUp(event) {
  const drag = three.drag;
  const pending = three.pending;
  three.drag = null;
  three.pending = null;
  three.down = null;
  three.renderer.domElement.style.cursor = '';
  three.renderer.domElement.releasePointerCapture?.(event.pointerId);

  if (drag) {
    await commit3DDrag(drag);
    return;
  }
  if (pending) {
    if (pending.type === 'item') selectItem(pending.id);
    else if (pending.type === 'appliance') selectAppliance(pending.id);
    else if (pending.type === 'worktop') selectWorktop(pending.id);
  }
}

async function commit3DDrag(drag) {
  const isItem = drag.type === 'item';
  const target = isItem ? itemById(drag.id) : applianceById(drag.id);
  if (!target) return;
  const url = isItem ? `${urls.items}${drag.id}/` : `${urls.appliances}${drag.id}/`;
  try {
    const data = await api(url, {
      pos_x: target.pos_x,
      pos_y: target.pos_y,
      rotation: target.rotation,
      elevation: target.elevation,
    });
    applyPayload(data.payload, {
      status: data.message,
      [isItem ? 'selectItemId' : 'selectApplianceId']: drag.id,
    });
    toast(data.message);
  } catch (error) {
    toast(error.message, true);
    refresh();
  }
}

function setView(view) {
  state.view = view;
  $$('.room-view-tabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  $('#plan-view').hidden = view === '3d';
  $('#view3d-view').hidden = view === 'plan';
  document.querySelector('.room-stage')?.classList.toggle('is-split', view === 'split');
  if (view === 'split') {
    requestAnimationFrame(() => {
      resize3D();
      renderPlan();
      if (!three.camera.position.length()) fitCamera();
    });
  }
  if (view === '3d') {
    resize3D();
    if (!three.camera.position.length()) fitCamera();
    $('#room-hint').textContent = 'Glissez un caisson ou un appareil pour le déplacer · clic droit pour tourner · molette pour zoomer · Suppr pour retirer';
  } else {
    $('#room-hint').textContent = 'Glissez un caisson ou un appareil pour le déplacer · glissez un sommet pour modifier un mur';
  }
}

function setPresentation(active) {
  const bar = $('#presentation-bar');
  if (!bar) return;
  document.body.classList.toggle('room-presentation', active);
  bar.hidden = !active;
  const url = new URL(window.location.href);
  if (active) url.searchParams.set('presentation', '1');
  else url.searchParams.delete('presentation');
  window.history.replaceState({}, '', url);
  if (active) {
    setView('3d');
    requestAnimationFrame(() => {
      resize3D();
      fitCamera(1.45);
      three.controls.update();
    });
    return;
  }
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  requestAnimationFrame(() => resize3D());
}

async function togglePresentationFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (!document.documentElement.requestFullscreen) {
      toast("Le plein écran n'est pas disponible dans ce navigateur.", true);
      return;
    }
    await document.documentElement.requestFullscreen();
  } catch (error) {
    toast("Le plein écran n'a pas pu être activé.", true);
  }
}

// ----------------------------------------------------------------------
// Écouteurs
// ----------------------------------------------------------------------
function bindEvents() {
  $('#room-form').addEventListener('submit', (event) => {
    event.preventDefault();
    saveRoom(false);
  });
  $('#btn-reset-room').addEventListener('click', () => saveRoom(true));
  $('#room-type').addEventListener('change', (event) => {
    state.libraryCategory = event.target.value === 'dressing' ? 'dressing' : 'kitchen';
    $$('.room-lib-tabs button').forEach((button) => {
      button.classList.toggle('active', button.dataset.category === state.libraryCategory);
    });
    renderPresets();
  });

  $$('.room-lib-tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      state.libraryCategory = button.dataset.category;
      $$('.room-lib-tabs button').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === button);
      });
      renderPresets();
    });
  });

  $('#btn-add-existing').addEventListener('click', addExistingCabinet);

  $('#opening-form').addEventListener('submit', submitOpening);
  $('#opening-cancel').addEventListener('click', () => {
    resetOpeningForm();
    clearSelection();
  });
  $('#opening-kind').addEventListener('change', (event) => {
    if (state.editingOpeningId) return;
    const values = defaultOpeningValues(event.target.value);
    $('#opening-height').value = String(values.height);
    $('#opening-sill').value = String(values.sill);
  });

  $('#item-form').addEventListener('submit', saveItem);
  $('#item-rotate-left').addEventListener('click', () => rotateItem(-90));
  $('#item-rotate-right').addEventListener('click', () => rotateItem(90));
  $('#item-delete').addEventListener('click', deleteItem);
  $('#appliance-form').addEventListener('submit', saveAppliance);
  $('#appliance-rotate-left').addEventListener('click', () => rotateAppliance(-90));
  $('#appliance-rotate-right').addEventListener('click', () => rotateAppliance(90));
  $('#appliance-delete').addEventListener('click', deleteAppliance);
  $('#worktop-form').addEventListener('submit', saveWorktop);
  $('#worktop-delete').addEventListener('click', deleteWorktop);
  $('#btn-add-worktop').addEventListener('click', addWorktop);
  $('#wall-form').addEventListener('submit', saveWall);
  $('#dim-calc-apply').addEventListener('click', applyDimCalc);
  $('#dim-calc-cancel').addEventListener('click', closeDimCalc);
  $('#dim-calc-close').addEventListener('click', closeDimCalc);
  $$('.dim-calc-pad button').forEach((button) => {
    button.addEventListener('click', () => adjustDimCalc(Number(button.dataset.step)));
  });
  $('#dim-calc-value').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') applyDimCalc();
    else if (event.key === 'Escape') closeDimCalc();
  });
  $('#dim-calc').addEventListener('click', (event) => {
    if (event.target === $('#dim-calc')) closeDimCalc();
  });
  $('#version-form').addEventListener('submit', createVersion);
  $('#btn-duplicate').addEventListener('click', duplicateProject);

  $('#btn-rotate-left-3d').addEventListener('click', () => {
    if (state.selectedItemId) rotateItem(-90);
    else if (state.selectedApplianceId) rotateAppliance(-90);
  });
  $('#btn-rotate-right-3d').addEventListener('click', () => {
    if (state.selectedItemId) rotateItem(90);
    else if (state.selectedApplianceId) rotateAppliance(90);
  });
  $('#btn-delete-selected').addEventListener('click', () => {
    if (state.selectedItemId) deleteItem();
    else if (state.selectedApplianceId) deleteAppliance();
  });

  $$('.room-view-tabs button').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  $('#btn-fit').addEventListener('click', () => {
    if (state.view !== 'plan') fitCamera();
    if (state.view !== '3d') renderPlan();
  });
  $('#btn-presentation').addEventListener('click', () => setPresentation(true));
  $('#presentation-exit').addEventListener('click', () => setPresentation(false));
  $('#presentation-fit').addEventListener('click', () => {
    if (state.view === '3d') fitCamera(1.45);
    else renderPlan();
  });
  $('#presentation-fullscreen').addEventListener(
    'click',
    togglePresentationFullscreen
  );
  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape'
      && document.body.classList.contains('room-presentation')
      && !document.fullscreenElement
    ) {
      setPresentation(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const tag = (event.target?.tagName || '').toLowerCase();
    if (event.target?.isContentEditable || ['input', 'textarea', 'select'].includes(tag)) {
      return;
    }
    if (state.selectedItemId) deleteItem();
    else if (state.selectedApplianceId) deleteAppliance();
  });
  document.addEventListener('fullscreenchange', () => {
    const button = $('#presentation-fullscreen');
    if (button) {
      button.textContent = document.fullscreenElement
        ? 'Quitter le plein écran'
        : 'Plein écran';
    }
  });
}

// ----------------------------------------------------------------------
// Démarrage
// ----------------------------------------------------------------------
// The editor's parts that the layout of the page (room_layout.js) works with.
window.__polyRoom = {
  state, urls, config, api, applyPayload, setView, renderPlan, resize3D, fitCamera, clearSelection, toast, svgPoint,
  rotateItem, rotateAppliance, deleteItem, deleteAppliance, deleteWorktop, beginEditOpening, deleteOpening, openingById,
  itemById, applianceById, setStatus,
};

bindEvents();
init3D();
applyPayload(state.payload);
setView('plan');
if (new URLSearchParams(window.location.search).get('presentation') === '1') {
  setPresentation(true);
}
