import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { renderPhoto } from './photo_render.js';

/* ------------------------------------------------------------------ */
/* État                                                               */
/* ------------------------------------------------------------------ */
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';
const cabinetId = Number(document.querySelector('.editor-shell')?.dataset.cabinetId);
// Where the cabinet API is mounted (/poly/api/cabinets/ in poly_3D).
const API_ROOT = document.querySelector('.editor-shell')?.dataset.apiRoot || '/api/cabinets/';
const initialScene = JSON.parse(document.getElementById('initial-scene').textContent);
const DISPLAY_STORAGE_KEY = `ploy3d:display:${cabinetId}`;
const SELECT_BLUE = 0x2078cf;
const SELECT_FILL = 0x2078cf;
const PARTITION_SELECT = 0xf59e0b;
const PARTITION_EMISSIVE = 0x92400e;
const MEASURE_FIRST = 0x2078cf;
const MEASURE_SECOND = 0xfbbf24;
const MEASURE_LINE = 0xfacc15;

/* Curseur flèche à pointe très fine (précision des points) — PNG via canvas,
   car les curseurs SVG en data-URI sont rejetés par certains navigateurs. */
function buildFineArrowCursor() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 22;
    canvas.height = 24;
    const ctx = canvas.getContext('2d');
    // réticule bleu centré sur la pointe (3, 3)
    ctx.strokeStyle = 'rgba(32, 120, 207, 0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0.5, 3.5);
    ctx.lineTo(6.5, 3.5);
    ctx.moveTo(3.5, 0.5);
    ctx.lineTo(3.5, 6.5);
    ctx.stroke();
    // flèche fine à pointe effilée
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.lineTo(3, 17);
    ctx.lineTo(6.5, 13.5);
    ctx.lineTo(8.7, 19);
    ctx.lineTo(11.2, 17.9);
    ctx.lineTo(9, 12.5);
    ctx.lineTo(14, 12.5);
    ctx.closePath();
    ctx.fillStyle = '#12212f';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.1;
    ctx.lineJoin = 'round';
    ctx.fill();
    ctx.stroke();
    return `url(${canvas.toDataURL('image/png')}) 3 3, default`;
  } catch {
    return 'crosshair';
  }
}
const FINE_ARROW_CURSOR = buildFineArrowCursor();

let sceneData = initialScene;
let selectedVolumeId = null;
let selectedComponentId = null;
let selectedComponentIds = new Set();
let collapsedVolumeIds = new Set();
let cabinetCollapsed = false;
let selectedCarcassSide = null;
let activeTool = 'split';
// With these tools, a single click on a niche chooses it (no double-click needed).
const NICHE_CLICK_TOOLS = ['split', 'side', 'shelf'];
let splitToolMode = 'single'; // single | grid
let shelfColumnValue = null;
let shelfToolMode = 'single'; // single | series
let sideToolMode = 'single'; // single | series
let moveSource = null; // { rootId, componentId, volumeId, label, count }
let moveMode = 'move'; // move | copy
let moveScope = 'series'; // series | single
let historyEntries = [];
let partitionShelfIds = [];
let partitionEdge = null; // 'bottom' | 'top' : limite sur le dessous/dessus de la niche
let measureMode = 'edge'; // face | edge | point
let measurePicks = [];
let measureResult = null;
let measureLabelAnchor = null;
let calcTarget = null;
let calcObserver = null;
let showDoors = false;
let showVolumes = false;
let showEdges = true;
let showCarcass = true;
let showBack = true;
let showShelves = true;
let showDividers = true;
let showExternal = true;
let displayMode = 'solid'; // solid | xray
let cabinetHidden = false;
let hiddenVolumeIds = new Set();
let hiddenComponentIds = new Set();
let volumeById = new Map((initialScene.volumes || []).map((volume) => [volume.id, volume]));
let syncDisplayUI = () => {};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/* ------------------------------------------------------------------ */
/* Utilitaires                                                        */
/* ------------------------------------------------------------------ */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Jeu minimal laissé sous et sur une étagère, la règle du serveur (CabinetDesignService.MIN_BAY, services.py) :
 * l'éditeur ne propose que les hauteurs qu'il accepte.
 */
const SHELF_MIN_GAP = 50;

function fmt(value, digits = 1) {
  return Number((value || 0) / 10).toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(value, digits = 0) {
  return Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function money(value) {
  return `${Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function isKindVisible(kind) {
  if (kind === 'door' || kind === 'drawer') return showDoors;
  if (kind === 'carcass') return showCarcass;
  if (kind === 'back') return showBack;
  if (kind === 'shelf') return showShelves;
  if (kind === 'divider') return showDividers;
  if (kind === 'volume') return true;
  if (['plinth', 'foot', 'base', 'skirt'].includes(kind)) return showExternal;
  return true;
}

function currentComponent() {
  return (sceneData.components || []).find((component) => component.id === selectedComponentId) || null;
}

function selectedComponents() {
  return (sceneData.components || []).filter(
    (component) => selectedComponentIds.has(component.id),
  );
}

function clearComponentSelection() {
  selectedComponentIds = new Set();
  selectedComponentId = null;
}

function setComponentSelection(ids, primary = null) {
  selectedComponentIds = new Set(ids);
  if (primary !== null && selectedComponentIds.has(primary)) {
    selectedComponentId = primary;
  } else if (selectedComponentIds.size) {
    selectedComponentId = [...selectedComponentIds][selectedComponentIds.size - 1];
  } else {
    selectedComponentId = null;
  }
}

function toggleComponentSelection(componentId) {
  const next = new Set(selectedComponentIds);
  if (next.has(componentId)) {
    next.delete(componentId);
  } else {
    next.add(componentId);
  }
  selectedComponentIds = next;
  if (next.has(componentId)) {
    selectedComponentId = componentId;
  } else if (next.size) {
    selectedComponentId = [...next][next.size - 1];
  } else {
    selectedComponentId = null;
  }
}

function isComponentSelected(componentId) {
  return Boolean(componentId && selectedComponentIds.has(componentId));
}

function componentVisibilityKind(component) {
  return component?.type === 'shelf' ? 'shelf' : 'divider';
}

function rebuildVolumeIndex() {
  volumeById = new Map((sceneData.volumes || []).map((volume) => [volume.id, volume]));
}

function isVolumeHidden(volumeId) {
  if (cabinetHidden) return true;
  if (!volumeId) return false;
  let current = volumeById.get(volumeId);
  const seen = new Set();
  while (current) {
    if (hiddenVolumeIds.has(current.id)) return true;
    if (!current.parent_id || seen.has(current.id)) return false;
    seen.add(current.id);
    current = volumeById.get(current.parent_id);
  }
  return false;
}

function isBoxHidden(box) {
  if (cabinetHidden) return true;
  if (box.component_id && hiddenComponentIds.has(box.component_id)) return true;
  if (box.volume_id && isVolumeHidden(box.volume_id)) return true;
  return false;
}

function loadDisplayPrefs() {
  if (!Number.isFinite(cabinetId)) return;
  try {
    const saved = JSON.parse(window.localStorage.getItem(DISPLAY_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return;
    const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
    showDoors = bool(saved.showDoors, showDoors);
    showVolumes = bool(saved.showVolumes, showVolumes);
    showEdges = bool(saved.showEdges, showEdges);
    showCarcass = bool(saved.showCarcass, showCarcass);
    showBack = bool(saved.showBack, showBack);
    showShelves = bool(saved.showShelves, showShelves);
    showDividers = bool(saved.showDividers, showDividers);
    showExternal = bool(saved.showExternal, showExternal);
    if (saved.displayMode === 'solid' || saved.displayMode === 'xray') {
      displayMode = saved.displayMode;
    }
    cabinetHidden = bool(saved.cabinetHidden, false);
    const idSet = (value) => new Set(
      Array.isArray(value)
        ? value.map(Number).filter((id) => Number.isFinite(id))
        : [],
    );
    hiddenVolumeIds = idSet(saved.hiddenVolumeIds);
    hiddenComponentIds = idSet(saved.hiddenComponentIds);
  } catch {
    // Stockage indisponible (navigation privée, quota...) : on garde les défauts.
  }
}

function saveDisplayPrefs() {
  if (!Number.isFinite(cabinetId)) return;
  try {
    window.localStorage.setItem(
      DISPLAY_STORAGE_KEY,
      JSON.stringify({
        showDoors,
        showVolumes,
        showEdges,
        showCarcass,
        showBack,
        showShelves,
        showDividers,
        showExternal,
        displayMode,
        cabinetHidden,
        hiddenVolumeIds: Array.from(hiddenVolumeIds),
        hiddenComponentIds: Array.from(hiddenComponentIds),
      }),
    );
  } catch {
    // Le rendu reste fonctionnel même si les préférences ne sont pas mémorisées.
  }
}

function toast(message, isError = false) {
  const host = $('#toast-host');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`;
  node.textContent = message;
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  const duration = isError ? 5200 : (message.length > 80 ? 4500 : 2800);
  window.setTimeout(() => {
    node.classList.remove('show');
    window.setTimeout(() => node.remove(), 250);
  }, duration);
}

function setBusy(busy) {
  $$('.editor-shell button').forEach((button) => {
    if (button.dataset.keepEnabled === 'true') return;
    if (busy) {
      if (!button.disabled) button.dataset.busyDisabled = 'true';
      button.disabled = true;
    } else if (button.dataset.busyDisabled === 'true') {
      delete button.dataset.busyDisabled;
      button.disabled = false;
    }
  });
  const loading = $('#viewport-loading');
  if (loading) loading.hidden = !busy;
  // Après une opération, les contrôles désactivés par la scène (par exemple
  // une séparation incomplète) doivent retrouver leur état logique : setBusy a
  // pu les réactiver en les croyant simplement occupés.
  if (!busy) updateToolBounds();
}

async function api(path, options = {}) {
  const response = await fetch(`${API_ROOT}${cabinetId}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken,
      ...(options.headers || {}),
    },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Réponse invalide du serveur (HTTP ${response.status}).`);
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Erreur HTTP ${response.status}.`);
  }
  return data;
}

function applyScene(nextScene, message = '') {
  sceneData = nextScene;  rebuildVolumeIndex();
  const validVolumeIds = new Set(volumeById.keys());
  const validComponentIds = new Set((nextScene.components || []).map((component) => component.id));
  const validShelfIds = new Set(
    (nextScene.components || []).filter((component) => componentIsShelf(component)).map((component) => component.id),
  );
  hiddenVolumeIds = new Set([...hiddenVolumeIds].filter((id) => validVolumeIds.has(id)));
  hiddenComponentIds = new Set([...hiddenComponentIds].filter((id) => validComponentIds.has(id)));
  partitionShelfIds = activeTool === 'partition'
    ? partitionShelfIds.filter((id) => validShelfIds.has(id))
    : [];
  if (activeTool !== 'partition') partitionEdge = null;
  clearMeasurement();
  const volumes = nextScene.volumes || [];
  if (!volumes.some((volume) => volume.id === selectedVolumeId)) {
    const root = volumes.find((volume) => volume.is_root);
    selectedVolumeId = root ? root.id : (volumes[0]?.id ?? null);
  }
  if (selectedComponentIds.size) {
    selectedComponentIds = new Set(
      [...selectedComponentIds].filter((id) => validComponentIds.has(id)),
    );
  }
  if (selectedComponentId) {
    const component = (nextScene.components || []).find((c) => c.id === selectedComponentId);
    if (!component || !isKindVisible(componentVisibilityKind(component))) {
      selectedComponentId = null;
    }
  }
  if (!selectedComponentId && selectedComponentIds.size) {
    selectedComponentId = [...selectedComponentIds][selectedComponentIds.size - 1];
  }
  if (moveSource) {
    const rootOk = validVolumeIds.has(moveSource.rootId);
    const componentOk = !moveSource.componentId
      || validComponentIds.has(moveSource.componentId);
    if (!rootOk || !componentOk) moveSource = null;
  }
  updateHeader();
  renderTree();
  renderSelection();
  renderCutlist();
  renderQuote();
  renderWarnings();
  renderSketch();
  syncCabinetForm();
  syncPlinthForm();
  syncDisplayUI();
  updateToolBounds();
  render3D();
  syncHistoryButtons();
  const state = $('#save-state');
  if (state) state.textContent = `Synchronisé à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  if (message) toast(message);
}

function syncHistoryButtons() {
  const history = sceneData.history || {};
  const undoButton = $('#btn-undo');
  const redoButton = $('#btn-redo');
  if (undoButton) {
    undoButton.disabled = !history.can_undo;
    undoButton.title = history.can_undo
      ? `Annuler${history.undo_label ? ` : ${history.undo_label}` : ''} (Ctrl+Z)`
      : 'Rien à annuler';
  }
  if (redoButton) {
    redoButton.disabled = !history.can_redo;
    redoButton.title = history.can_redo
      ? `Rétablir${history.redo_label ? ` : ${history.redo_label}` : ''} (Ctrl+Shift+Z)`
      : 'Rien à rétablir';
  }
}

async function undoAction() {
  if (!sceneData.history?.can_undo) return;
  setBusy(true);
  try {
    const data = await api('/undo/', { method: 'POST' });
    applyScene(data.scene, data.message);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function redoAction() {
  if (!sceneData.history?.can_redo) return;
  setBusy(true);
  try {
    const data = await api('/redo/', { method: 'POST' });
    applyScene(data.scene, data.message);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(false);
  }
}

function bindHistory() {
  const undoButton = $('#btn-undo');
  const redoButton = $('#btn-redo');
  if (undoButton) undoButton.addEventListener('click', undoAction);
  if (redoButton) redoButton.addEventListener('click', redoAction);
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target && (
      target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT'
      || target.isContentEditable
    );
    if (typing) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;
    const key = String(event.key || '').toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redoAction();
      } else {
        undoAction();
      }
    } else if (key === 'y') {
      event.preventDefault();
      redoAction();
    }
  });
}

function historyDateLabel(entry) {
  try {
    return new Date(entry.created_at).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function historyEntryDetail(entry) {
  const params = entry.params || {};
  if (entry.action !== 'api_compartment_grid') return '';
  const columns = Number(params.columns || 0);
  const rows = Number(params.rows || 0);
  if (!columns && !rows) return '';
  return `${columns} colonne${columns > 1 ? 's' : ''} × ${rows || 1} rangée${rows > 1 ? 's' : ''}`;
}

function renderHistoryList() {
  const host = $('#history-list');
  if (!host) return;
  if (!historyEntries.length) {
    host.innerHTML = '<div class="history-empty">Aucune opération enregistrée.</div>';
    return;
  }
  host.innerHTML = historyEntries
    .map((entry) => {
      const isGrid = entry.action === 'api_compartment_grid';
      const detail = historyEntryDetail(entry);
      return `<div class="history-entry">
        <span class="history-step">${entry.step}</span>
        <div class="history-info">
          <strong>${escapeHtml(entry.message || 'Opération')}</strong>
          <span>${escapeHtml(historyDateLabel(entry))}${detail ? ` · ${escapeHtml(detail)}` : ''}</span>
        </div>
        <div class="history-actions">
          ${isGrid ? `<button type="button" class="btn btn-sm btn-primary" data-history-edit-grid="${entry.id}">Modifier la grille</button>` : ''}
          <button type="button" class="btn btn-sm" data-history-rollback="${entry.id}">Revenir avant</button>
        </div>
      </div>`;
    })
    .join('');
}

async function openHistory() {
  const modal = $('#history-modal');
  const list = $('#history-list');
  if (!modal) return;
  modal.hidden = false;
  if (list) list.innerHTML = 'Chargement…';
  try {
    const data = await api('/history/');
    historyEntries = data.entries || [];
    renderHistoryList();
  } catch (error) {
    if (list) list.innerHTML = `<div class="history-empty">${escapeHtml(error.message)}</div>`;
  }
}

function closeHistory() {
  const modal = $('#history-modal');
  if (modal) modal.hidden = true;
}

async function doHistoryRollback(entryId) {
  const data = await api(`/history/${entryId}/rollback/`, { method: 'POST' });
  applyScene(data.scene, data.message);
  closeHistory();
  return data;
}

async function rollbackHistoryEntry(entryId) {
  if (!await window.polyConfirm('Revenir juste avant cette opération ? Les opérations suivantes seront retirées de l’historique.')) {
    return;
  }
  setBusy(true);
  try {
    await doHistoryRollback(entryId);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(false);
  }
}

function prefillGridFromHistory(entry) {
  const params = entry.params || {};
  const columns = Math.max(2, Math.min(8, Math.round(Number(params.columns) || 2)));
  const rows = Math.max(1, Math.min(8, Math.round(Number(params.rows) || 1)));
  if (params.volume_id) {
    selectedVolumeId = Number(params.volume_id);
    clearComponentSelection();
  }
  activateRightTab('tools');
  activateTool('split');
  setSplitToolMode('grid');
  const columnsInput = $('#grid-columns');
  const rowsInput = $('#grid-rows');
  const widthsInput = $('#grid-column-widths');
  const heightsInput = $('#grid-row-heights');
  const topRow = $('#grid-top-row');
  const topHeight = $('#grid-top-height');
  if (columnsInput) columnsInput.value = String(columns);
  if (rowsInput) rowsInput.value = String(rows);
  if (widthsInput) widthsInput.value = params.column_widths ? String(params.column_widths) : '';
  if (heightsInput) heightsInput.value = params.row_heights ? String(params.row_heights) : '';
  const topValue = params.top_row_height;
  const hasTop = topValue !== undefined && topValue !== null && topValue !== '';
  if (topRow) topRow.checked = hasTop;
  if (topHeight) {
    topHeight.value = hasTop
      ? String(Math.round((Number(topValue) / 10) * 10) / 10)
      : '30';
  }
  syncCompartmentGrid();
  renderTree();
  renderSelection();
  render3D();
  columnsInput?.focus();
  toast('Grille pré-remplie : modifiez le nombre de colonnes puis cliquez sur « Créer les compartiments ».');
}

async function editGridFromHistory(entryId) {
  const entry = historyEntries.find((item) => item.id === entryId);
  if (!entry) return;
  const detail = historyEntryDetail(entry);
  const label = detail ? ` (${detail})` : '';
  if (!await window.polyConfirm(`Modifier cette grille${label} ? Les opérations suivantes seront retirées de l’historique.`)) {
    return;
  }
  setBusy(true);
  try {
    await doHistoryRollback(entryId);
    prefillGridFromHistory(entry);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(false);
  }
}

function bindHistoryModal() {
  const openButton = $('#btn-history');
  const closeButton = $('#history-close');
  const modal = $('#history-modal');
  const list = $('#history-list');
  if (openButton) openButton.addEventListener('click', openHistory);
  if (closeButton) closeButton.addEventListener('click', closeHistory);
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeHistory();
    });
  }
  if (list) {
    list.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-history-edit-grid]');
      if (editButton) {
        editGridFromHistory(Number(editButton.dataset.historyEditGrid));
        return;
      }
      const rollbackButton = event.target.closest('[data-history-rollback]');
      if (rollbackButton) {
        rollbackHistoryEntry(Number(rollbackButton.dataset.historyRollback));
      }
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) {
      closeHistory();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Calculatrice de mesures                                             */
/* ------------------------------------------------------------------ */
const CALC_EXCLUDED_IDS = new Set([
  'grid-columns',
  'grid-rows',
  'side-count',
  'shelf-count',
  'cab-waste',
  'quote-margin',
  'quote-tax',
]);

function calculatorIconHtml() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/><line x1="8" y1="18" x2="12" y2="18"/><circle cx="16" cy="18" r="1" fill="currentColor" stroke="none"/></svg>';
}

function isMeasurementInput(input) {
  return Boolean(
    input
    && input.type === 'number'
    && !input.disabled
    && !input.readOnly
    && !CALC_EXCLUDED_IDS.has(input.id)
    && !input.closest('#calc-popover')
    && !input.closest('[data-no-calc]'),
  );
}

function enhanceMeasurementInputs() {
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    if (!isMeasurementInput(input) || input.dataset.calcReady === '1') return;
    input.dataset.calcReady = '1';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calc-btn';
    button.title = 'Calculatrice de mesures';
    button.setAttribute('aria-label', 'Ouvrir la calculatrice de mesures');
    button.innerHTML = calculatorIconHtml();
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCalculator(input, button);
    });

    const unitWrapper = input.closest('.input-with-unit');
    if (unitWrapper) {
      unitWrapper.classList.add('has-calc');
      unitWrapper.appendChild(button);
      return;
    }
    const sliderLine = input.closest('.slider-line');
    if (sliderLine) {
      sliderLine.appendChild(button);
      return;
    }
    const wrapper = document.createElement('span');
    wrapper.className = 'calc-field';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(button);
  });
}

function evaluateCalcExpression(raw) {
  let text = String(raw ?? '')
    .replace(/,/g, '.')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\s+/g, '');
  if (!text) {
    return 0;
  }
  if (!/^[0-9.+\-*/()]+$/.test(text)) {
    return null;
  }
  let position = 0;
  const peek = () => text[position];

  const parseExpression = () => {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const operator = text[position++];
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = () => {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const operator = text[position++];
      const right = parseFactor();
      if (operator === '/' && Math.abs(right) < 1e-12) {
        throw new Error('Division par zéro.');
      }
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };

  const parseFactor = () => {
    if (peek() === '+') {
      position += 1;
      return parseFactor();
    }
    if (peek() === '-') {
      position += 1;
      return -parseFactor();
    }
    if (peek() === '(') {
      position += 1;
      const value = parseExpression();
      if (peek() !== ')') throw new Error('Parentèse manquante.');
      position += 1;
      return value;
    }
    const start = position;
    while (position < text.length && /[0-9.]/.test(text[position])) {
      position += 1;
    }
    if (start === position) throw new Error('Expression invalide.');
    const value = Number(text.slice(start, position));
    if (!Number.isFinite(value)) throw new Error('Nombre invalide.');
    return value;
  };

  try {
    const value = parseExpression();
    if (position !== text.length || !Number.isFinite(value)) {
        return null;
    }
    return value;
  } catch {
    return null;
  }
}

function formatCalcNumber(value) {
  return Number(value.toFixed(3)).toLocaleString('fr-FR', {
    maximumFractionDigits: 3,
  });
}

function updateCalcPreview() {
  const expression = $('#calc-expression');
  const result = $('#calc-result');
  if (!expression || !result) return;
  const value = evaluateCalcExpression(expression.value);
  result.classList.toggle('is-error', value === null);
  if (value === null) {
    result.textContent = 'Expression invalide';
  } else {
    result.textContent = formatCalcNumber(value);
  }
}

function openCalculator(input, button) {
  const popover = $('#calc-popover');
  const expression = $('#calc-expression');
  const targetLabel = $('#calc-target');
  if (!popover || !expression) return;
  calcTarget = input;
  const field = input.closest('.field');
  const label = field?.querySelector('label')?.textContent?.trim() || '';
  const wrapperUnit = input.closest('.input-with-unit')?.querySelector('span')?.textContent?.trim() || '';
  const unit = wrapperUnit || (
    ['cab-width', 'cab-height', 'cab-depth', 'split-position', 'side-position', 'shelf-position', 'partition-position'].includes(input.id)
      ? 'cm'
      : ''
  );
  if (targetLabel) {
    targetLabel.textContent = [label, unit].filter(Boolean).join(' · ');
  }
  expression.value = input.value || '';
  updateCalcPreview();
  popover.hidden = false;
  const card = popover.querySelector('.calc-card');
  const rect = button.getBoundingClientRect();
  const width = card?.offsetWidth || 270;
  const height = card?.offsetHeight || 360;
  let left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
  let top = rect.bottom + 8;
  if (top + height > window.innerHeight - 12) {
    top = Math.max(12, rect.top - height - 8);
  }
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  expression.focus();
  expression.select();
}

function closeCalculator() {
  const popover = $('#calc-popover');
  if (popover) popover.hidden = true;
  calcTarget = null;
}

function insertCalcKey(key) {
  const expression = $('#calc-expression');
  if (!expression) return;
  const start = expression.selectionStart ?? expression.value.length;
  const end = expression.selectionEnd ?? expression.value.length;
  if (key === 'C') {
    expression.value = '';
  } else if (key === 'back') {
    if (start !== end) {
      expression.value = expression.value.slice(0, start) + expression.value.slice(end);
    } else if (start > 0) {
      expression.value = expression.value.slice(0, start - 1) + expression.value.slice(end);
    }
  } else if (key === '=') {
    updateCalcPreview();
    expression.focus();
    return;
  } else {
    expression.value = expression.value.slice(0, start) + key + expression.value.slice(end);
    const next = start + key.length;
    expression.setSelectionRange?.(next, next);
  }
  expression.focus();
  updateCalcPreview();
}

function applyCalculator() {
  if (!calcTarget) return;
  const expression = $('#calc-expression');
  if (!expression) return;
  const value = evaluateCalcExpression(expression.value);
  if (value === null) {
    updateCalcPreview();
    return;
  }
  let nextValue = Number(value.toFixed(3));
  const min = calcTarget.min !== '' ? Number(calcTarget.min) : null;
  const max = calcTarget.max !== '' ? Number(calcTarget.max) : null;
  if (min !== null && Number.isFinite(min)) nextValue = Math.max(min, nextValue);
  if (max !== null && Number.isFinite(max)) nextValue = Math.min(max, nextValue);
  calcTarget.value = String(nextValue);
  calcTarget.dispatchEvent(new Event('input', { bubbles: true }));
  calcTarget.dispatchEvent(new Event('change', { bubbles: true }));
  closeCalculator();
}

function bindCalculator() {
  enhanceMeasurementInputs();
  const keys = $('#calc-keys');
  if (keys) {
    keys.addEventListener('click', (event) => {
      const button = event.target.closest('[data-calc-key]');
      if (!button) return;
      insertCalcKey(button.dataset.calcKey);
    });
  }
  const expression = $('#calc-expression');
  if (expression) {
    expression.addEventListener('input', updateCalcPreview);
    expression.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyCalculator();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeCalculator();
      }
    });
  }
  const applyButton = $('#calc-apply');
  if (applyButton) applyButton.addEventListener('click', applyCalculator);
  const cancelButton = $('#calc-cancel');
  if (cancelButton) cancelButton.addEventListener('click', closeCalculator);
  const closeButton = $('#calc-close');
  if (closeButton) closeButton.addEventListener('click', closeCalculator);

  document.addEventListener('pointerdown', (event) => {
    const popover = $('#calc-popover');
    if (!popover || popover.hidden) return;
    if (popover.contains(event.target)) return;
    if (event.target.closest('.calc-btn')) return;
    closeCalculator();
  });
  window.addEventListener('resize', () => {
    const popover = $('#calc-popover');
    if (popover && !popover.hidden) closeCalculator();
  });
  window.addEventListener('scroll', () => {
    const popover = $('#calc-popover');
    if (popover && !popover.hidden) closeCalculator();
  }, true);

  const root = document.querySelector('.editor-shell') || document.body;
  if (calcObserver) calcObserver.disconnect();
  calcObserver = new MutationObserver(() => enhanceMeasurementInputs());
  calcObserver.observe(root, { childList: true, subtree: true });
}

function currentVolume() {
  return (sceneData.volumes || []).find((volume) => volume.id === selectedVolumeId) || null;
}

function currentCabinet() {
  return sceneData.cabinet;
}

/* ------------------------------------------------------------------ */
/* En-tête, arbre, sélection                                          */
/* ------------------------------------------------------------------ */
function updateHeader() {
  const cabinet = currentCabinet();
  $('#header-name').textContent = cabinet.name;
  $('#header-dims').textContent = `${fmt(cabinet.width)} × ${fmt(cabinet.height)} × ${fmt(cabinet.depth)} cm · ${cabinet.material_name}`;
  document.title = `${cabinet.name} — poly_3D`;
}

function eyeIconHtml(hidden) {
  const paths = hidden
    ? '<path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a13.7 13.7 0 0 1-2.7 3.6"/><path d="M6.6 6.6C3.6 8.3 2 12 2 12s3.5 7 10 7c1.2 0 2.3-.2 3.3-.6"/>'
    : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function trashIconHtml() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
}

function chevronIconHtml(collapsed) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: rotate(${collapsed ? '-90' : '0'}deg); transition: transform .12s ease;"><polyline points="9 6 15 12 9 18"/></svg>`;
}

function treeNodeHtml(node, level = 0, inheritedHidden = false) {
  const isCabinet = node.kind === 'cabinet';
  const isVolume = node.kind === 'volume';
  const isShelf = node.kind === 'shelf';
  const isDivider = node.kind === 'divider';
  const isCarcass = node.kind === 'carcass';
  const isBack = node.kind === 'back';
  const classes = ['tree-row', `kind-${node.kind}`];
  if (isVolume && node.volume_id === selectedVolumeId && !selectedComponentIds.size) classes.push('selected');
  if (node.component_id && isComponentSelected(node.component_id)) classes.push('selected');
  if ((isCarcass || isBack) && node.side === selectedCarcassSide) classes.push('selected');
  if (node.component_id && partitionShelfIds.includes(node.component_id)) classes.push('partition-selected');
  if (activeTool === 'move' && node.component_id && moveHighlightIds().includes(node.component_id)) classes.push('partition-selected');

  const ownHidden = isCabinet
    ? cabinetHidden
    : isBack
      ? !showBack
      : node.component_id
        ? hiddenComponentIds.has(node.component_id)
        : node.volume_id
          ? hiddenVolumeIds.has(node.volume_id)
          : false;
  const categoryHidden = isShelf ? !showShelves : (isDivider ? !showDividers : false);
  const effectiveHidden = inheritedHidden || ownHidden || categoryHidden;
  const childInherited = (isCabinet || isVolume) ? effectiveHidden : inheritedHidden;
  const canToggle = !inheritedHidden && !categoryHidden;
  const visibilityKey = isCabinet
    ? 'cabinet'
    : isBack
      ? 'back'
      : node.component_id
        ? `component:${node.component_id}`
        : node.volume_id
          ? `volume:${node.volume_id}`
          : null;
  const label = node.label || 'élément';
  let eyeTitle = effectiveHidden ? `Afficher ${label}` : `Masquer ${label}`;
  if (!canToggle) {
    eyeTitle = inheritedHidden
      ? `Affichez d'abord le parent de « ${label} »`
      : `Catégorie masquée dans Affichage : ${label}`;
  }
  const eye = visibilityKey
    ? `<button type="button" class="tree-eye${effectiveHidden ? ' is-hidden' : ''}" data-vis-key="${visibilityKey}" aria-pressed="${effectiveHidden}" aria-label="${escapeHtml(eyeTitle)}" title="${escapeHtml(eyeTitle)}"${canToggle ? '' : ' disabled'}>${eyeIconHtml(effectiveHidden)}</button>`
    : '<span class="tree-eye-spacer" aria-hidden="true"></span>';
  const deleteButton = node.component_id
    ? `<button type="button" class="tree-delete" data-delete-component="${node.component_id}" aria-label="Supprimer ${escapeHtml(label)}" title="Supprimer ${escapeHtml(label)}">${trashIconHtml()}</button>`
    : '';
  if (effectiveHidden) classes.push('node-hidden');

  const attrs = [];
  if (node.volume_id) attrs.push(`data-volume-id="${node.volume_id}"`);
  if (node.component_id) attrs.push(`data-component-id="${node.component_id}"`);
  if (node.carcass_id) attrs.push(`data-carcass-id="${node.carcass_id}"`);
  if (node.side) attrs.push(`data-carcass-side="${node.side}"`);
  attrs.push(`data-kind="${node.kind}"`);
  const dims = node.dimensions ? `<span class="dims">${escapeHtml(node.dimensions)}</span>` : '';

  // Repli / dépli du caisson (les niches ne sont plus affichées).
  const hasChildren = Boolean(node.children && node.children.length);
  const isCollapsed = isCabinet
    ? cabinetCollapsed
    : isVolume
      ? collapsedVolumeIds.has(node.volume_id)
      : false;
  const collapseKey = isCabinet ? 'cabinet' : isVolume ? `volume:${node.volume_id}` : null;
  const toggleButton = collapseKey && hasChildren
    ? `<button type="button" class="tree-toggle${isCollapsed ? ' is-collapsed' : ''}" data-collapse-key="${collapseKey}" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? 'Déplier' : 'Replier'} ${escapeHtml(label)}" title="${isCollapsed ? 'Déplier' : 'Replier'}">${chevronIconHtml(isCollapsed)}</button>`
    : '';
  const children = (!isCollapsed && hasChildren)
    ? (node.children || []).map((child) => treeNodeHtml(child, level + 1, childInherited)).join('')
    : '';
  return `
    <li>
      <div class="${classes.join(' ')}" ${attrs.join(' ')}>
        ${toggleButton}
        <span class="kind"></span>
        <span class="tree-text">
          <span class="label">${escapeHtml(node.label)}</span>
          ${dims}
        </span>
        ${eye}
        ${deleteButton}
      </div>
      ${children ? `<ul>${children}</ul>` : ''}
    </li>`;
}

function toggleNodeVisibility(key) {
  if (!key) return;
  if (activeTool === 'measure') clearMeasurement();
  if (key === 'cabinet') {
    cabinetHidden = !cabinetHidden;
  } else if (key === 'back') {
    showBack = !showBack;
    syncDisplayUI();
  } else if (key.startsWith('volume:')) {
    const id = Number(key.slice('volume:'.length));
    if (Number.isFinite(id)) {
      if (hiddenVolumeIds.has(id)) hiddenVolumeIds.delete(id);
      else hiddenVolumeIds.add(id);
    }
  } else if (key.startsWith('component:')) {
    const id = Number(key.slice('component:'.length));
    if (Number.isFinite(id)) {
      if (hiddenComponentIds.has(id)) hiddenComponentIds.delete(id);
      else hiddenComponentIds.add(id);
    }
  }
  saveDisplayPrefs();
  renderTree();
  renderSelection();
  render3D();
  updateToolBounds();
}

function countTreePanels(node) {
  return (node.children || []).reduce(
    (total, child) => total + 1 + countTreePanels(child),
    0,
  );
}

function renderTree() {
  const host = $('#scene-tree');
  const tree = sceneData.tree;
  if (!tree) {
    host.innerHTML = '<div class="empty-mini">Aucun panneau.</div>';
    return;
  }
  host.innerHTML = `<ul>${treeNodeHtml(tree)}</ul>`;
  const total = countTreePanels(tree);
  $('#tree-count').textContent = `${total} panneau${total > 1 ? 'x' : ''}`;

  $$('.tree-row', host).forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('.tree-eye, .tree-delete, .tree-toggle')) return;
      const rowKind = row.dataset.kind;
      if (rowKind === 'door' || rowKind === 'plinth' || rowKind === 'rail' || rowKind === 'drawer') return;
      const volumeId = Number(row.dataset.volumeId);
      const componentId = Number(row.dataset.componentId);
      const carcassSide = row.dataset.carcassSide;
      const additive = event.metaKey || event.ctrlKey || event.shiftKey;
      if (additive && componentId && row.dataset.kind !== 'volume') {
        selectedVolumeId = volumeId;
        selectedCarcassSide = null;
        toggleComponentSelection(componentId);
        activateRightTab('selection');
        renderTree();
        renderSelection();
        render3D();
        updateToolBounds();
        return;
      }
      // Les panneaux de structure (côtés, dessous, dessus, fond) sont toujours
      // sélectionnables, même lorsqu'un outil Déplacer/Étagère/Séparation est
      // actif : leur ligne ne désigne aucune niche à transformer.
      if (carcassSide) {
        selectedCarcassSide = carcassSide;
        clearComponentSelection();
        selectedVolumeId = null;
        activateRightTab('selection');
        renderTree();
        renderSelection();
        render3D();
        return;
      }
      if (activeTool === 'move') {
        handleMoveTreeClick(row);
        return;
      }
      if (activeTool === 'partition' && row.dataset.kind === 'shelf' && componentId) {
        togglePartitionShelf(componentId);
        return;
      }
      if (activeTool === 'shelf' && shelfToolMode === 'series') {
        // La série remplit la niche : un clic sur une étagère existante ne doit
        // pas quitter l'onglet Outils ni servir de limite.
        if (row.dataset.kind === 'shelf' || row.dataset.kind === 'divider') return;
      }
      if (volumeId) {
        const isComponentRow = row.dataset.kind === 'shelf' || row.dataset.kind === 'divider';
        const additive = event.metaKey || event.ctrlKey || event.shiftKey;
        selectedVolumeId = volumeId;
        selectedCarcassSide = null;
        if (isComponentRow && componentId) {
          if (additive) {
            toggleComponentSelection(componentId);
          } else {
            setComponentSelection([componentId], componentId);
          }
          activateRightTab('selection');
        } else {
          clearComponentSelection();
        }
        if (activeTool === 'partition' && partitionEdge && !partitionShelfIds.length) {
          const nearest = nearestPartitionShelf(volumeById.get(volumeId), partitionEdge);
          if (nearest) partitionShelfIds = [nearest.id];
        }
        renderTree();
        renderSelection();
        render3D();
        updateToolBounds();
      }
    });
  });

  $$('.tree-toggle', host).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = button.dataset.collapseKey;
      if (key === 'cabinet') {
        cabinetCollapsed = !cabinetCollapsed;
      } else if (key?.startsWith('volume:')) {
        const volumeId = Number(key.slice('volume:'.length));
        if (collapsedVolumeIds.has(volumeId)) collapsedVolumeIds.delete(volumeId);
        else collapsedVolumeIds.add(volumeId);
      }
      renderTree();
    });
  });

  $$('.tree-delete', host).forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const componentId = Number(button.dataset.deleteComponent);
      if (!componentId) return;
      setBusy(true);
      try {
        const data = await api(`/components/${componentId}/`, { method: 'DELETE' });
        applyScene(data.scene, data.message);
      } catch (error) {
        toast(error.message, true);
      } finally {
        setBusy(false);
      }
    });
  });

  $$('.tree-eye', host).forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      toggleNodeVisibility(button.dataset.visKey);
    });
  });
}

function nearestPartitionShelf(volume, edge) {
  if (!volume?.is_leaf) return null;
  const shelves = (sceneData.components || [])
    .filter((component) => component.volume_id === volume.id && componentIsShelf(component))
    .sort((a, b) => a.position_from_bottom - b.position_from_bottom);
  if (!shelves.length) return null;
  return edge === 'bottom' ? shelves[0] : shelves[shelves.length - 1];
}

function togglePartitionShelf(componentId) {
  const components = sceneData.components || [];
  const component = components.find((item) => item.id === componentId && componentIsShelf(item));
  if (!component) {
    toast('Sélectionnez une étagère pour définir la séparation.', true);
    return;
  }

  if (partitionEdge) {
    // Avec une limite de niche, une seule étagère suffit. Un clic sur une
    // autre étagère remplace la sélection, mais un clic sur l'étagère déjà
    // choisie ne la retire pas : cela évite de désactiver le bouton Créer
    // par inadvertance. La croix de la ligne reste disponible pour retirer.
    if (!partitionShelfIds.includes(component.id)) {
      partitionShelfIds = [component.id];
    }
  } else {
    const first = partitionShelfIds.length
      ? components.find((item) => item.id === partitionShelfIds[0])
      : null;
    if (first && first.volume_id !== component.volume_id) {
      partitionShelfIds = [component.id];
      toast('Choisissez deux étagères dans la même niche.', true);
    } else {
      const index = partitionShelfIds.indexOf(component.id);
      if (index >= 0) {
        partitionShelfIds.splice(index, 1);
      } else {
        if (partitionShelfIds.length >= 2) {
          toast('Deux étagères maximum. Cliquez sur une étagère sélectionnée pour la retirer.', true);
          return;
        }
        partitionShelfIds.push(component.id);
      }
    }
  }

  selectedVolumeId = component.volume_id;
  clearComponentSelection();
  renderTree();
  renderSelection();
  render3D();
  updateToolBounds();
}

function togglePartitionEdge(edge) {
  if (edge !== 'bottom' && edge !== 'top') return;
  if (partitionEdge === edge) {
    partitionEdge = null;
  } else {
    partitionEdge = edge;
    let volume = null;
    let selectedShelves = [];
    if (partitionShelfIds.length) {
      selectedShelves = partitionShelfIds
        .map((id) => (sceneData.components || []).find(
          (component) => component.id === id && componentIsShelf(component),
        ))
        .filter(Boolean)
        .sort((a, b) => a.position_from_bottom - b.position_from_bottom);
      if (selectedShelves.length) {
        volume = volumeById.get(selectedShelves[0].volume_id) || null;
      }
    }
    if (!volume) {
      const current = currentVolume();
      if (current?.is_leaf) volume = current;
    }
    if (volume) {
      const shelves = (sceneData.components || [])
        .filter((component) => component.volume_id === volume.id && componentIsShelf(component))
        .sort((a, b) => a.position_from_bottom - b.position_from_bottom);
      if (!selectedShelves.length && shelves.length) {
        // Aucune étagère choisie : on prend la plus proche de la limite.
        const nearest = edge === 'bottom' ? shelves[0] : shelves[shelves.length - 1];
        partitionShelfIds = [nearest.id];
      } else if (selectedShelves.length > 1) {
        // Une limite de niche ne se combine qu'avec une seule étagère :
        // on garde celle qui est du côté de la limite choisie.
        const keep = edge === 'bottom'
          ? selectedShelves[0]
          : selectedShelves[selectedShelves.length - 1];
        partitionShelfIds = [keep.id];
      }
      // Avec une seule étagère déjà choisie, on la conserve. Si elle n'est
      // pas la plus basse (ou la plus haute), le panneau explique pourquoi
      // la séparation ne peut pas la traverser, au lieu de changer l'étagère
      // sous les yeux de l'utilisateur.
      selectedVolumeId = volume.id;
      clearComponentSelection();
    }
  }
  renderTree();
  renderSelection();
  render3D();
  updateToolBounds();
}

function getPartitionSelection() {
  const components = sceneData.components || [];
  const picks = partitionShelfIds
    .map((id) => components.find((component) => component.id === id && componentIsShelf(component)))
    .filter(Boolean)
    .sort((a, b) => a.position_from_bottom - b.position_from_bottom);
  let volume = null;
  if (picks.length) {
    volume = volumeById.get(picks[0].volume_id) || null;
  } else if (partitionEdge) {
    const current = currentVolume();
    if (current?.is_leaf) volume = current;
  }
  const boundaries = [];
  if (partitionEdge === 'bottom') boundaries.push({ type: 'bottom', y: 0 });
  picks.forEach((shelf) => {
    boundaries.push({ type: 'shelf', shelf, y: shelf.position_from_bottom });
  });
  if (partitionEdge === 'top') {
    boundaries.push({ type: 'top', y: volume ? volume.h : Number.POSITIVE_INFINITY });
  }
  boundaries.sort((a, b) => a.y - b.y);
  return { components, picks, volume, boundaries };
}

function partitionColumnFromPicks(volume, picks) {
  const cabinet = currentCabinet();
  const clearance = Math.max(0, Number(cabinet.shelf_side_clearance) || 0);
  if (!picks.length) {
    return {
      left: 0,
      right: volume.w,
      width: volume.w,
      full: true,
      leftLabel: 'Côté gauche',
      rightLabel: 'Côté droit',
    };
  }
  const left = Math.max(
    0,
    Math.max(...picks.map((shelf) => shelf.position_from_left)) - clearance,
  );
  const right = Math.min(
    volume.w,
    Math.min(...picks.map((shelf) => shelf.position_from_left + shelf.width)) + clearance,
  );
  if (right - left < 1) return null;

  const partitions = (sceneData.components || []).filter(
    (component) => component.type === 'partition_v' && component.volume_id === volume.id,
  );
  const leftPartition = partitions.find(
    (partition) => Math.abs(partition.position_from_left + partition.width / 2 - left) < 1,
  );
  const rightPartition = partitions.find(
    (partition) => Math.abs(partition.position_from_left - partition.width / 2 - right) < 1,
  );
  return {
    left,
    right,
    width: right - left,
    full: left <= 0.01 && right >= volume.w - 0.01,
    leftLabel: leftPartition
      ? `Séparation à ${fmt(leftPartition.position_from_left)} cm`
      : 'Côté gauche',
    rightLabel: rightPartition
      ? `Séparation à ${fmt(rightPartition.position_from_left)} cm`
      : 'Côté droit',
  };
}

function partitionColumnShelves(volume, column) {
  return (sceneData.components || [])
    .filter((component) => component.volume_id === volume.id && componentIsShelf(component))
    .filter(
      (shelf) => (
        shelf.position_from_left < column.right - 0.01
        && shelf.position_from_left + shelf.width > column.left + 0.01
      ),
    )
    .sort((a, b) => a.position_from_bottom - b.position_from_bottom);
}

function shelfGroupRoot(volumeId) {
  let current = volumeById.get(volumeId);
  while (current && current.parent_id) {
    const parent = volumeById.get(current.parent_id);
    if (
      parent
      && parent.split
      && parent.split.direction === 'horizontal'
      && parent.split.shelf
    ) {
      current = parent;
    } else {
      break;
    }
  }
  return current || null;
}

function volumeSubtreeIds(volumeId) {
  const ids = new Set([volumeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const volume of sceneData.volumes || []) {
      if (volume.parent_id && ids.has(volume.parent_id) && !ids.has(volume.id)) {
        ids.add(volume.id);
        changed = true;
      }
    }
  }
  return ids;
}

function shelvesInSubtree(volumeId) {
  const ids = volumeSubtreeIds(volumeId);
  return (sceneData.components || []).filter(
    (component) => componentIsShelf(component) && ids.has(component.volume_id),
  );
}

function componentDimsText(component) {
  const cabinet = currentCabinet();
  const owner = (sceneData.volumes || []).find(
    (volume) => volume.id === component.volume_id,
  );
  if (component.type === 'divider_v' && owner?.split?.side) {
    return `${fmt(component.width)} × ${fmt(cabinet.height)} × ${fmt(cabinet.depth)} cm`;
  }
  if (component.type === 'partition_v') {
    return `${fmt(component.height)} × ${fmt(component.depth)} × ${fmt(component.width)} cm`;
  }
  return `${fmt(component.width)} × ${fmt(component.height)} × ${fmt(component.depth)} cm`;
}

function selectionMeasureInfo() {
  const cabinet = currentCabinet();
  if (!cabinet) return null;

  const multi = selectedComponents();
  if (multi.length > 1) {
    return { name: 'Sélection multiple', dims: `${multi.length} éléments` };
  }

  if (selectedCarcassSide === 'back') {
    const backBox = (sceneData.boxes || []).find((box) => box.kind === 'back');
    if (!backBox) return null;
    return {
      name: 'Fond',
      dims: `${fmt(backBox.w)} × ${fmt(backBox.h)} × ${fmt(backBox.d)} cm`,
    };
  }

  if (selectedCarcassSide) {
    const panel = (sceneData.carcass_panels || []).find(
      (item) => item.side === selectedCarcassSide,
    );
    const boxes = (sceneData.boxes || []).filter(
      (box) => box.kind === 'carcass' && box.side === selectedCarcassSide,
    );
    if (!panel || !boxes.length) return null;
    const length = boxes.reduce((total, box) => total + box.w, 0);
    const height = Math.max(...boxes.map((box) => box.h));
    const depth = Math.max(...boxes.map((box) => box.d));
    return {
      name: panel.name,
      dims: `${fmt(length)} × ${fmt(height)} × ${fmt(depth)} cm`,
    };
  }

  const component = currentComponent();
  if (component) {
    const owner = (sceneData.volumes || []).find(
      (volume) => volume.id === component.volume_id,
    );
    const isShelf = component.type === 'shelf' || component.type === 'divider_h';
    const isSide = component.type === 'divider_v' && Boolean(owner?.split?.side);
    const name = isShelf
      ? 'Étagère'
      : (isSide ? 'Côté' : 'Séparation');
    return { name, dims: componentDimsText(component) };
  }

  const volume = currentVolume();
  if (volume) {
    const name = volume.is_root
      ? 'Volume intérieur'
      : `Niche ${(volume.slot || '').toUpperCase() || '—'}`;
    return { name, dims: `${fmt(volume.w)} × ${fmt(volume.h)} × ${fmt(volume.d)} cm` };
  }
  return null;
}

function updateSelectionMeasure() {
  const host = $('#selection-measure');
  if (!host) return;
  const info = selectionMeasureInfo();
  if (!info) {
    host.hidden = true;
    host.textContent = '';
    return;
  }
  host.hidden = false;
  host.innerHTML = `<strong>${escapeHtml(info.name)}</strong><span>${info.dims}</span>`;
}

function multiSelectionHtml(components) {
  const shelves = components.filter(componentIsShelf);
  const roots = new Set(
    shelves
      .map((component) => shelfGroupRoot(component.volume_id)?.id)
      .filter(Boolean),
  );
  const movable = shelves.length === components.length && roots.size === 1;
  const rows = components
    .map((component) => `
      <li>
        <span>${escapeHtml(componentDisplayName(component))}</span>
        <span class="mono">${componentDimsText(component)}</span>
      </li>`)
    .join('');
  return `
    <div class="title">Sélection multiple</div>
    <div class="dims">${components.length} éléments sélectionnés</div>
    <ul class="shelf-list">${rows}</ul>
    <div class="selection-actions">
      <button class="btn btn-sm btn-danger" type="button" data-delete-components>
        Supprimer les ${components.length} éléments
      </button>
      ${movable ? `
        <button class="btn btn-sm btn-primary" type="button" data-move-components>
          Déplacer les ${shelves.length} étagères
        </button>` : ''}
    </div>
    <p class="hint" style="margin-top:7px;">
      Ctrl/Cmd + clic pour ajouter ou retirer un élément.
      ${movable ? '' : ' Le déplacement groupé concerne les étagères d’une même niche.'}
    </p>
  `;
}

function startMoveFromSelection() {
  const components = selectedComponents();
  const shelves = components.filter(componentIsShelf);
  if (!components.length || shelves.length !== components.length) {
    toast('Sélectionnez uniquement des étagères pour les déplacer.', true);
    return;
  }
  const roots = new Set(
    shelves
      .map((component) => shelfGroupRoot(component.volume_id)?.id)
      .filter(Boolean),
  );
  if (roots.size !== 1) {
    toast('Les étagères à déplacer doivent appartenir à la même niche.', true);
    return;
  }
  const root = volumeById.get([...roots][0]);
  if (!root) return;
  moveSource = {
    rootId: root.id,
    componentId: null,
    componentIds: shelves.map((component) => component.id),
    volumeId: shelves[0].volume_id,
    count: shelves.length,
    rootSlot: (root.slot || '').toUpperCase(),
    isMulti: true,
  };
  moveScope = 'series';
  activateRightTab('tools');
  activateTool('move');
  syncMovePanel();
}

function renderSelection() {
  updateSelectionMeasure();
  const panel = $('#selection-panel');
  if (selectedCarcassSide === 'back') {
    const measure = selectionMeasureInfo();
    panel.innerHTML = `
      <div class="title">Fond</div>
      <div class="dims">${measure ? measure.dims : 'Panneau de structure'}</div>
      ${backEditorHtml()}
    `;
    bindBackEditor();
    return;
  }
  if (selectedCarcassSide) {
    const carcass = (sceneData.carcass_panels || []).find((p) => p.side === selectedCarcassSide);
    if (carcass) {
      const measure = selectionMeasureInfo();
      panel.innerHTML = `
        <div class="title">${escapeHtml(carcass.name)}</div>
        <div class="dims">${measure ? measure.dims : 'Panneau de structure'}</div>
        ${carcassEditorHtml(carcass)}
      `;
      bindCarcassEditor(carcass);
      return;
    }
    selectedCarcassSide = null;
  }
  const multiSelection = selectedComponents();
  if (multiSelection.length > 1) {
    panel.innerHTML = multiSelectionHtml(multiSelection);
    updateSelectionMeasure();
    return;
  }
  const volume = currentVolume();
  if (!volume) {
    panel.innerHTML = '<div class="title">Aucun volume</div><div class="dims">Double-cliquez sur une niche dans la vue 3D.</div>';
    return;
  }
  const volumeComponents = (sceneData.components || [])
    .filter(
      (item) => item.volume_id === volume.id && (componentIsShelf(item) || item.type === 'partition_v'),
    )
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'shelf' ? -1 : 1;
      return a.position_from_bottom - b.position_from_bottom;
    });
  const split = volume.split;
  const component = currentComponent();
  let selectionTarget = '';
  if (component) {
    const isPartition = component.type === 'partition_v';
    const owner = (sceneData.volumes || []).find((item) => item.id === component.volume_id);
    const isShelf = component.type === 'shelf' || component.type === 'divider_h';
    const isSide = component.type === 'divider_v' && Boolean(owner?.split?.side);
    const label = isShelf
      ? 'Étagère sélectionnée'
      : (isSide ? 'Côté sélectionné' : 'Séparation sélectionnée');
    const dims = isPartition
      ? `${fmt(component.height)} × ${fmt(component.depth)} × ${fmt(component.width)} cm`
      : (isSide
        ? `${fmt(component.width)} × ${fmt(currentCabinet().height)} × ${fmt(currentCabinet().depth)} cm`
        : `${fmt(component.width)} × ${fmt(component.height)} × ${fmt(component.depth)} cm`);
    selectionTarget = `<div class="selection-target"><span class="chip chip-blue">${label} · ${dims}</span></div>`;
  }
  const splitLabel = split
    ? `<span class="chip chip-amber">${
      split.side
        ? 'Côté'
        : (split.direction === 'vertical' ? 'Séparé verticalement' : 'Séparé horizontalement')
    } · ${fmt(split.offset)} cm</span>`
    : '<span class="chip chip-teal">Niche libre</span>';
  const componentEditor = component ? componentEditorHtml(component) : '';
  const componentRows = volumeComponents.length
    ? `<ul class="shelf-list">${volumeComponents
        .map((item) => {
          const isPartition = item.type === 'partition_v';
          const label = isPartition
            ? `Séparation · ${fmt(item.height)} × ${fmt(item.depth)} cm`
            : `Étagère · ${fmt(item.width)} × ${fmt(item.depth)} cm`;
          const title = isPartition ? "Supprimer la séparation" : "Supprimer l'étagère";
          return `<li>
            <span>${label}</span>
            <button type="button" title="${title}" data-delete-component="${item.id}">×</button>
          </li>`;
        })
        .join('')}</ul>`
    : '';
  const actions = split
    ? `<div class="selection-actions">
        <button class="btn btn-sm btn-danger" type="button" data-remove-split="${volume.id}">Supprimer la division</button>
      </div>`
    : '';
  const splitEditor = split
    ? `<div class="split-editor">
        <div class="split-editor-head">
          <span>${split.side ? 'Position du côté' : (split.shelf ? 'Position de l’étagère' : 'Réglage de la séparation')}</span>
          <span class="mono">${fmt(split.offset)} cm</span>
        </div>
        <div class="field">
          <label>Position</label>
          <select data-split-mode>
            <option value="ratio"${split.mode === 'ratio' ? ' selected' : ''}>Proportionnelle</option>
            <option value="absolute"${split.mode === 'absolute' ? ' selected' : ''}>Cote fixe</option>
          </select>
        </div>
        <div class="slider-line">
          <input type="range" data-split-range>
          <input type="number" data-split-position step="1">
        </div>
        <button class="btn btn-sm btn-primary btn-block" type="button" data-move-split>${split.side ? 'Déplacer le côté' : (split.shelf ? 'Déplacer l’étagère' : 'Déplacer la séparation')}</button>
      </div>`
    : '';
  panel.innerHTML = `
    <div class="title">${volume.is_root ? 'Volume intérieur' : `Niche ${escapeHtml(volume.slot?.toUpperCase() || '—')}`}</div>
    <div class="dims">${fmt(volume.w)} × ${fmt(volume.h)} × ${fmt(volume.d)} cm</div>
    ${selectionTarget}
    ${componentEditor}
    <div style="margin-top:7px;">${splitLabel}</div>
    ${splitEditor}
    ${actions}
    ${componentRows}
  `;
  if (split) bindSplitEditor(volume, split);
  if (component) bindComponentEditor(component);
  updateSelectionMeasure();
}

function componentDisplayName(component) {
  const owner = (sceneData.volumes || []).find((item) => item.id === component.volume_id);
  if (component.type === 'shelf' || component.type === 'divider_h') return 'Étagère';
  if (component.type === 'divider_v') {
    return (owner && owner.split && owner.split.side) ? 'Côté' : 'Séparation';
  }
  if (component.type === 'partition_v') return 'Séparation';
  return component.type;
}

function componentIsShelf(component) {
  const owner = (sceneData.volumes || []).find((item) => item.id === component.volume_id);
  return component.type === 'shelf'
    || (component.type === 'divider_h' && Boolean(owner?.split?.shelf));
}

function componentEditorHtml(component) {
  const name = componentDisplayName(component);
  const materials = sceneData.materials || [];
  const materialOptions = materials
    .map((material) => `<option value="${material.id}"${material.id === component.material_id ? ' selected' : ''}>${escapeHtml(material.name)} (${fmt(material.thickness)} cm)</option>`)
    .join('');
  const clearanceField = componentIsShelf(component)
    ? `<div class="field">
         <label>Jeu avant</label>
         <div class="input-with-unit"><input type="number" data-component-clearance value="${(component.depth_clearance_front ?? 0) / 10}" min="0" step="0.5"><span>cm</span></div>
       </div>`
    : '';
  return `
    <div class="split-editor" style="margin-top:10px;">
      <div class="split-editor-head">
        <span>${name}</span>
        <span class="mono">${fmt(component.width)} × ${fmt(component.height)} × ${fmt(component.depth)} cm</span>
      </div>
      <div class="field">
        <label>Matière</label>
        <select data-component-material>${materialOptions}</select>
      </div>
      <div class="field">
        <label>Épaisseur</label>
        <div class="input-with-unit"><input type="number" data-component-thickness value="${component.thickness / 10}" min="0.3" max="10" step="0.1"><span>cm</span></div>
      </div>
      ${clearanceField}
      <div class="field">
        <label>Chant</label>
        <input type="text" data-component-edge value="${escapeHtml(component.edge_banding || '')}">
      </div>
      <button class="btn btn-sm btn-primary btn-block" type="button" data-save-component>Enregistrer les modifications</button>
      <button class="btn btn-sm btn-danger btn-block" type="button" data-delete-component="${component.id}">Supprimer</button>
    </div>`;
}

function bindComponentEditor(component) {
  const panel = $('#selection-panel');
  const saveButton = $('[data-save-component]', panel);
  if (!saveButton) return;
  saveButton.addEventListener('click', async () => {
    const payload = {
      material_id: Number($('[data-component-material]', panel).value),
      thickness: Number($('[data-component-thickness]', panel).value) * 10,
      edge_banding: String($('[data-component-edge]', panel).value || ''),
    };
    const clearance = $('[data-component-clearance]', panel);
    if (clearance) payload.depth_clearance_front = Number(clearance.value) * 10;
    setBusy(true);
    try {
      const data = await api(`/components/${component.id}/update/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });
}

function carcassEditorHtml(carcass) {
  const materials = sceneData.materials || [];
  const materialOptions = materials
    .map((material) => `<option value="${material.id}"${material.id === carcass.material_id ? ' selected' : ''}>${escapeHtml(material.name)} (${fmt(material.thickness)} cm)</option>`)
    .join('');
  const isVertical = carcass.side === 'bottom' || carcass.side === 'top';
  const positionField = isVertical
    ? `<div class="field">
         <label>Position</label>
         <div class="input-with-unit"><input type="number" data-carcass-position value="${(carcass.position ?? 0) / 10}" min="0" max="50" step="0.5"><span>cm</span></div>
       </div>`
    : '';
  return `
    <div class="split-editor" style="margin-top:10px;">
      <div class="split-editor-head">
        <span>${escapeHtml(carcass.name)}</span>
        <span class="mono">${fmt(carcass.thickness)} cm</span>
      </div>
      <div class="field">
        <label>Matière</label>
        <select data-carcass-material>${materialOptions}</select>
      </div>
      <div class="field">
        <label>Épaisseur</label>
        <div class="input-with-unit"><input type="number" data-carcass-thickness value="${carcass.thickness / 10}" min="0.3" max="10" step="0.1"><span>cm</span></div>
      </div>
      ${positionField}
      <button class="btn btn-sm btn-primary btn-block" type="button" data-save-carcass>Enregistrer les modifications</button>
    </div>`;
}

function bindCarcassEditor(carcass) {
  const panel = $('#selection-panel');
  const saveButton = $('[data-save-carcass]', panel);
  if (!saveButton) return;
  saveButton.addEventListener('click', async () => {
    const payload = {
      material_id: Number($('[data-carcass-material]', panel).value),
      thickness: Number($('[data-carcass-thickness]', panel).value) * 10,
    };
    const positionInput = $('[data-carcass-position]', panel);
    if (positionInput) payload.position = Number(positionInput.value) * 10;
    setBusy(true);
    try {
      const data = await api(`/carcass/${carcass.side}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });
}

function backEditorHtml() {
  const cabinet = currentCabinet();
  const materials = sceneData.materials || [];
  const materialOptions = [
    '<option value="">Sans fond</option>',
    ...materials.map((material) => `<option value="${material.id}"${material.id === cabinet.material_back_id ? ' selected' : ''}>${escapeHtml(material.name)} (${fmt(material.thickness)} cm)</option>`),
  ].join('');
  const hasBack = Boolean(cabinet.material_back_id);
  const thickness = cabinet.back_thickness ? (cabinet.back_thickness / 10).toFixed(1) : '';
  return `
    <div class="split-editor" style="margin-top:10px;">
      <div class="split-editor-head">
        <span>Fond</span>
        <span class="mono">${hasBack ? `${fmt(cabinet.back_thickness)} cm` : 'Aucun'}</span>
      </div>
      <div class="field">
        <label>Matière</label>
        <select data-back-material>${materialOptions}</select>
      </div>
      <div class="field">
        <label>Épaisseur</label>
        <div class="input-with-unit"><input type="number" data-back-thickness value="${thickness}" min="0.3" max="10" step="0.1"${hasBack ? '' : ' disabled'}><span>cm</span></div>
      </div>
      <button class="btn btn-sm btn-primary btn-block" type="button" data-save-back>Enregistrer les modifications</button>
    </div>`;
}

function bindBackEditor() {
  const panel = $('#selection-panel');
  const materialSelect = $('[data-back-material]', panel);
  const thicknessInput = $('[data-back-thickness]', panel);
  const saveButton = $('[data-save-back]', panel);
  if (!materialSelect || !thicknessInput || !saveButton) return;
  const materials = sceneData.materials || [];

  const syncThicknessState = (autoFill = false) => {
    const material = materials.find((item) => item.id === Number(materialSelect.value));
    const hasMaterial = Boolean(material);
    thicknessInput.disabled = !hasMaterial;
    if (!hasMaterial) {
      thicknessInput.value = '';
      return;
    }
    if (autoFill && !thicknessInput.value) {
      thicknessInput.value = (material.thickness / 10).toFixed(1);
    }
  };
  materialSelect.addEventListener('change', () => syncThicknessState(true));

  saveButton.addEventListener('click', async () => {
    const material = materials.find((item) => item.id === Number(materialSelect.value));
    const payload = { material_back_id: material ? material.id : null, back_thickness: null };
    if (material) {
      const thicknessCm = Number(thicknessInput.value);
      if (!Number.isFinite(thicknessCm) || thicknessCm <= 0) {
        toast('Saisissez une épaisseur de fond valide.', true);
        return;
      }
      // Une épaisseur identique à celle de la matière n'a pas besoin d'être
      // figée : le fond suivra automatiquement la matière choisie.
      if (Math.abs(thicknessCm * 10 - material.thickness) > 0.01) {
        payload.back_thickness = thicknessCm * 10;
      }
    }
    setBusy(true);
    try {
      const data = await api('/', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });
}

function bindSplitEditor(volume, split) {
  const panel = $('#selection-panel');
  const modeSelect = $('[data-split-mode]', panel);
  const range = $('[data-split-range]', panel);
  const number = $('[data-split-position]', panel);
  const button = $('[data-move-split]', panel);
  if (!modeSelect || !range || !number || !button) return;

  const cabinet = currentCabinet();
  const size = split.direction === 'vertical' ? volume.w : volume.h;
  const min = cabinet.thickness / 2 + 50;
  const max = Math.max(min, size - cabinet.thickness / 2 - 50);
  const minRatio = Math.max(0.5, (min / size) * 100);
  const maxRatio = Math.min(99.5, (max / size) * 100);

  const syncFields = () => {
    const mode = modeSelect.value;
    if (mode === 'ratio') {
      range.min = minRatio.toFixed(1);
      range.max = maxRatio.toFixed(1);
      range.step = '0.5';
      number.min = minRatio.toFixed(1);
      number.max = maxRatio.toFixed(1);
      number.step = '0.5';
      const value = Math.min(maxRatio, Math.max(minRatio, (split.offset / size) * 100));
      range.value = value.toFixed(1);
      number.value = value.toFixed(1);
    } else {
      const minCm = min / 10;
      const maxCm = max / 10;
      range.min = minCm.toFixed(1);
      range.max = maxCm.toFixed(1);
      range.step = '0.5';
      number.min = minCm.toFixed(1);
      number.max = maxCm.toFixed(1);
      number.step = '0.5';
      const value = Math.min(max, Math.max(min, split.offset)) / 10;
      range.value = value.toFixed(1);
      number.value = value.toFixed(1);
    }
  };

  modeSelect.addEventListener('change', syncFields);
  range.addEventListener('input', () => {
    number.value = range.value;
  });
  number.addEventListener('input', () => {
    range.value = number.value;
  });
  button.addEventListener('click', async () => {
    const mode = modeSelect.value;
    const raw = Number(number.value);
    if (!Number.isFinite(raw)) {
      toast('Position de la séparation invalide.', true);
      return;
    }
    const position = mode === 'ratio' ? raw / 100 : raw * 10;
    setBusy(true);
    try {
      const data = await api(`/volumes/${volume.id}/split/`, {
        method: 'PATCH',
        body: JSON.stringify({ position, mode }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });
  syncFields();
}

/* ------------------------------------------------------------------ */
/* Formulaires et outils                                              */
/* ------------------------------------------------------------------ */
function syncCabinetForm() {
  const cabinet = currentCabinet();
  $('#cab-name').value = cabinet.name || '';
  $('#cab-width').value = (cabinet.width / 10).toFixed(1);
  $('#cab-height').value = (cabinet.height / 10).toFixed(1);
  $('#cab-depth').value = (cabinet.depth / 10).toFixed(1);
  $('#cab-material').value = String(cabinet.material_id);
  $('#cab-waste').value = Math.round(cabinet.waste_percent);
  $('#cab-gap').value = (cabinet.door_gap / 10).toFixed(1);
  $('#cab-doors').checked = Boolean(cabinet.has_doors);
  $('#cab-rail').checked = Boolean(cabinet.has_hanging_rail);
  $('#cab-rail-height').value = (cabinet.hanging_rail_height / 10).toFixed(1);
  $('#cab-rail-settings').hidden = !cabinet.has_hanging_rail;
  $('#cab-drawers').checked = Boolean(cabinet.has_drawers);
  $('#cab-drawer-count').value = cabinet.drawer_count || 2;
  $('#cab-drawer-height').value = (cabinet.drawer_height / 10).toFixed(1);
  $('#cab-drawer-settings').hidden = !cabinet.has_drawers;
}

function syncPlinthForm() {
  const cabinet = currentCabinet();
  $('#plinth-height').value = (cabinet.plinth_height / 10).toFixed(1);
  $('#plinth-setback').value = (cabinet.plinth_setback / 10).toFixed(1);
}

function syncSplitToolModeUI() {
  const grid = splitToolMode === 'grid';
  $$('[data-split-tool]').forEach((button) => {
    const active = button.dataset.splitTool === splitToolMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const singlePane = $('[data-split-pane="single"]');
  const gridPane = $('[data-split-pane="grid"]');
  if (singlePane) singlePane.hidden = grid;
  if (gridPane) gridPane.hidden = !grid;
}

function setSplitToolMode(mode) {
  const nextMode = mode === 'grid' ? 'grid' : 'single';
  if (nextMode === splitToolMode) return;
  splitToolMode = nextMode;
  syncSplitToolModeUI();
  updateToolBounds();
}

function parseGridDistribution(value, count) {
  const text = String(value || '').trim();
  if (!text) return { values: null, error: null };
  const parts = text
    .replace(/;/g, ',')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== count) {
    return {
      values: null,
      error: `Indiquez ${count} valeur${count > 1 ? 's' : ''}.`,
    };
  }
  const values = [];
  for (const part of parts) {
    const number = Number(part);
    if (!Number.isFinite(number) || number <= 0) {
      return { values: null, error: 'Les valeurs doivent être positives.' };
    }
    values.push(number);
  }
  return { values, error: null };
}

function compartmentGridPlan() {
  const volume = currentVolume();
  const cabinet = currentCabinet();
  const thickness = Number(cabinet.thickness) || 18;
  const minBay = 50;
  const columns = Math.round(Number($('#grid-columns')?.value));
  const rows = Math.round(Number($('#grid-rows')?.value));
  const topEnabled = Boolean($('#grid-top-row')?.checked);
  const topHeight = Number($('#grid-top-height')?.value);
  const base = {
    volume,
    cabinet,
    thickness,
    minBay,
    columns,
    rows,
    topEnabled,
    topHeight,
    columnWidths: null,
    rowHeights: null,
    count: 0,
    error: null,
  };

  if (!volume) {
    return { ...base, error: 'Sélectionnez une niche libre.' };
  }
  if (!volume.is_leaf) {
    return { ...base, error: 'Ce volume est déjà divisé : choisissez une niche libre.' };
  }
  const components = (sceneData.components || []).filter(
    (item) => item.volume_id === volume.id
      && (componentIsShelf(item) || item.type === 'partition_v'),
  );
  if (components.length) {
    return {
      ...base,
      error: 'Ce volume contient déjà des étagères ou des séparations. Choisissez une niche vide ou retirez-les avant de créer la grille.',
    };
  }
  if (!Number.isFinite(columns) || columns < 2 || columns > 8) {
    return { ...base, error: 'Le nombre de colonnes doit être compris entre 2 et 8.' };
  }
  if (!Number.isFinite(rows) || rows < 1 || rows > 8) {
    return { ...base, error: 'Le nombre de rangées doit être compris entre 1 et 8.' };
  }
  if (topEnabled && (!Number.isFinite(topHeight) || topHeight <= 0)) {
    return { ...base, error: 'Indiquez une hauteur de rangée haute positive.' };
  }
  if (topEnabled && topHeight < minBay) {
    return { ...base, error: `La rangée haute doit mesurer au moins ${fmt(minBay)} cm.` };
  }

  const widthParse = parseGridDistribution($('#grid-column-widths')?.value, columns);
  if (widthParse.error) {
    return { ...base, error: `Largeurs : ${widthParse.error}` };
  }
  const heightParse = parseGridDistribution($('#grid-row-heights')?.value, rows);
  if (heightParse.error) {
    return { ...base, error: `Hauteurs : ${heightParse.error}` };
  }

  const topHeightValue = topEnabled ? topHeight : null;
  const gridHeight = topEnabled ? volume.h - topHeightValue - thickness : volume.h;
  if (topEnabled && gridHeight < minBay) {
    return { ...base, error: 'La rangée haute laisse trop peu de place sous elle.' };
  }
  const availableWidth = volume.w - (columns - 1) * thickness;
  if (availableWidth < columns * minBay) {
    return {
      ...base,
      error: `La niche est trop étroite pour ${columns} colonnes (minimum ${fmt(minBay)} cm par colonne).`,
    };
  }
  const availableHeight = gridHeight - (rows - 1) * thickness;
  if (availableHeight < rows * minBay) {
    return {
      ...base,
      error: `La hauteur est trop faible pour ${rows} rangées (minimum ${fmt(minBay)} cm par rangée).`,
    };
  }
  if (widthParse.values) {
    const total = widthParse.values.reduce((sum, value) => sum + value, 0);
    if (widthParse.values.some(
      (value) => (availableWidth * value) / total < minBay - 0.01,
    )) {
      return { ...base, error: `Chaque colonne doit mesurer au moins ${fmt(minBay)} cm.` };
    }
  }
  if (heightParse.values) {
    const total = heightParse.values.reduce((sum, value) => sum + value, 0);
    if (heightParse.values.some(
      (value) => (availableHeight * value) / total < minBay - 0.01,
    )) {
      return { ...base, error: `Chaque rangée doit mesurer au moins ${fmt(minBay)} cm.` };
    }
  }

  const count = columns * rows + (topEnabled ? 1 : 0);
  return {
    ...base,
    topHeight: topHeightValue,
    columnWidths: widthParse.values,
    rowHeights: heightParse.values,
    gridHeight,
    availableWidth,
    availableHeight,
    count,
    error: null,
  };
}

function syncCompartmentGrid() {
  const hint = $('#grid-hint');
  const summary = $('#grid-summary');
  const button = $('#btn-grid');
  const topFields = $('[data-grid-top-fields]');
  const topCheckbox = $('#grid-top-row');
  if (!hint || !summary || !button) return;
  if (topFields) topFields.hidden = !topCheckbox?.checked;

  button.disabled = true;
  const plan = compartmentGridPlan();
  if (plan.error) {
    hint.textContent = plan.error;
    summary.textContent = '';
    return;
  }

  const topLabel = plan.topEnabled
    ? ` + 1 rangée haute de ${fmt(plan.topHeight)} cm`
    : '';
  summary.textContent = `${plan.columns} colonne${plan.columns > 1 ? 's' : ''} × ${plan.rows} rangée${plan.rows > 1 ? 's' : ''}${topLabel} = ${plan.count} compartiments.`;
  const widthLabel = plan.columnWidths ? 'largeurs personnalisées' : 'colonnes égales';
  const heightLabel = plan.rowHeights ? 'hauteurs personnalisées' : 'rangées égales';
  hint.textContent = `${widthLabel}, ${heightLabel}. Chaque compartiment ≥ ${fmt(plan.minBay)} cm. Les séparations sont structurelles.`;
  button.disabled = false;
}

function updateToolBounds() {
  if (activeTool === 'move') {
    syncMovePanel();
    return;
  }
  if (activeTool === 'split' && splitToolMode === 'grid') {
    syncCompartmentGrid();
    return;
  }
  if (activeTool === 'shelf' && shelfToolMode === 'series') {
    syncShelfColumns();
    syncPartitionTool();
    return;
  }
  if (activeTool === 'side' && sideToolMode === 'series') {
    syncSideSeries();
    return;
  }
  const volume = currentVolume();
  const cabinet = currentCabinet();
  const splitHint = $('#split-hint');
  const shelfHint = $('#shelf-hint');
  const splitDirection = $('#split-direction').value;
  const splitMode = $('#split-mode').value;
  const shelfMode = $('#shelf-mode').value;

  if (!volume) {
    splitHint.textContent = 'Sélectionnez un volume.';
    shelfHint.textContent = 'Sélectionnez une niche.';
    syncShelfColumns();
    syncPartitionTool();
    return;
  }

  const size = splitDirection === 'vertical' ? volume.w : volume.h;
  const min = cabinet.thickness / 2 + 50;
  const max = Math.max(min, size - cabinet.thickness / 2 - 50);
  const splitRange = $('#split-range');
  const splitPosition = $('#split-position');

  if (splitMode === 'ratio') {
    const minRatio = Math.max(0.5, (min / size) * 100);
    const maxRatio = Math.min(99.5, (max / size) * 100);
    splitRange.min = minRatio.toFixed(1);
    splitRange.max = maxRatio.toFixed(1);
    splitRange.step = '0.5';
    splitPosition.min = minRatio.toFixed(1);
    splitPosition.max = maxRatio.toFixed(1);
    splitRange.disabled = !volume.is_leaf;
    splitPosition.disabled = !volume.is_leaf;
    splitHint.textContent = volume.is_leaf
      ? `Proportion de la niche (${fmt(min)} à ${fmt(max)} cm, soit ${fmtPct(minRatio, 1)} à ${fmtPct(maxRatio, 1)} %).`
      : 'Ce volume est déjà divisé : choisissez une niche libre.';
    if (Number(splitPosition.value) < minRatio || Number(splitPosition.value) > maxRatio) {
      splitPosition.value = '50';
      splitRange.value = '50';
    }
  } else {
    splitRange.min = (min / 10).toFixed(1);
    splitRange.max = (max / 10).toFixed(1);
    splitRange.step = '0.5';
    splitPosition.min = (min / 10).toFixed(1);
    splitPosition.max = (max / 10).toFixed(1);
    splitRange.disabled = !volume.is_leaf;
    splitPosition.disabled = !volume.is_leaf;
    splitHint.textContent = volume.is_leaf
      ? `Cote du centre de la séparation entre ${fmt(min)} et ${fmt(max)} cm.`
      : 'Ce volume est déjà divisé : choisissez une niche libre.';
    if (Number(splitPosition.value) < min / 10 || Number(splitPosition.value) > max / 10) {
      const center = (size / 2 / 10).toFixed(1);
      splitPosition.value = String(center);
      splitRange.value = String(center);
    }
  }

  const sideRange = $('#side-range');
  const sidePosition = $('#side-position');
  const sideHint = $('#side-hint');
  const sideMode = $('#side-mode').value;
  const sideSize = volume.w;
  const sideMin = cabinet.thickness + 50;
  const sideMax = Math.max(sideMin, sideSize - cabinet.thickness - 50);
  if (sideMode === 'ratio') {
    const minRatio = Math.max(0.5, (sideMin / sideSize) * 100);
    const maxRatio = Math.min(99.5, (sideMax / sideSize) * 100);
    sideRange.min = minRatio.toFixed(1);
    sideRange.max = maxRatio.toFixed(1);
    sideRange.step = '0.5';
    sidePosition.min = minRatio.toFixed(1);
    sidePosition.max = maxRatio.toFixed(1);
    sideRange.disabled = !volume.is_leaf;
    sidePosition.disabled = !volume.is_leaf;
    sideHint.textContent = volume.is_leaf
      ? `Proportion de la largeur (${fmt(sideMin)} à ${fmt(sideMax)} cm, soit ${fmtPct(minRatio, 1)} à ${fmtPct(maxRatio, 1)} %).`
      : 'Ce volume est déjà divisé : choisissez une niche libre.';
    if (Number(sidePosition.value) < minRatio || Number(sidePosition.value) > maxRatio) {
      sidePosition.value = '50';
      sideRange.value = '50';
    }
  } else {
    sideRange.min = (sideMin / 10).toFixed(1);
    sideRange.max = (sideMax / 10).toFixed(1);
    sideRange.step = '0.5';
    sidePosition.min = (sideMin / 10).toFixed(1);
    sidePosition.max = (sideMax / 10).toFixed(1);
    sideRange.disabled = !volume.is_leaf;
    sidePosition.disabled = !volume.is_leaf;
    sideHint.textContent = volume.is_leaf
      ? `Cote du centre du côté entre ${fmt(sideMin)} et ${fmt(sideMax)} cm.`
      : 'Ce volume est déjà divisé : choisissez une niche libre.';
    if (Number(sidePosition.value) < sideMin / 10 || Number(sidePosition.value) > sideMax / 10) {
      const center = (sideSize / 2 / 10).toFixed(1);
      sidePosition.value = String(center);
      sideRange.value = String(center);
    }
  }

  const shelfRange = $('#shelf-range');
  const shelfPosition = $('#shelf-position');
  const { min: shelfMin, max: shelfMax } = shelfBounds(volume, cabinet);
  const shelfFits = shelfMax >= shelfMin;
  if (shelfMode === 'ratio') {
    // Les bornes en % de la hauteur de la niche, au demi-pour-cent près vers l'intérieur.
    const minPct = Math.ceil((shelfMin / volume.h) * 200) / 2;
    const maxPct = Math.max(minPct, Math.floor((shelfMax / volume.h) * 200) / 2);
    shelfRange.min = String(minPct);
    shelfRange.max = String(maxPct);
    shelfRange.step = '0.5';
    shelfPosition.min = minPct;
    shelfPosition.max = maxPct;
    shelfHint.textContent = !volume.is_leaf
      ? 'Choisissez une niche libre (sans séparation).'
      : shelfFits
        ? `De ${fmtPct(minPct, 1)} % à ${fmtPct(maxPct, 1)} % de la hauteur de la niche : l'étagère reste à ${fmt(SHELF_MIN_GAP)} cm au moins du dessous et du dessus (${fmt(shelfMin)} à ${fmt(shelfMax)} cm).`
        : shelfTooLowHint(cabinet);
  } else {
    shelfRange.min = (shelfMin / 10).toFixed(1);
    shelfRange.max = (Math.max(shelfMin, shelfMax) / 10).toFixed(1);
    shelfRange.step = '0.5';
    shelfPosition.min = (shelfMin / 10).toFixed(1);
    shelfPosition.max = (Math.max(shelfMin, shelfMax) / 10).toFixed(1);
    shelfHint.textContent = !volume.is_leaf
      ? 'Choisissez une niche libre (sans séparation).'
      : shelfFits
        ? `Dessous de l'étagère entre ${fmt(shelfMin)} et ${fmt(shelfMax)} cm du bas de la niche (${fmt(SHELF_MIN_GAP)} cm au moins de chaque côté).`
        : shelfTooLowHint(cabinet);
  }
  shelfRange.disabled = !volume.is_leaf || !shelfFits;
  shelfPosition.disabled = !volume.is_leaf || !shelfFits;
  if (Number(shelfPosition.value) < Number(shelfPosition.min) || Number(shelfPosition.value) > Number(shelfPosition.max)) {
    const middle = (Number(shelfPosition.min) + Number(shelfPosition.max)) / 2;
    shelfPosition.value = shelfMode === 'ratio' ? String(Math.round(middle * 2) / 2) : middle.toFixed(1);
    shelfRange.value = shelfPosition.value;
  }
  syncShelfColumns();
  syncPartitionTool();
}

/** Bornes (mm, du bas de la niche au dessous de l'étagère) d'une étagère dans la niche `volume`. */
function shelfBounds(volume, cabinet) {
  const thickness = Number(cabinet?.thickness) || 18;
  return { min: SHELF_MIN_GAP, max: volume.h - thickness - SHELF_MIN_GAP };
}

function shelfTooLowHint(cabinet) {
  const thickness = Number(cabinet?.thickness) || 18;
  return `Niche trop basse pour une étagère : il faut au moins ${fmt(2 * SHELF_MIN_GAP + thickness)} cm de haut.`;
}

/** Ramène la valeur saisie de l'étagère dans ses bornes (champ et curseur). */
function clampShelfInput() {
  const input = $('#shelf-position');
  const range = $('#shelf-range');
  const value = Number(input.value);
  const min = Number(input.min);
  const max = Number(input.max);
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return false;
  const clamped = Math.min(max, Math.max(min, value));
  if (clamped === value) return false;
  input.value = String(clamped);
  range.value = input.value;
  syncShelfColumns();
  return true;
}

function shelfColumnOptionsFromPartitions(volume, partitions, clearance) {
  const sorted = [...partitions].sort((a, b) => a.position_from_left - b.position_from_left);
  const cuts = [
    { id: null, label: 'Côté gauche', left: 0, right: 0 },
    ...sorted.map((partition) => ({
      id: partition.id,
      label: `Séparation à ${fmt(partition.position_from_left)} cm`,
      left: partition.position_from_left - partition.width / 2,
      right: partition.position_from_left + partition.width / 2,
    })),
    { id: null, label: 'Côté droit', left: volume.w, right: volume.w },
  ];

  const options = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const leftCut = cuts[index];
    const rightCut = cuts[index + 1];
    const left = index === 0 ? 0 : leftCut.right;
    const right = index + 1 === cuts.length - 1 ? volume.w : rightCut.left;
    const width = Math.max(0, right - left - 2 * clearance);
    const full = sorted.length === 0;
    const leftToken = leftCut.id === null ? 'side' : String(leftCut.id);
    const rightToken = rightCut.id === null ? 'side' : String(rightCut.id);
    options.push({
      value: `${leftToken}|${rightToken}`,
      label: full
        ? `Toute la largeur · ${fmt(width)} cm`
        : `${leftCut.label} → ${rightCut.label} · ${fmt(width)} cm`,
      leftLabel: leftCut.label,
      rightLabel: rightCut.label,
      left,
      right,
      width,
      full,
      disabled: width < 1,
    });
  }
  return options;
}

function shelfColumnOptions(volume, height, thickness, clearance) {
  const partitions = (sceneData.components || []).filter(
    (component) => component.type === 'partition_v'
      && component.volume_id === volume.id
      && component.position_from_bottom <= height + 0.01
      && component.position_from_bottom + component.height >= height + thickness - 0.01,
  );
  return shelfColumnOptionsFromPartitions(volume, partitions, clearance);
}

function syncShelfToolModeUI() {
  const series = shelfToolMode === 'series';
  $$('[data-shelf-tool]').forEach((button) => {
    const active = button.dataset.shelfTool === shelfToolMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const singlePane = $('[data-shelf-pane="single"]');
  const seriesPane = $('[data-shelf-pane="series"]');
  const singleButton = $('#btn-shelf');
  const seriesButton = $('#btn-shelf-series');
  const actionHint = $('#shelf-action-hint');
  if (singlePane) singlePane.hidden = series;
  if (seriesPane) seriesPane.hidden = !series;
  if (singleButton) singleButton.hidden = series;
  if (seriesButton) seriesButton.hidden = !series;
  if (actionHint) {
    actionHint.textContent = series
      ? 'La série remplit toute la niche sélectionnée : espaces égaux du dessous au dessus.'
      : 'La longueur suit la colonne choisie ; la profondeur suit la niche.';
  }
}

function setShelfToolMode(mode) {
  const nextMode = mode === 'series' ? 'series' : 'single';
  if (nextMode === shelfToolMode) return;
  shelfToolMode = nextMode;
  if (nextMode === 'series') {
    // La série agit sur la niche entière : on repart de la niche de l'élément
    // sélectionné, sans repère de limite à choisir.
    const component = currentComponent();
    if (component) {
      selectedVolumeId = component.volume_id;
      clearComponentSelection();
    }
  }
  syncShelfToolModeUI();
  renderTree();
  renderSelection();
  updateToolBounds();
  render3D();
  updateViewportActionHint();
}

function syncSideToolModeUI() {
  const series = sideToolMode === 'series';
  $$('[data-side-tool]').forEach((button) => {
    const active = button.dataset.sideTool === sideToolMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const singlePane = $('[data-side-pane="single"]');
  const seriesPane = $('[data-side-pane="series"]');
  const singleButton = $('#btn-side');
  const seriesButton = $('#btn-side-series');
  if (singlePane) singlePane.hidden = series;
  if (seriesPane) seriesPane.hidden = !series;
  if (singleButton) singleButton.hidden = series;
  if (seriesButton) seriesButton.hidden = !series;
  syncSideSeries();
}

function setSideToolMode(mode) {
  const nextMode = mode === 'series' ? 'series' : 'single';
  if (nextMode === sideToolMode) return;
  sideToolMode = nextMode;
  syncSideToolModeUI();
  updateToolBounds();
  render3D();
  updateViewportActionHint();
}

function sideSeriesCount() {
  const raw = Number($('#side-count')?.value);
  return Number.isFinite(raw) ? Math.max(1, Math.min(8, Math.round(raw))) : 2;
}

function syncSideSeries() {
  const hint = $('#side-series-hint');
  const button = $('#btn-side-series');
  const count = sideSeriesCount();
  const volume = currentVolume();
  if (button) {
    button.textContent = `Créer ${count} côté${count > 1 ? 's' : ''}`;
  }
  if (!hint) return;
  if (!volume) {
    hint.textContent = 'Sélectionnez une niche pour créer la série.';
    return;
  }
  if (!volume.is_leaf) {
    hint.textContent = 'Ce volume est déjà divisé : choisissez une niche libre.';
    return;
  }
  hint.textContent = `${count} côté${count > 1 ? 's' : ''} créeront ${count + 1} compartiments de largeur égale.`;
}

function shelfSeriesVolume() {
  const component = currentComponent();
  if (component) return volumeById.get(component.volume_id) || null;
  return currentVolume();
}

function shelfSeriesPlan() {
  const cabinet = currentCabinet();
  const rawCount = Number($('#shelf-count')?.value);
  const count = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(20, Math.round(rawCount)))
    : 5;
  const volume = shelfSeriesVolume();
  const thickness = Number(cabinet.thickness) || 18;
  const base = { volume, count, thickness, error: null };

  if (!volume) {
    return { ...base, error: 'Sélectionnez une niche pour créer la série.' };
  }
  if (!volume.is_leaf) {
    return { ...base, error: 'Choisissez une niche libre (sans séparation).' };
  }

  const available = volume.h - count * thickness;
  if (available <= 0) {
    return {
      ...base,
      error: `${count} étagère${count > 1 ? 's' : ''} de ${fmt(thickness)} cm ne tiennent pas dans ${fmt(volume.h)} cm.`,
    };
  }
  const gap = available / (count + 1);
  if (gap < SHELF_MIN_GAP - 0.01) {
    return {
      ...base,
      error: `Espace entre étagères trop faible : ${fmt(gap, 1)} cm (minimum ${fmt(SHELF_MIN_GAP)} cm). Réduisez le nombre.`,
    };
  }

  return { ...base, span: volume.h, gap, error: null };
}

function syncShelfSeriesTool() {
  syncShelfToolModeUI();
  const hint = $('#shelf-series-hint');
  const button = $('#btn-shelf-series');
  if (!hint || !button) return;

  const plan = shelfSeriesPlan();
  const count = plan.count;
  button.textContent = `Créer ${count} étagère${count > 1 ? 's' : ''}`;

  if (plan.error) {
    button.disabled = true;
    hint.textContent = plan.error;
    return;
  }

  button.disabled = false;
  hint.textContent = `${count} étagère${count > 1 ? 's' : ''} de ${fmt(plan.thickness)} cm · espaces égaux de ${fmt(plan.gap, 1)} cm dans la niche.`;
}

function syncMovePanel() {
  const sourceLabel = $('#move-source');
  const hint = $('#move-hint');
  const clearButton = $('#btn-move-clear');
  const scopeSelect = $('#move-scope');
  if (!sourceLabel || !hint || !clearButton) return;

  $$('[data-move-mode]').forEach((button) => {
    const active = button.dataset.moveMode === moveMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (scopeSelect) {
    scopeSelect.disabled = Boolean(moveSource?.isMulti);
    scopeSelect.value = moveScope;
  }

  const scopeHint = $('#move-scope-hint');
  if (scopeHint) {
    scopeHint.textContent = moveSource?.isMulti
      ? 'Les étagères sélectionnées conserveront leur niveau d’origine dans le caisson.'
      : (moveScope === 'single'
        ? 'L’étagère conservera le même niveau que dans le caisson.'
        : 'Toute la série conservera son niveau d’origine dans le caisson.');
  }

  if (!moveSource) {
    sourceLabel.textContent = 'Aucun élément sélectionné.';
    hint.textContent = 'Cliquez l’étagère d’origine dans la vue 3D ou le Navigateur.';
    clearButton.disabled = true;
    return;
  }

  const slotLabel = moveSource.rootSlot ? `niche ${moveSource.rootSlot}` : 'niche';
  if (moveSource.isMulti) {
    sourceLabel.textContent = `Sélection de ${moveSource.count} étagères · ${slotLabel}`;
  } else {
    sourceLabel.textContent = moveScope === 'single' && moveSource.componentId
      ? `Étagère seule · ${slotLabel} (série de ${moveSource.count})`
      : `Série de ${moveSource.count} étagère${moveSource.count > 1 ? 's' : ''} · ${slotLabel}`;
  }
  clearButton.disabled = false;
  const action = moveMode === 'copy' ? 'copiée' : 'déplacée';
  hint.textContent = moveSource.isMulti
    ? `Cliquez la niche de destination (ou la face d’un côté / d’une séparation) : les ${moveSource.count} étagères seront ${action}s à leurs niveaux d’origine, ou réparties pour tenir dans la niche.`
    : (moveScope === 'single'
      ? `Cliquez la niche de destination (ou la face d’un côté / d’une séparation) : l’étagère sera ${action} au même niveau dans le caisson si elle tient, sinon placée au plus près.`
      : `Cliquez la niche de destination (ou la face d’un côté / d’une séparation) : la série sera ${action} à ses niveaux d’origine, ou répartie pour tenir dans la niche.`);
}

function moveHighlightIds() {
  if (!moveSource) return [];
  if (moveSource.componentIds?.length) {
    return moveSource.componentIds;
  }
  if (moveScope === 'single' && moveSource.componentId) {
    return [moveSource.componentId];
  }
  return shelvesInSubtree(moveSource.rootId).map((shelf) => shelf.id);
}

function refreshMoveView() {
  syncMovePanel();
  renderTree();
  render3D();
  updateViewportActionHint();
}

function setMoveSourceFromComponent(component) {
  if (!component || !componentIsShelf(component)) {
    toast('Sélectionnez une étagère à déplacer.', true);
    return;
  }
  const root = shelfGroupRoot(component.volume_id);
  if (!root) return;
  const count = shelvesInSubtree(root.id).length;
  moveSource = {
    rootId: root.id,
    componentId: component.id,
    volumeId: component.volume_id,
    count,
    rootSlot: (root.slot || '').toUpperCase(),
  };
  // Un clic sur une étagère précise cible cette étagère seule. La portée
  // « série » reste disponible dans le sélecteur pour déplacer tout le groupe.
  moveScope = 'single';
  selectedVolumeId = component.volume_id;
  setComponentSelection([component.id], component.id);
  selectedCarcassSide = null;
  refreshMoveView();
}

function setMoveSourceFromVolume(volumeId) {
  const root = shelfGroupRoot(volumeId);
  const shelves = root ? shelvesInSubtree(root.id) : [];
  if (!root || !shelves.length) {
    toast('Cette niche ne contient aucune étagère.', true);
    return;
  }
  moveSource = {
    rootId: root.id,
    componentId: null,
    volumeId: root.id,
    count: shelves.length,
    rootSlot: (root.slot || '').toUpperCase(),
  };
  moveScope = 'series';
  selectedVolumeId = root.id;
  clearComponentSelection();
  selectedCarcassSide = null;
  refreshMoveView();
}

function clearMoveSource() {
  moveSource = null;
  moveScope = 'series';
  if (activeTool === 'move') {
    clearComponentSelection();
  }
  refreshMoveView();
}

function setMoveMode(mode) {
  moveMode = mode === 'copy' ? 'copy' : 'move';
  syncMovePanel();
}

function setMoveScope(scope) {
  if (moveSource?.isMulti) return;
  moveScope = scope === 'single' ? 'single' : 'series';
  if (moveScope === 'single' && !moveSource?.componentId) {
    moveScope = 'series';
    toast('Sélectionnez d’abord une étagère précise.', true);
  }
  refreshMoveView();
}

async function executeMove(targetId) {
  if (!moveSource) return;
  setBusy(true);
  try {
    const data = await api('/move/', {
      method: 'POST',
      body: JSON.stringify({
        source_volume_id: moveSource.rootId,
        source_component_id: moveSource.componentIds
          ? null
          : (moveScope === 'single' ? moveSource.componentId : null),
        source_component_ids: moveSource.componentIds || null,
        target_volume_id: targetId,
        copy: moveMode === 'copy',
      }),
    });
    clearMoveSource();
    applyScene(data.scene, data.message);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(false);
  }
}

/**
 * Détermine la niche de destination à partir d'un clic 3D.
 *
 * L'utilisateur peut cliquer :
 *  - l'intérieur d'une niche (boîte de volume) ;
 *  - la face intérieure d'un côté, d'une séparation, d'une étagère ou du fond.
 * Dans ce dernier cas, on sonde légèrement derrière la face cliquée pour
 * trouver la niche adjacente. Si le clic tombe sur la face avant d'un panneau,
 * on prend la niche la plus proche du point cliqué (le côté du panneau où se
 * trouve le clic départage gauche/droite ou dessus/dessous).
 */
function moveTargetVolumeFromHits(hits) {
  const cabinet = currentCabinet();
  if (!cabinet) return null;
  const width = Number(cabinet.width) || 0;
  const height = Number(cabinet.height) || 0;
  const depth = Number(cabinet.depth) || 0;
  const volumeBoxes = (sceneData.boxes || []).filter(
    (box) => box.kind === 'volume' && box.volume_id && !isVolumeHidden(box.volume_id),
  );
  if (!volumeBoxes.length) return null;

  // Les boîtes de scène sont exprimées dans le repère du caisson (origine en
  // bas à gauche) alors que les maillages sont centrés sur l'origine.
  const toLocal = (point) => ({
    x: point.x + width / 2,
    y: point.y + height / 2,
    z: point.z + depth / 2,
  });

  const contains = (box, point, tolerance = 1.5) => (
    point.x >= box.x - tolerance
    && point.x <= box.x + box.w + tolerance
    && point.y >= box.y - tolerance
    && point.y <= box.y + box.h + tolerance
    && point.z >= box.z - tolerance
    && point.z <= box.z + box.d + tolerance
  );

  const distanceToBox = (box, point) => {
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w));
    const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h));
    const dz = Math.max(box.z - point.z, 0, point.z - (box.z + box.d));
    return Math.hypot(dx, dy, dz);
  };

  const isPanelHit = (hit) => {
    const data = hit.object?.userData || {};
    return Boolean(data.componentId || data.carcassId || data.kind === 'back');
  };

  const resolvePanel = (hit) => {
    if (!hit.point) return null;
    const localPoint = toLocal(hit.point);
    // Clic sur une face intérieure : la normale pointe vers la niche.
    if (hit.face?.normal) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const probe = toLocal(hit.point.clone().addScaledVector(normal, 4));
      const inside = volumeBoxes.find((box) => contains(box, probe));
      if (inside) return inside.volume_id;
    }

    // Face avant / arête : on choisit la niche la plus proche du point cliqué.
    let best = null;
    let bestDistance = Infinity;
    for (const box of volumeBoxes) {
      const distance = distanceToBox(box, localPoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = box;
      }
    }
    return best && bestDistance <= 40 ? best.volume_id : null;
  };

  // Les boîtes de volume sont invisibles : un panneau situé derrière elles
  // est la vraie surface cliquée. On le traite en priorité pour ne pas
  // confondre la niche traversée par le rayon avec la niche cliquée.
  for (const hit of hits.filter(isPanelHit)) {
    const resolved = resolvePanel(hit);
    if (resolved) return resolved;
  }

  // Repli : aucun panneau exploitable (fond masqué, niche vide), on prend la
  // première boîte de volume touchée par le rayon.
  for (const hit of hits) {
    const data = hit.object?.userData || {};
    if (data.kind === 'volume' && data.volumeId) return data.volumeId;
  }
  return null;
}

function handleMoveClick({ volumeId, componentId }) {
  const component = componentId
    ? (sceneData.components || []).find((item) => item.id === componentId)
    : null;

  if (!moveSource) {
    if (component && componentIsShelf(component)) {
      setMoveSourceFromComponent(component);
      return;
    }
    if (volumeId && !componentId) {
      setMoveSourceFromVolume(volumeId);
      return;
    }
    toast('Cliquez une étagère à déplacer.', true);
    return;
  }

  if (!volumeId || componentId) {
    toast('Cliquez une niche libre comme destination.', true);
    return;
  }
  const target = volumeById.get(volumeId);
  if (!target || !target.is_leaf) {
    toast('Choisissez une niche libre comme destination.', true);
    return;
  }
  executeMove(target.id);
}

function handleMoveTreeClick(row) {
  const componentId = Number(row.dataset.componentId);
  const volumeId = Number(row.dataset.volumeId);
  if (moveSource) {
    if (!volumeId || componentId) {
      toast('Cliquez une niche libre comme destination.', true);
      return;
    }
    const target = volumeById.get(volumeId);
    if (!target || !target.is_leaf) {
      toast('Choisissez une niche libre comme destination.', true);
      return;
    }
    executeMove(target.id);
    return;
  }
  if (componentId) {
    const component = (sceneData.components || []).find((item) => item.id === componentId);
    if (component && componentIsShelf(component)) {
      setMoveSourceFromComponent(component);
      return;
    }
  }
  if (volumeId) {
    setMoveSourceFromVolume(volumeId);
    return;
  }
  toast('Cliquez une étagère à déplacer.', true);
}

function syncShelfColumns() {
  syncShelfToolModeUI();
  if (shelfToolMode === 'series') {
    syncShelfSeriesTool();
    return;
  }
  const select = $('#shelf-column');
  const hint = $('#shelf-column-hint');
  const button = $('#btn-shelf');
  if (!select || !hint || !button) return;

  const volume = currentVolume();
  const cabinet = currentCabinet();
  if (!volume || !volume.is_leaf) {
    select.innerHTML = '<option value="">Aucune niche libre</option>';
    select.disabled = true;
    button.disabled = true;
    hint.textContent = volume
      ? 'Ce volume est déjà divisé : choisissez une niche libre.'
      : 'Sélectionnez une niche.';
    return;
  }

  const mode = $('#shelf-mode').value;
  const raw = Number($('#shelf-position').value);
  let height = mode === 'ratio' ? (raw / 100) * volume.h : raw;
  if (!Number.isFinite(height)) height = 10;
  const thickness = Number(cabinet.thickness) || 18;
  const clearance = Math.max(0, Number(cabinet.shelf_side_clearance) || 0);
  const options = shelfColumnOptions(volume, height, thickness, clearance);
  const previous = shelfColumnValue || select.value;
  select.innerHTML = options
    .map((option) => `<option value="${option.value}"${option.disabled ? ' disabled' : ''}>${option.label}</option>`)
    .join('');

  const usable = options.filter((option) => !option.disabled);
  let selected = usable.find((option) => option.value === previous);
  if (!selected) selected = usable[0] || null;
  select.value = selected ? selected.value : '';
  shelfColumnValue = selected ? selected.value : null;
  select.disabled = !usable.length;

  if (!selected) {
    button.disabled = true;
    hint.textContent = options.length
      ? 'Aucune colonne assez large à cette hauteur.'
      : 'Aucune colonne disponible à cette hauteur.';
    return;
  }

  button.disabled = false;
  if (selected.full) {
    hint.textContent = `Étagère de ${fmt(selected.width)} cm de large, centrée dans la niche.`;
  } else {
    hint.textContent = `Étagère de ${fmt(selected.width)} cm de large entre ${selected.leftLabel.toLowerCase()} et ${selected.rightLabel.toLowerCase()}.`;
  }
}

function syncPartitionTool() {
  const picksHost = $('#partition-picks');
  const hint = $('#partition-hint');
  const button = $('#btn-partition');
  const modeSelect = $('#partition-mode');
  const range = $('#partition-range');
  const number = $('#partition-position');
  if (!picksHost || !hint || !button || !modeSelect || !range || !number) return;

  $$('[data-partition-edge]').forEach((edgeButton) => {
    const active = edgeButton.dataset.partitionEdge === partitionEdge;
    edgeButton.classList.toggle('active', active);
    edgeButton.setAttribute('aria-pressed', String(active));
  });

  const { components, picks, volume, boundaries } = getPartitionSelection();

  const pickRows = boundaries.map((boundary, index) => {
    const role = boundaries.length === 2 ? (index === 0 ? 'Basse' : 'Haute') : '1';
    if (boundary.type === 'shelf') {
      const shelf = boundary.shelf;
      return `<div class="partition-pick">
        <span class="partition-rank">${role}</span>
        <span>Étagère à ${fmt(shelf.position_from_bottom)} cm · ${fmt(shelf.width)} × ${fmt(shelf.depth)} cm</span>
        <button type="button" title="Retirer cette étagère" data-remove-partition-pick="${shelf.id}">×</button>
      </div>`;
    }
    const isBottom = boundary.type === 'bottom';
    return `<div class="partition-pick is-edge">
      <span class="partition-rank">${role}</span>
      <span>${isBottom ? 'Dessous de la niche' : 'Dessus de la niche'}</span>
      <button type="button" title="Retirer cette limite" data-remove-partition-edge="${isBottom ? 'bottom' : 'top'}">×</button>
    </div>`;
  });
  if (!boundaries.length) {
    pickRows.push('<div class="partition-pick is-empty">Aucune limite sélectionnée.</div>');
  } else if (boundaries.length < 2) {
    pickRows.push('<div class="partition-pick is-empty">Choisissez la deuxième limite : une étagère, le dessous ou le dessus…</div>');
  }
  picksHost.innerHTML = pickRows.join('');

  range.disabled = true;
  number.disabled = true;
  button.disabled = true;

  if (!volume) {
    hint.textContent = 'Sélectionnez une étagère, puis Dessous ou Dessus.';
    return;
  }
  if (!volume.is_leaf) {
    hint.textContent = 'Choisissez une niche libre : ce volume est déjà divisé.';
    return;
  }
  if (!picks.length) {
    hint.textContent = partitionEdge
      ? "Cliquez sur l'étagère qui doit servir de limite, ou sur une niche pour choisir l'étagère la plus proche."
      : 'Sélectionnez une étagère, puis Dessous ou Dessus.';
    return;
  }
  if (picks.some((shelf) => shelf.volume_id !== volume.id)) {
    hint.textContent = 'Les deux étagères doivent appartenir à la même niche.';
    return;
  }
  if (boundaries.length !== 2) {
    hint.textContent = boundaries.length > 2
      ? 'Retirez une limite pour ne garder que deux repères.'
      : (partitionEdge
        ? 'Choisissez une étagère pour compléter la séparation.'
        : 'Choisissez une deuxième étagère, ou cliquez sur Dessous/Dessus.');
    return;
  }

  const column = partitionColumnFromPicks(volume, picks);
  if (!column) {
    hint.textContent = 'Les deux étagères ne sont pas dans la même colonne.';
    return;
  }
  const shelves = partitionColumnShelves(volume, column);
  const where = column.full ? 'de la niche' : 'de la colonne';
  if (picks.length === 2) {
    const lowerIndex = shelves.findIndex((shelf) => shelf.id === picks[0].id);
    const upperIndex = shelves.findIndex((shelf) => shelf.id === picks[1].id);
    if (lowerIndex < 0 || upperIndex !== lowerIndex + 1) {
      hint.textContent = `Choisissez deux étagères adjacentes ${where} : une autre étagère se trouve entre elles.`;
      return;
    }
  } else if (partitionEdge === 'bottom') {
    if (shelves[0]?.id !== picks[0].id) {
      hint.textContent = `Pour partir du dessous, l'étagère doit être la plus basse ${where} (celle à ${fmt(shelves[0].position_from_bottom)} cm). Sinon la séparation traverserait une étagère.`;
      return;
    }
  } else if (partitionEdge === 'top') {
    if (shelves[shelves.length - 1]?.id !== picks[0].id) {
      hint.textContent = `Pour aller jusqu'au dessus, l'étagère doit être la plus haute ${where} (celle à ${fmt(shelves[shelves.length - 1].position_from_bottom)} cm). Sinon la séparation traverserait une étagère.`;
      return;
    }
  }

  const lower = boundaries[0];
  const upper = boundaries[1];
  const lowerEdgeY = lower.type === 'shelf'
    ? lower.shelf.position_from_bottom + lower.shelf.height
    : 0;
  const upperEdgeY = upper.type === 'shelf'
    ? upper.shelf.position_from_bottom
    : volume.h;
  const gap = upperEdgeY - lowerEdgeY;
  if (gap < 40 - 0.01) {
    hint.textContent = `Espace insuffisant entre les limites : ${fmt(gap, 1)} cm (minimum 4 cm).`;
    return;
  }

  const cabinet = currentCabinet();
  const min = Math.max(
    cabinet.thickness / 2 + 50,
    column.left + cabinet.thickness / 2 + 50,
  );
  const max = Math.min(
    volume.w - cabinet.thickness / 2 - 50,
    column.right - cabinet.thickness / 2 - 50,
  );
  if (max <= min) {
    hint.textContent = column.full
      ? `Niche trop étroite pour une séparation (${fmt(volume.w, 1)} cm).`
      : `Colonne trop étroite pour une séparation (${fmt(column.width, 1)} cm).`;
    return;
  }

  const mode = modeSelect.value;
  let current = Number(number.value);
  let detail;
  if (mode === 'ratio') {
    const minRatio = Math.max(0, ((min - column.left) / column.width) * 100);
    const maxRatio = Math.min(100, ((max - column.left) / column.width) * 100);
    range.min = minRatio.toFixed(1);
    range.max = maxRatio.toFixed(1);
    range.step = '0.5';
    number.min = minRatio.toFixed(1);
    number.max = maxRatio.toFixed(1);
    number.step = '0.5';
    if (!Number.isFinite(current) || current < minRatio || current > maxRatio) {
      current = Math.min(maxRatio, Math.max(minRatio, 50));
    }
    range.value = String(current);
    number.value = range.value;
    detail = `Position du centre : ${fmtPct(minRatio, 1)} à ${fmtPct(maxRatio, 1)} % ${column.full ? 'de la niche' : 'de la colonne'} (${fmt(min)} à ${fmt(max)} cm).`;
  } else {
    range.min = (min / 10).toFixed(1);
    range.max = (max / 10).toFixed(1);
    range.step = '0.5';
    number.min = (min / 10).toFixed(1);
    number.max = (max / 10).toFixed(1);
    number.step = '0.5';
    if (!Number.isFinite(current) || current < min / 10 || current > max / 10) {
      current = ((min + max) / 2 / 10).toFixed(1);
    }
    range.value = String(current);
    number.value = range.value;
    detail = `Position du centre : ${fmt(min)} à ${fmt(max)} cm.`;
  }

  range.disabled = false;
  number.disabled = false;
  button.disabled = false;
  const lowerLabel = lower.type === 'bottom'
    ? 'le dessous de la niche'
    : (lower.type === 'top'
      ? 'le dessus de la niche'
      : `l'étagère à ${fmt(lower.shelf.position_from_bottom)} cm`);
  const upperLabel = upper.type === 'top'
    ? 'le dessus de la niche'
    : (upper.type === 'bottom'
      ? 'le dessous de la niche'
      : `l'étagère à ${fmt(upper.shelf.position_from_bottom)} cm`);
  const columnLabel = column.full
    ? ''
    : ` (colonne ${column.leftLabel.toLowerCase()} → ${column.rightLabel.toLowerCase()})`;
  hint.textContent = `Séparation de ${fmt(gap)} cm de haut entre ${lowerLabel} et ${upperLabel}${columnLabel}. ${detail}`;
}

function updateViewportActionHint() {
  const hint = $('#viewport-action-hint');
  if (!hint) return;
  if (activeTool === 'measure') {
    hint.textContent = cabinetHidden
      ? 'Caisson masqué : affichez-le pour mesurer'
      : 'Clic : choisir une face, une arête ou un sommet';
  } else if (activeTool === 'shelf' && shelfToolMode === 'series') {
    hint.textContent = 'Clic : choisir la niche à remplir d’étagères';
  } else if (activeTool === 'move') {
    hint.textContent = moveSource
      ? 'Clic : niche de destination, ou face d’un côté / d’une séparation'
      : 'Clic : choisir l’étagère à déplacer';
  } else if (NICHE_CLICK_TOOLS.includes(activeTool)) {
    hint.textContent = 'Clic : choisir la niche · clic sur un panneau : le sélectionner';
  } else {
    hint.textContent = 'Clic : sélectionner un élément · Double-clic : sélectionner une niche';
  }
}

function activateTool(nextTool) {
  if (nextTool !== activeTool) {
    if (activeTool === 'measure' || nextTool === 'measure') {
      clearMeasurement();
    }
    if (nextTool === 'partition') {
      const component = currentComponent();
      partitionShelfIds = component?.type === 'shelf' ? [component.id] : [];
      partitionEdge = null;
      if (component?.type === 'shelf') selectedVolumeId = component.volume_id;
      clearComponentSelection();
    } else {
      partitionShelfIds = [];
      partitionEdge = null;
    }
    if (nextTool !== 'shelf') {
      shelfToolMode = 'single';
    }
    if (nextTool !== 'side') {
      sideToolMode = 'single';
      syncSideToolModeUI();
    }
    if (nextTool !== 'move') {
      moveSource = null;
    }
    if (nextTool !== 'split') {
      splitToolMode = 'single';
      syncSplitToolModeUI();
    }
  }
  activeTool = nextTool;
  $$('.tool-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tool === nextTool));
  $$('.editor-toolbar [data-toolbar-tool]').forEach((b) => b.classList.toggle('active', b.dataset.toolbarTool === nextTool));
  $$('.tool-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === nextTool && !panel.hidden));
  if (renderer) {
    renderer.domElement.style.cursor = FINE_ARROW_CURSOR;
  }
  updateViewportActionHint();
  if (nextTool === 'measure') renderMeasurePanel();
  if (nextTool === 'move') syncMovePanel();
  renderTree();
  renderSelection();
  render3D();
  updateToolBounds();
}

function bindToolTabs() {
  updateViewportActionHint();
  $$('.tool-tabs button').forEach((button) => {
    button.addEventListener('click', () => activateTool(button.dataset.tool));
  });
}

function bindEditorToolbar() {
  $$('.editor-toolbar [data-toolbar-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      activateRightTab('tools');
      activateTool(button.dataset.toolbarTool);
    });
  });
}

// The right panel has three tabs, each a group of panels: « Sélection et outil » (selection, tools),
// « Fabrication » (cut list, nesting, checks), « Devis et croquis » (quote, sketch). A panel's name opens its group.
const RIGHT_TAB_KEY = 'poly.cabinet.tab';
function activateRightTab(tab) {
  const panel = document.querySelector(`.editor-right .tab-panel[data-panel="${tab}"]`);
  const group = panel?.dataset.group || tab;
  const button = document.querySelector(`.editor-right .tabs button[data-tab="${group}"]`);
  if (!button) return;
  $$('.editor-right .tabs button').forEach((b) => b.classList.toggle('active', b === button));
  $$('.editor-right .tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.group === group));
  if (group === 'quote') renderSketch();
  if (group === 'fabrication') renderNesting();
  try { localStorage.setItem(RIGHT_TAB_KEY, group); } catch { /* this page only */ }
}

function bindRightTabs() {
  $$('.tabs button').forEach((button) => {
    button.addEventListener('click', () => activateRightTab(button.dataset.tab));
  });
  let saved = null;
  try { saved = localStorage.getItem(RIGHT_TAB_KEY); } catch { /* none */ }
  if (saved && saved !== 'selection') requestAnimationFrame(() => activateRightTab(saved));
}

function bindSliders() {
  const pairs = [
    ['#split-range', '#split-position'],
    ['#side-range', '#side-position'],
    ['#shelf-range', '#shelf-position'],
    ['#partition-range', '#partition-position'],
  ];
  pairs.forEach(([rangeSelector, numberSelector]) => {
    const range = $(rangeSelector);
    const number = $(numberSelector);
    const isShelfPair = rangeSelector === '#shelf-range';
    range.addEventListener('input', () => {
      number.value = range.value;
      if (isShelfPair) syncShelfColumns();
    });
    number.addEventListener('input', () => {
      range.value = number.value;
      if (isShelfPair) syncShelfColumns();
    });
    if (isShelfPair) number.addEventListener('change', clampShelfInput);
  });
}

function bindForms() {
  $$('[data-measure-mode]').forEach((button) => {
    button.addEventListener('click', () => setMeasureMode(button.dataset.measureMode));
  });
  $('#btn-measure-clear').addEventListener('click', clearMeasurement);
  $('#split-direction').addEventListener('change', updateToolBounds);
  $('#split-mode').addEventListener('change', updateToolBounds);
  $('#side-mode').addEventListener('change', updateToolBounds);
  $$('[data-side-tool]').forEach((button) => {
    button.addEventListener('click', () => setSideToolMode(button.dataset.sideTool));
  });
  const sideCountInput = $('#side-count');
  if (sideCountInput) {
    sideCountInput.addEventListener('input', () => {
      if (sideToolMode === 'series') syncSideSeries();
    });
    sideCountInput.addEventListener('change', () => {
      const value = Math.round(Number(sideCountInput.value) || 2);
      sideCountInput.value = String(Math.max(1, Math.min(8, value)));
      if (sideToolMode === 'series') syncSideSeries();
    });
  }
  $$('[data-split-tool]').forEach((button) => {
    button.addEventListener('click', () => setSplitToolMode(button.dataset.splitTool));
  });
  ['#grid-columns', '#grid-rows', '#grid-column-widths', '#grid-row-heights', '#grid-top-height']
    .forEach((selector) => {
      const input = $(selector);
      if (input) input.addEventListener('input', syncCompartmentGrid);
    });
  const gridTopRow = $('#grid-top-row');
  if (gridTopRow) gridTopRow.addEventListener('change', syncCompartmentGrid);
  $('#shelf-mode').addEventListener('change', updateToolBounds);
  $$('[data-shelf-tool]').forEach((button) => {
    button.addEventListener('click', () => setShelfToolMode(button.dataset.shelfTool));
  });
  const shelfCountInput = $('#shelf-count');
  if (shelfCountInput) {
    shelfCountInput.addEventListener('input', () => {
      if (shelfToolMode === 'series') syncShelfColumns();
    });
    shelfCountInput.addEventListener('change', () => {
      const value = Math.round(Number(shelfCountInput.value) || 5);
      shelfCountInput.value = String(Math.max(1, Math.min(20, value)));
      if (shelfToolMode === 'series') syncShelfColumns();
    });
  }
  $$('[data-move-mode]').forEach((button) => {
    button.addEventListener('click', () => setMoveMode(button.dataset.moveMode));
  });
  const moveScopeSelect = $('#move-scope');
  if (moveScopeSelect) {
    moveScopeSelect.addEventListener('change', () => setMoveScope(moveScopeSelect.value));
  }
  const moveClearButton = $('#btn-move-clear');
  if (moveClearButton) {
    moveClearButton.addEventListener('click', clearMoveSource);
  }
  const sketchDownload = $('#btn-sketch-download');
  if (sketchDownload) {
    sketchDownload.addEventListener('click', downloadSketchSvg);
  }
  const nestingRefresh = $('#btn-nesting-refresh');
  if (nestingRefresh) {
    nestingRefresh.addEventListener('click', renderNesting);
  }
  const saveTemplateButton = $('#btn-save-template');
  if (saveTemplateButton) {
    saveTemplateButton.addEventListener('click', async () => {
      // Asked in the page (dialogs.js): some embedded browsers refuse the browser's own question box.
      const values = await window.polyPrompt('Enregistrer comme modèle', [
        { label: 'Nom du modèle', value: `Modèle ${currentCabinet().name || 'caisson'}` },
        { label: 'Description (facultatif)', value: '' },
      ]);
      if (!values) return;
      const [name, description] = values;
      const form = document.createElement('form');
      form.method = 'post';
      form.action = `${window.location.pathname}modele/creer/`;
      const csrfInput = document.createElement('input');
      csrfInput.type = 'hidden';
      csrfInput.name = 'csrfmiddlewaretoken';
      csrfInput.value = csrfToken;
      form.appendChild(csrfInput);
      const append = (key, value) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      };
      append('template_name', name);
      append('template_description', description);
      document.body.appendChild(form);
      form.submit();
    });
  }
  const hardwareList = $('#hardware-list');
  if (hardwareList) {
    hardwareList.addEventListener('change', async (event) => {
      const input = event.target.closest('input[data-hardware-id]');
      if (!input) return;
      const ruleIds = [...hardwareList.querySelectorAll('input[data-hardware-id]:checked')]
        .map((item) => Number(item.dataset.hardwareId));
      hardwareList.style.opacity = '0.5';
      try {
        const data = await api('/hardware/', {
          method: 'PATCH',
          body: JSON.stringify({ rule_ids: ruleIds }),
        });
        applyScene(data.scene, data.message);
        toast(data.message);
      } catch (error) {
        toast(error.message, true);
        input.checked = !input.checked;
      } finally {
        hardwareList.style.opacity = '';
      }
    });
  }
  $('#partition-mode').addEventListener('change', syncPartitionTool);
  $('#shelf-column').addEventListener('change', () => {
    shelfColumnValue = $('#shelf-column').value || null;
    syncShelfColumns();
  });
  $$('[data-partition-edge]').forEach((button) => {
    button.addEventListener('click', () => togglePartitionEdge(button.dataset.partitionEdge));
  });

  $('#partition-picks').addEventListener('click', (event) => {
    const edgeButton = event.target.closest('[data-remove-partition-edge]');
    if (edgeButton) {
      partitionEdge = null;
      clearComponentSelection();
      renderTree();
      renderSelection();
      render3D();
      updateToolBounds();
      return;
    }
    const button = event.target.closest('[data-remove-partition-pick]');
    if (!button) return;
    const componentId = Number(button.dataset.removePartitionPick);
    partitionShelfIds = partitionShelfIds.filter((id) => id !== componentId);
    clearComponentSelection();
    renderTree();
    renderSelection();
    render3D();
    updateToolBounds();
  });

  $('#btn-split').addEventListener('click', async () => {
    const volume = currentVolume();
    if (!volume) return toast('Sélectionnez une niche.', true);
    if (!volume.is_leaf) return toast('Ce volume est déjà divisé.', true);
    const mode = $('#split-mode').value;
    const raw = Number($('#split-position').value);
    const position = mode === 'ratio' ? raw / 100 : raw * 10;
    setBusy(true);
    try {
      const data = await api('/split/', {
        method: 'POST',
        body: JSON.stringify({
          volume_id: volume.id,
          direction: $('#split-direction').value,
          position,
          mode,
        }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-side').addEventListener('click', async () => {
    const volume = currentVolume();
    if (!volume) return toast('Sélectionnez une niche.', true);
    if (!volume.is_leaf) return toast('Ce volume est déjà divisé.', true);
    const mode = $('#side-mode').value;
    const raw = Number($('#side-position').value);
    const position = mode === 'ratio' ? raw / 100 : raw * 10;
    setBusy(true);
    try {
      const data = await api('/split/', {
        method: 'POST',
        body: JSON.stringify({
          volume_id: volume.id,
          direction: 'vertical',
          position,
          mode,
          side: true,
        }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-side-series').addEventListener('click', async () => {
    const volume = currentVolume();
    if (!volume) return toast('Sélectionnez une niche.', true);
    if (!volume.is_leaf) return toast('Choisissez une niche libre.', true);
    const count = sideSeriesCount();
    setBusy(true);
    try {
      const data = await api('/sides/series/', {
        method: 'POST',
        body: JSON.stringify({ volume_id: volume.id, count }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-grid').addEventListener('click', async () => {
    const plan = compartmentGridPlan();
    if (plan.error) return toast(plan.error, true);
    setBusy(true);
    try {
      const payload = {
        volume_id: plan.volume.id,
        columns: plan.columns,
        rows: plan.rows,
      };
      if (plan.columnWidths) payload.column_widths = plan.columnWidths;
      if (plan.rowHeights) payload.row_heights = plan.rowHeights;
      if (plan.topEnabled) payload.top_row_height = plan.topHeight;
      const data = await api('/compartments/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-shelf').addEventListener('click', async () => {
    const volume = currentVolume();
    if (!volume) return toast('Sélectionnez une niche.', true);
    if (!volume.is_leaf) return toast('Choisissez une niche libre.', true);
    const bounds = shelfBounds(volume, currentCabinet());
    if (bounds.max < bounds.min) return toast(shelfTooLowHint(currentCabinet()), true);
    if (clampShelfInput()) toast("Hauteur ramenée dans les limites de la niche.");
    const mode = $('#shelf-mode').value;
    const raw = Number($('#shelf-position').value);
    const position = mode === 'ratio' ? raw / 100 : raw * 10;
    setBusy(true);
    try {
      const data = await api('/shelves/', {
        method: 'POST',
        body: JSON.stringify({
          volume_id: volume.id,
          position,
          mode,
          depth_clearance_front: Number($('#shelf-clearance').value) || 0,
        }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-shelf-series').addEventListener('click', async () => {
    const volume = shelfSeriesVolume();
    if (!volume) return toast('Sélectionnez une niche.', true);
    if (!volume.is_leaf) return toast('Choisissez une niche libre.', true);
    const count = Math.round(Number($('#shelf-count').value)) || 5;
    setBusy(true);
    try {
      const data = await api('/shelves/series/', {
        method: 'POST',
        body: JSON.stringify({
          volume_id: volume.id,
          count,
          depth_clearance_front: Number($('#shelf-clearance').value) || 0,
        }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-partition').addEventListener('click', async () => {
    const { volume, picks, boundaries } = getPartitionSelection();
    if (!volume) {
      toast('Sélectionnez une étagère dans une niche.', true);
      return;
    }
    if (boundaries.length !== 2) {
      toast('Sélectionnez deux limites pour la séparation.', true);
      return;
    }
    const lower = boundaries[0];
    const upper = boundaries[1];
    const lowerShelfId = lower.type === 'shelf' ? lower.shelf.id : null;
    const upperShelfId = upper.type === 'shelf' ? upper.shelf.id : null;
    if (lowerShelfId === null && upperShelfId === null) {
      toast('Sélectionnez au moins une étagère.', true);
      return;
    }
    const column = partitionColumnFromPicks(volume, picks);
    if (!column) {
      toast('Les deux étagères ne sont pas dans la même colonne.', true);
      return;
    }
    const mode = $('#partition-mode').value;
    const raw = Number($('#partition-position').value);
    if (!Number.isFinite(raw)) {
      toast('Position de la séparation invalide.', true);
      return;
    }
    const center = mode === 'ratio'
      ? column.left + (raw / 100) * column.width
      : raw * 10;
    const position = mode === 'ratio' ? center / volume.w : center;
    setBusy(true);
    try {
      const data = await api('/partitions/', {
        method: 'POST',
        body: JSON.stringify({
          volume_id: volume.id,
          lower_shelf_id: lowerShelfId,
          upper_shelf_id: upperShelfId,
          position,
          mode,
        }),
      });
      // Si la séparation part du dessous ou va jusqu'au dessus, on garde
      // l'étagère sélectionnée pour pouvoir créer la séparation opposée d'un
      // seul clic sur l'autre limite. Entre deux étagères, on repart de zéro.
      const keepsShelf = lowerShelfId === null || upperShelfId === null;
      const keptShelfId = lowerShelfId ?? upperShelfId;
      partitionShelfIds = keepsShelf && keptShelfId ? [keptShelfId] : [];
      partitionEdge = null;
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-plinth').addEventListener('click', async () => {
    setBusy(true);
    try {
      const data = await api('/plinth/', {
        method: 'POST',
        body: JSON.stringify({
          height: Number($('#plinth-height').value) * 10,
          setback: Number($('#plinth-setback').value) * 10,
        }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-plinth-remove').addEventListener('click', async () => {
    setBusy(true);
    try {
      const data = await api('/plinth/delete/', { method: 'DELETE' });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#cab-rail').addEventListener('change', (event) => {
    $('#cab-rail-settings').hidden = !event.target.checked;
  });

  $('#cab-drawers').addEventListener('change', (event) => {
    $('#cab-drawer-settings').hidden = !event.target.checked;
  });

  $('#btn-cabinet').addEventListener('click', async () => {
    setBusy(true);
    try {
      const data = await api('/', {
        method: 'PATCH',
        body: JSON.stringify({
          name: $('#cab-name').value,
          width: Number($('#cab-width').value) * 10,
          height: Number($('#cab-height').value) * 10,
          depth: Number($('#cab-depth').value) * 10,
          material_id: Number($('#cab-material').value),
          waste_percent: Number($('#cab-waste').value),
          door_gap: Number($('#cab-gap').value) * 10,
          has_doors: $('#cab-doors').checked,
          has_hanging_rail: $('#cab-rail').checked,
          hanging_rail_height: Number($('#cab-rail-height').value) * 10,
          has_drawers: $('#cab-drawers').checked,
          drawer_count: Number($('#cab-drawer-count').value),
          drawer_height: Number($('#cab-drawer-height').value) * 10,
        }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#btn-quote').addEventListener('click', async () => {
    setBusy(true);
    try {
      const data = await api('/quote/update/', {
        method: 'PATCH',
        body: JSON.stringify({
          client_name: $('#quote-client').value,
          margin_percent: Number($('#quote-margin').value),
          tax_rate: Number($('#quote-tax').value),
          status: $('#quote-status').value,
        }),
      });
      applyScene(data.scene, data.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  $('#selection-panel').addEventListener('click', async (event) => {
    const deleteButton = event.target.closest('[data-delete-component]');
    if (deleteButton) {
      const componentId = Number(deleteButton.dataset.deleteComponent);
      setBusy(true);
      try {
        const data = await api(`/components/${componentId}/`, { method: 'DELETE' });
        applyScene(data.scene, data.message);
      } catch (error) {
        toast(error.message, true);
      } finally {
        setBusy(false);
      }
      return;
    }
    const multiDelete = event.target.closest('[data-delete-components]');
    if (multiDelete) {
      const ids = [...selectedComponentIds];
      if (!ids.length) return;
      setBusy(true);
      try {
        const data = await api('/components/delete/', {
          method: 'POST',
          body: JSON.stringify({ component_ids: ids }),
        });
        applyScene(data.scene, data.message);
      } catch (error) {
        toast(error.message, true);
      } finally {
        setBusy(false);
      }
      return;
    }
    const multiMove = event.target.closest('[data-move-components]');
    if (multiMove) {
      startMoveFromSelection();
      return;
    }
    const splitButton = event.target.closest('[data-remove-split]');
    if (splitButton) {
      const volumeId = Number(splitButton.dataset.removeSplit);
      setBusy(true);
      try {
        const data = await api(`/volumes/${volumeId}/split/delete/`, { method: 'DELETE' });
        applyScene(data.scene, data.message);
      } catch (error) {
        toast(error.message, true);
      } finally {
        setBusy(false);
      }
    }
  });

  $('#quote-status').value = sceneData.quote?.status_code || 'draft';
}

/* ------------------------------------------------------------------ */
/* Listes et devis                                                    */
/* ------------------------------------------------------------------ */
function aggregatePanels() {
  const map = new Map();
  for (const panel of sceneData.panels || []) {
    const key = [panel.name, panel.material, panel.length, panel.width, panel.thickness].join('|');
    if (!map.has(key)) {
      map.set(key, { ...panel, quantity: 0, area_m2: 0, cost: 0 });
    }
    const row = map.get(key);
    row.quantity += panel.quantity;
    row.area_m2 += panel.area_m2;
    row.cost += panel.cost;
  }
  return Array.from(map.values());
}

function renderCutlist() {
  const cutlist = sceneData.cutlist || { items: [] };
  const stats = sceneData.stats || {};
  const chips = $('#cutlist-chips');
  chips.innerHTML = `
    <span class="chip">${stats.panel_count || 0} panneaux</span>
    <span class="chip">${stats.shelf_count || 0} étagères</span>
    <span class="chip">${stats.separation_count ?? stats.divider_count ?? 0} séparations</span>
    <span class="chip">${fmtPct(sceneData.cabinet.waste_percent)} % chutes</span>
  `;

  const rows = aggregatePanels();
  const body = $('#cutlist-table tbody');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="3" class="empty-mini">Aucun panneau.</td></tr>';
  } else {
    body.innerHTML = rows
      .map(
        (panel) => `<tr>
          <td><strong>${escapeHtml(panel.name)}</strong><br><span class="muted">${escapeHtml(panel.material)}</span></td>
          <td class="num">${fmt(panel.length)} × ${fmt(panel.width)} × ${fmt(panel.thickness)}</td>
          <td class="num">${panel.quantity}</td>
        </tr>`,
      )
      .join('');
  }
  const totalArea = rows.reduce((sum, panel) => sum + panel.area_m2, 0);
  $('#cutlist-totals').innerHTML = `
    <div class="total-row"><span>Surface totale</span><span class="mono">${totalArea.toFixed(3)} m²</span></div>
    <div class="total-row"><span>Coût matière (chutes incluses)</span><span class="mono">${money(cutlist.total_cost)}</span></div>
    <div class="total-row"><span>Éléments distincts</span><span class="mono">${rows.length}</span></div>
  `;
}

function renderQuote() {
  const quote = sceneData.quote;
  const body = $('#quote-table tbody');
  if (!quote) {
    body.innerHTML = '<tr><td colspan="2" class="empty-mini">Devis indisponible.</td></tr>';
    $('#quote-totals').innerHTML = '';
    return;
  }
  $('#quote-client').value = quote.client_name;
  $('#quote-margin').value = Math.round(quote.margin_percent);
  $('#quote-tax').value = quote.tax_rate;
  $('#quote-status').value = quote.status_code;
  body.innerHTML = quote.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="num">${money(line.total)}</td>
      </tr>`,
    )
    .join('') || '<tr><td colspan="2" class="empty-mini">Aucune ligne.</td></tr>';
  $('#quote-totals').innerHTML = `
    <div class="total-row"><span>Matière</span><span class="mono">${money(quote.subtotal_materials)}</span></div>
    <div class="total-row"><span>Quincaillerie</span><span class="mono">${money(quote.subtotal_hardware)}</span></div>
    <div class="total-row"><span>Coût HT</span><span class="mono">${money(quote.total_ht)}</span></div>
    <div class="total-row"><span>Marge ${fmtPct(quote.margin_percent)} %</span><span class="mono">${money(quote.margin_amount)}</span></div>
    <div class="total-row"><span>Total HT</span><span class="mono">${money(quote.total_before_tax)}</span></div>
    <div class="total-row"><span>TVA ${fmtPct(quote.tax_rate, 1)} %</span><span class="mono">${money(quote.tax_amount)}</span></div>
    <div class="total-row grand"><span>Total TTC</span><span class="mono">${money(quote.total_ttc)}</span></div>
  `;
  $('#quote-status').value = quote.status_code;
}

function sketchCategory(box) {
  if (box.kind === 'carcass') return 'Carcasse';
  if (box.label === 'Étagère') return 'Étagères';
  if (box.kind === 'divider') return 'Séparations / côtés';
  if (box.kind === 'plinth') return 'Plinthe';
  if (['foot', 'base', 'skirt'].includes(box.kind)) return 'Zone externe';
  if (box.kind === 'back') return 'Fond';
  if (box.kind === 'door') return 'Façades';
  if (box.kind === 'drawer') return 'Tiroirs';
  if (box.kind === 'rail') return 'Tringles';
  return null;
}

const SKETCH_DIM = '#dc2626';
const SKETCH_EXT = '#9aa7b5';
const SKETCH_TEXT_HALO = 'stroke="#ffffff" stroke-width="2.4" paint-order="stroke" font-weight="600"';

function sketchMergedIntervals(intervals) {
  const solids = intervals
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
    .filter(([a, b]) => b - a > 0.5)
    .sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const iv of solids) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + 0.5) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
}

function sketchGaps(merged, lo, hi) {
  const gaps = [];
  let cursor = lo;
  for (const [a, b] of merged) {
    if (a - cursor > 0.5) gaps.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (hi - cursor > 0.5) gaps.push([cursor, hi]);
  return gaps;
}

function sketchArrow(x, y, dx, dy) {
  const len = 4.8;
  const half = 2.5;
  const nx = x - dx * len;
  const ny = y - dy * len;
  const px = -dy * half;
  const py = dx * half;
  return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${(nx + px).toFixed(1)},${(ny + py).toFixed(1)} ${(nx - px).toFixed(1)},${(ny - py).toFixed(1)}" fill="${SKETCH_DIM}"/>`;
}

function placeSketchChainLabelsH(segments, chainY) {
  const levels = [];
  return segments.map((seg) => {
    const w = seg.label.length * 4.8 + 5;
    const cx = (seg.x1 + seg.x2) / 2;
    let level = 0;
    while (level < levels.length && levels[level] + 4 > cx - w / 2) level += 1;
    if (level === levels.length) levels.push(-Infinity);
    levels[level] = cx + w / 2;
    return { ...seg, cx, level, y: chainY - 5 - level * 9 };
  });
}

function placeSketchChainLabelsV(segments, chainX) {
  const levels = [];
  return segments.map((seg) => {
    const w = seg.label.length * 4.8 + 5;
    const cy = (seg.y1 + seg.y2) / 2;
    let level = 0;
    while (level < levels.length && levels[level] + 4 > cy - w / 2) level += 1;
    if (level === levels.length) levels.push(-Infinity);
    levels[level] = cy + w / 2;
    return { ...seg, cy, level, x: chainX - 5 - level * 9 };
  });
}

function sketchChainH(gaps, toPx, chainY, drawT) {
  const segments = gaps.map(([a, b]) => ({ x1: toPx(a), x2: toPx(b), label: fmt(b - a) }));
  const labeled = placeSketchChainLabelsH(segments, chainY);
  const lines = segments
    .map((seg) => {
      const narrow = seg.x2 - seg.x1 < 15;
      return `<line x1="${seg.x1.toFixed(1)}" y1="${chainY}" x2="${seg.x2.toFixed(1)}" y2="${chainY}" stroke="${SKETCH_DIM}" stroke-width="0.7"/>${sketchArrow(seg.x1, chainY, narrow ? 1 : -1, 0)}${sketchArrow(seg.x2, chainY, narrow ? -1 : 1, 0)}`;
    })
    .join('');
  const labels = labeled
    .map((seg) => `<text x="${seg.cx.toFixed(1)}" y="${seg.y.toFixed(1)}" text-anchor="middle" font-size="8.2" fill="${SKETCH_DIM}" ${SKETCH_TEXT_HALO}>${escapeHtml(seg.label)}</text>`)
    .join('');
  const witnesses = [...new Set(gaps.flat())]
    .map((edge) => `<line x1="${toPx(edge).toFixed(1)}" y1="${chainY + 3}" x2="${toPx(edge).toFixed(1)}" y2="${drawT}" stroke="${SKETCH_EXT}" stroke-width="0.55"/>`)
    .join('');
  return `<g>${lines}${labels}${witnesses}</g>`;
}

function sketchChainV(gaps, toPx, chainX, drawL) {
  const segments = gaps
    .map(([a, b]) => ({ y1: toPx(b), y2: toPx(a), label: fmt(b - a) }))
    .sort((p, q) => p.y1 - q.y1);
  const labeled = placeSketchChainLabelsV(segments, chainX);
  const lines = segments
    .map((seg) => {
      const narrow = seg.y2 - seg.y1 < 15;
      return `<line x1="${chainX}" y1="${seg.y1.toFixed(1)}" x2="${chainX}" y2="${seg.y2.toFixed(1)}" stroke="${SKETCH_DIM}" stroke-width="0.7"/>${sketchArrow(chainX, seg.y1, 0, narrow ? 1 : -1)}${sketchArrow(chainX, seg.y2, 0, narrow ? -1 : 1)}`;
    })
    .join('');
  const labels = labeled
    .map((seg) => `<text x="${seg.x.toFixed(1)}" y="${seg.cy.toFixed(1)}" text-anchor="middle" font-size="8.2" fill="${SKETCH_DIM}" ${SKETCH_TEXT_HALO} transform="rotate(-90 ${seg.x.toFixed(1)} ${seg.cy.toFixed(1)})">${escapeHtml(seg.label)}</text>`)
    .join('');
  const witnesses = [...new Set(gaps.flat())]
    .map((edge) => `<line x1="${chainX - 3}" y1="${toPx(edge).toFixed(1)}" x2="${drawL}" y2="${toPx(edge).toFixed(1)}" stroke="${SKETCH_EXT}" stroke-width="0.55"/>`)
    .join('');
  return `<g>${lines}${labels}${witnesses}</g>`;
}

function sketchTotalDimH(y, x1, x2, drawT, label) {
  return `<g>
    <line x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" stroke="${SKETCH_DIM}" stroke-width="0.8"/>
    ${sketchArrow(x1, y, -1, 0)}${sketchArrow(x2, y, 1, 0)}
    <line x1="${x1.toFixed(1)}" y1="${y + 3}" x2="${x1.toFixed(1)}" y2="${drawT}" stroke="${SKETCH_EXT}" stroke-width="0.55"/>
    <line x1="${x2.toFixed(1)}" y1="${y + 3}" x2="${x2.toFixed(1)}" y2="${drawT}" stroke="${SKETCH_EXT}" stroke-width="0.55"/>
    <text x="${((x1 + x2) / 2).toFixed(1)}" y="${y - 4}" text-anchor="middle" font-size="9" font-weight="700" fill="${SKETCH_DIM}" ${SKETCH_TEXT_HALO}>${escapeHtml(label)}</text>
  </g>`;
}

function sketchTotalDimV(x, y1, y2, drawR, label) {
  const midY = (y1 + y2) / 2;
  const tx = x - 5;
  return `<g>
    <line x1="${x}" y1="${y1.toFixed(1)}" x2="${x}" y2="${y2.toFixed(1)}" stroke="${SKETCH_DIM}" stroke-width="0.8"/>
    ${sketchArrow(x, y1, 0, -1)}${sketchArrow(x, y2, 0, 1)}
    <line x1="${drawR.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x - 3}" y2="${y1.toFixed(1)}" stroke="${SKETCH_EXT}" stroke-width="0.55"/>
    <line x1="${drawR.toFixed(1)}" y1="${y2.toFixed(1)}" x2="${x - 3}" y2="${y2.toFixed(1)}" stroke="${SKETCH_EXT}" stroke-width="0.55"/>
    <text x="${tx.toFixed(1)}" y="${midY.toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="${SKETCH_DIM}" ${SKETCH_TEXT_HALO} transform="rotate(-90 ${tx.toFixed(1)} ${midY.toFixed(1)})">${escapeHtml(label)}</text>
  </g>`;
}

const SKETCH_VIEW_W = 336;
const SKETCH_INNER_W = SKETCH_VIEW_W - 46 - 34;
const SKETCH_VIEW_TOP = 74;
const SKETCH_MAX_DRAW_H = 340;
const SKETCH_M_BOTTOM = 16;
const SKETCH_SUB_GAP = 10;

function sketchFitScale(totalW, totalH, innerW, maxH) {
  let scale = innerW / totalW;
  if (totalH * scale > maxH) scale = maxH / totalH;
  return scale;
}

function sketchFrame(boxes, axis) {
  let lo0 = Infinity;
  let lo1 = Infinity;
  let hi0 = -Infinity;
  let hi1 = -Infinity;
  for (const box of boxes) {
    lo0 = Math.min(lo0, box[axis[0]]);
    hi0 = Math.max(hi0, box[axis[0]] + box[axis[2]]);
    lo1 = Math.min(lo1, box[axis[1]]);
    hi1 = Math.max(hi1, box[axis[1]] + box[axis[3]]);
  }
  return { lo0, hi0, lo1, hi1 };
}

function sketchElevation(boxes, oy) {
  const { lo0: minX, hi0: maxX, lo1: minY, hi1: maxY } = sketchFrame(boxes, ['x', 'y', 'w', 'h']);
  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxY - minY);
  const scale = sketchFitScale(totalW, totalH, SKETCH_INNER_W, SKETCH_MAX_DRAW_H);
  const drawW = totalW * scale;
  const drawH = totalH * scale;
  const drawL = 46 + (SKETCH_INNER_W - drawW) / 2;
  const drawR = drawL + drawW;
  const drawT = oy + SKETCH_VIEW_TOP;
  const drawB = drawT + drawH;
  const X = (x) => drawL + (x - minX) * scale;
  const Y = (y) => drawB - (y - minY) * scale;

  const rects = boxes
    .map((box) => {
      const color = box.color || '#ffffff';
      const isCarcass = box.kind === 'carcass';
      return `<rect x="${X(box.x).toFixed(2)}" y="${Y(box.y + box.h).toFixed(2)}" width="${(box.w * scale).toFixed(2)}" height="${(box.h * scale).toFixed(2)}" fill="${color}" fill-opacity="${isCarcass ? 0.16 : 0.4}" stroke="#1f2937" stroke-width="0.7"/>`;
    })
    .join('');

  const vPanels = boxes.filter((b) => b.h > b.w).map((b) => [b.x, b.x + b.w]);
  const hPanels = boxes.filter((b) => b.w >= b.h).map((b) => [b.y, b.y + b.h]);
  const xGaps = sketchGaps(sketchMergedIntervals(vPanels), minX, maxX);
  const yGaps = sketchGaps(sketchMergedIntervals(hPanels), minY, maxY);
  const chainY = drawT - 18;
  const totalY = drawT - 42;
  const chainX = drawL - 20;
  const totalHX = drawR + 16;

  const spansFull = (gaps, lo, hi) => gaps.length === 1
    && gaps[0][0] - lo < 0.5
    && hi - gaps[0][1] < 0.5;
  const chainH = (!vPanels.length || spansFull(xGaps, minX, maxX))
    ? ''
    : sketchChainH(xGaps, X, chainY, drawT);
  const chainV = (!hPanels.length || spansFull(yGaps, minY, maxY))
    ? ''
    : sketchChainV(yGaps, Y, chainX, drawL);
  const totalWDim = sketchTotalDimH(totalY, drawL, drawR, drawT, `${fmt(totalW)} cm`);
  const totalHDim = sketchTotalDimV(totalHX, drawT, drawB, drawR, `${fmt(totalH)} cm`);

  const subtitle = `<text x="${SKETCH_VIEW_W / 2}" y="${oy + 12}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#475569">Élévation avant</text>`;
  return {
    content: `${subtitle}<g>${rects}</g>${chainH}${chainV}${totalWDim}${totalHDim}`,
    height: SKETCH_VIEW_TOP + drawH + SKETCH_M_BOTTOM,
  };
}

function sketchTopView(allBoxes, oy) {
  const strips = allBoxes.filter((b) =>
    (b.kind === 'carcass' && (b.side === 'left' || b.side === 'right'))
    || (b.kind === 'divider' && b.h > b.w));
  const backBoxes = allBoxes.filter((b) => b.kind === 'back');
  const doors = allBoxes.filter((b) => b.kind === 'door');
  const dashed = allBoxes.filter((b) => b.kind === 'shelf'
    || (b.kind === 'divider' && b.h <= b.w));
  const relevant = [...strips, ...backBoxes, ...doors];
  if (!relevant.length) return { content: '', height: 0 };

  const { lo0: minX, hi0: maxX, lo1: minZ, hi1: maxZ } = sketchFrame(relevant, ['x', 'z', 'w', 'd']);
  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxZ - minZ);
  const scale = sketchFitScale(totalW, totalH, SKETCH_INNER_W, SKETCH_MAX_DRAW_H);
  const drawW = totalW * scale;
  const drawH = totalH * scale;
  const drawL = 46 + (SKETCH_INNER_W - drawW) / 2;
  const drawR = drawL + drawW;
  const drawT = oy + SKETCH_VIEW_TOP;
  const drawB = drawT + drawH;
  const X = (x) => drawL + (x - minX) * scale;
  const Z = (z) => drawT + (z - minZ) * scale;

  const rect = (box, fill, opacity, stroke, dashedStroke) =>
    `<rect x="${X(box.x).toFixed(2)}" y="${Z(box.z).toFixed(2)}" width="${(box.w * scale).toFixed(2)}" height="${(box.d * scale).toFixed(2)}" ${fill ? `fill="${fill}" fill-opacity="${opacity}"` : 'fill="none"'} stroke="${stroke}" stroke-width="0.7"${dashedStroke ? ' stroke-dasharray="3 2"' : ''}/>`;

  const parts = [];
  for (const box of backBoxes) parts.push(rect(box, box.color || '#a88964', 0.4, '#1f2937'));
  for (const box of strips) parts.push(rect(box, box.color || '#ffffff', box.kind === 'carcass' ? 0.16 : 0.4, '#1f2937'));
  for (const box of doors) parts.push(rect(box, box.color || '#ffffff', 0.18, '#94a3b8'));
  for (const box of dashed) parts.push(rect(box, null, 0, '#7c8794', true));
  const rects = parts.join('');

  const xSolids = strips.map((b) => [b.x, b.x + b.w]);
  const zSolids = [...backBoxes, ...doors].map((b) => [b.z, b.z + b.d]);
  const xGaps = sketchGaps(sketchMergedIntervals(xSolids), minX, maxX);
  const zGaps = sketchGaps(sketchMergedIntervals(zSolids), minZ, maxZ);
  const chainY = drawT - 18;
  const totalY = drawT - 42;
  const chainX = drawL - 20;
  const totalHX = drawR + 16;

  const spansFull = (gaps, lo, hi) => gaps.length === 1
    && gaps[0][0] - lo < 0.5
    && hi - gaps[0][1] < 0.5;
  const chainH = (!strips.length || spansFull(xGaps, minX, maxX))
    ? ''
    : sketchChainH(xGaps, X, chainY, drawT);
  const chainV = (!zSolids.length || spansFull(zGaps, minZ, maxZ))
    ? ''
    : sketchChainV(zGaps, Z, chainX, drawL);
  const totalWDim = sketchTotalDimH(totalY, drawL, drawR, drawT, `${fmt(totalW)} cm`);
  const totalHDim = sketchTotalDimV(totalHX, drawT, drawB, drawR, `${fmt(totalH)} cm`);

  let internal = '';
  if (dashed.length && strips.length) {
    const frontZ = Math.max(...dashed.map((b) => b.z + b.d));
    const carcassFront = Math.max(...strips.map((b) => b.z + b.d));
    if (carcassFront - frontZ > 1) {
      const x = drawR - 12;
      const y1 = Z(frontZ);
      const y2 = Z(carcassFront);
      const midY = (y1 + y2) / 2;
      internal = `<g>
        <line x1="${x}" y1="${y1.toFixed(1)}" x2="${x}" y2="${y2.toFixed(1)}" stroke="${SKETCH_DIM}" stroke-width="0.7"/>
        ${sketchArrow(x, y1, 0, -1)}${sketchArrow(x, y2, 0, 1)}
        <text x="${(x - 4).toFixed(1)}" y="${midY.toFixed(1)}" text-anchor="middle" font-size="8.2" fill="${SKETCH_DIM}" ${SKETCH_TEXT_HALO} transform="rotate(-90 ${(x - 4).toFixed(1)} ${midY.toFixed(1)})">${escapeHtml(fmt(carcassFront - frontZ))}</text>
      </g>`;
    }
  }

  const subtitle = `<text x="${SKETCH_VIEW_W / 2}" y="${oy + 12}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#475569">Vue de dessus</text>`;
  const front = `<text x="${((drawL + drawR) / 2).toFixed(1)}" y="${(drawB + 10).toFixed(1)}" text-anchor="middle" font-size="8" font-style="italic" fill="#64748b">Avant</text>`;
  return {
    content: `${subtitle}<g>${rects}</g>${chainH}${chainV}${internal}${totalWDim}${totalHDim}${front}`,
    height: SKETCH_VIEW_TOP + drawH + SKETCH_M_BOTTOM,
  };
}

function renderSketch() {
  const host = $('#sketch-svg');
  const legend = $('#sketch-legend');
  if (!host) return;

  const cabinet = sceneData.cabinet;
  const allBoxes = sceneData.boxes || [];
  const skipKinds = new Set(['back', 'door', 'volume']);
  const boxes = allBoxes.filter((box) => !skipKinds.has(box.kind));

  if (!boxes.length) {
    host.innerHTML = '<div class="empty-mini" style="padding:16px;">Aucun élément à dessiner.</div>';
    if (legend) legend.innerHTML = '';
    return;
  }

  const TITLE_H = 24;
  const elev = sketchElevation(boxes, TITLE_H);
  const top = sketchTopView(allBoxes, TITLE_H + elev.height + SKETCH_SUB_GAP);
  const VIEW_H = Math.round(TITLE_H + elev.height + SKETCH_SUB_GAP + (top.height || 0));

  const title = `${escapeHtml(cabinet.name)} · ${fmt(cabinet.width)} × ${fmt(cabinet.height)} × ${fmt(cabinet.depth)} cm`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SKETCH_VIEW_W}" height="${VIEW_H}" viewBox="0 0 ${SKETCH_VIEW_W} ${VIEW_H}" role="img" aria-label="Croquis 2D">
    <text x="${SKETCH_VIEW_W / 2}" y="13" text-anchor="middle" font-size="10.5" font-weight="700" fill="#334155">${title}</text>
    ${elev.content}
    ${top.content}
  </svg>`;
  host.innerHTML = svg;

  if (legend) {
    const categories = new Map();
    for (const box of allBoxes) {
      const category = sketchCategory(box);
      if (!category || categories.has(category)) continue;
      categories.set(category, box.color || '#ffffff');
    }
    legend.innerHTML = [...categories.entries()]
      .map(([label, color]) => `<span class="sketch-swatch"><span class="sketch-dot" style="background:${color}"></span>${escapeHtml(label)}</span>`)
      .join('');
  }
}

/* ------------------------------------------------------------------ */
/* Optimisation de découpe (placement sur feuilles)                    */
/* ------------------------------------------------------------------ */

let nestingLoading = false;

function nestingSheetSvg(group, sheet) {
  const pad = 8;
  const viewW = 320;
  const innerW = viewW - pad * 2;
  const scale = innerW / group.sheet_width;
  const viewH = Math.round(pad * 2 + group.sheet_length * scale);
  const pieces = (sheet.placements || []).map((p) => {
    const color = group.color || '#ffffff';
    const px = pad + p.x * scale;
    const py = pad + (group.sheet_length - p.y - p.h) * scale;
    const pw = Math.max(1, p.w * scale);
    const ph = Math.max(1, p.h * scale);
    const showDims = pw >= 30 && ph >= 11;
    const showLabel = pw >= 44 && ph >= 20;
    return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${color}" fill-opacity="0.7" stroke="#1f2937" stroke-width="0.6"/>`
      + (showDims ? `<text x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2 + (showLabel ? -1 : 2.5)).toFixed(1)}" text-anchor="middle" font-size="7.5" font-weight="600" fill="#0f172a">${fmt(p.w)} × ${fmt(p.h)}</text>` : '')
      + (showLabel ? `<text x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2 + 7.5).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="#475569">${escapeHtml(p.label)}</text>` : '');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewW}" height="${viewH}" viewBox="0 0 ${viewW} ${viewH}" role="img" aria-label="Feuille de découpe">
    <rect x="${pad}" y="${pad}" width="${(group.sheet_width * scale).toFixed(1)}" height="${(group.sheet_length * scale).toFixed(1)}" fill="#f6f4ef" stroke="#1f2937" stroke-width="0.8"/>
    ${pieces}
  </svg>`;
}

async function renderNesting() {
  const host = $('#nesting-diagrams');
  const chips = $('#nesting-chips');
  if (!host || nestingLoading) return;
  const kerfInput = $('#nesting-kerf');
  const kerf = kerfInput ? Number(kerfInput.value) : 4;
  nestingLoading = true;
  host.innerHTML = '<div class="empty-mini" style="padding:14px;">Calcul du placement…</div>';
  try {
    const query = Number.isFinite(kerf) ? `?kerf=${kerf}` : '';
    const data = await api(`/nesting/${query}`);
    if (chips) {
      chips.innerHTML = `
        <span class="chip"><strong>${data.total_sheets}</strong> feuilles</span>
        <span class="chip">utilisation <strong>${Math.round(data.total_utilization * 1000) / 10} %</strong></span>
        <span class="chip">chute <strong>${data.total_waste_percent} %</strong></span>
        <span class="chip">coût <strong>${money(data.total_cost)}</strong></span>`;
    }
    if (!data.groups.length) {
      host.innerHTML = '<div class="empty-mini" style="padding:14px;">Aucun panneau à optimiser.</div>';
      return;
    }
    let sheetIndex = 0;
    host.innerHTML = data.groups.map((group) => {
      const sheets = group.sheets.map((sheet) => {
        sheetIndex += 1;
        return `<div class="nesting-sheet">
          <div class="nesting-sheet-title"><span>${fmt(group.sheet_width)} × ${fmt(group.sheet_length)} cm</span><span>feuille ${sheetIndex}/${data.total_sheets}</span></div>
          ${nestingSheetSvg(group, sheet)}
        </div>`;
      }).join('');
      return `<div class="nesting-group">
        <div class="nesting-group-head">
          <span>${escapeHtml(group.material)} · ${fmt(group.thickness)} cm</span>
          <span class="muted">${group.sheet_count} feuille(s) · ${Math.round(group.utilization * 1000) / 10} % util. · ${money(group.cost)}</span>
        </div>
        ${sheets}
      </div>`;
    }).join('');
  } catch (error) {
    host.innerHTML = `<div class="empty-mini" style="padding:14px;">${escapeHtml(error.message)}</div>`;
    if (chips) chips.innerHTML = '';
  } finally {
    nestingLoading = false;
  }
}

/* ------------------------------------------------------------------ */
/* Rendu photoréaliste (modale)                                        */
/* ------------------------------------------------------------------ */

let photoPreset = 'threequarters';
let photoBusy = false;

function runPhotoRender() {
  if (photoBusy) return;
  const modal = $('#photo-modal');
  const image = $('#photo-image');
  const loading = $('#photo-loading');
  const download = $('#photo-download');
  const status = $('#photo-status');
  if (!modal || !image || !sceneData.boxes?.length) {
    toast('Aucun élément à rendre.', true);
    return;
  }
  photoBusy = true;
  modal.hidden = false;
  image.hidden = true;
  if (download) download.hidden = true;
  if (loading) loading.hidden = false;
  if (status) status.textContent = '';
  // laisse le navigateur peindre la modale avant le calcul
  window.setTimeout(() => {
    try {
      const { dataUrl, width, height } = renderPhoto(sceneData, photoPreset);
      image.src = dataUrl;
      image.hidden = false;
      if (download) {
        download.href = dataUrl;
        download.download = `rendu-${(currentCabinet().name || 'caisson').replace(/\s+/g, '-')}.png`;
        download.hidden = false;
      }
      if (status) status.textContent = `${width} × ${height} px`;
    } catch (error) {
      toast(`Rendu impossible : ${error.message}`, true);
      modal.hidden = true;
    } finally {
      if (loading) loading.hidden = true;
      photoBusy = false;
    }
  }, 60);
}

function bindPhotoModal() {
  const modal = $('#photo-modal');
  const button = $('#btn-photo');
  if (!modal || !button) return;
  button.addEventListener('click', runPhotoRender);
  const close = $('#photo-close');
  if (close) close.addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('pointerdown', (event) => {
    if (event.target === modal) modal.hidden = true;
  });
  const presets = modal.querySelector('.photo-presets');
  if (presets) {
    presets.addEventListener('click', (event) => {
      const target = event.target.closest('[data-photo-preset]');
      if (!target) return;
      photoPreset = target.dataset.photoPreset;
      presets.querySelectorAll('[data-photo-preset]').forEach((item) => {
        item.classList.toggle('active', item === target);
      });
      runPhotoRender();
    });
  }
  const reload = $('#photo-reload');
  if (reload) reload.addEventListener('click', runPhotoRender);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) modal.hidden = true;
  });
}

/* ------------------------------------------------------------------ */
/* Réglages : ordre des outils, raccourcis, catalogues                  */
/* ------------------------------------------------------------------ */

const SETTINGS_STORAGE_KEY = 'ploy3d-editor-settings-v1';
// « partition » (Séparation) is no longer a tool of the bar: a niche is divided vertically with Séparer.
const TOOL_KEYS = ['split', 'move', 'side', 'shelf', 'measure', 'plinth', 'cabinet'];
const TOOL_LABELS = {
  split: 'Séparer',
  move: 'Déplacer / copier',
  side: 'Côté',
  shelf: 'Étagère',
  partition: 'Séparation',
  measure: 'Mesurer',
  plinth: 'Plinthe',
  cabinet: 'Caisson',
};

function defaultEditorSettings() {
  return { toolOrder: [...TOOL_KEYS], hiddenTools: [], shortcuts: {} };
}

function loadEditorSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      const order = (Array.isArray(saved.toolOrder) ? saved.toolOrder : [])
        .filter((tool) => TOOL_KEYS.includes(tool));
      const missing = TOOL_KEYS.filter((tool) => !order.includes(tool));
      const shortcuts = {};
      if (saved.shortcuts && typeof saved.shortcuts === 'object') {
        for (const [tool, combo] of Object.entries(saved.shortcuts)) {
          if (TOOL_KEYS.includes(tool) && typeof combo === 'string' && combo) {
            shortcuts[tool] = combo;
          }
        }
      }
      return {
        toolOrder: [...order, ...missing],
        hiddenTools: (Array.isArray(saved.hiddenTools) ? saved.hiddenTools : [])
          .filter((tool) => TOOL_KEYS.includes(tool)),
        shortcuts,
      };
    }
  } catch {
    /* réglages illisibles : valeurs par défaut */
  }
  return defaultEditorSettings();
}

let editorSettings = loadEditorSettings();

function saveEditorSettings() {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(editorSettings));
  } catch {
    /* stockage indisponible : on continue sans persister */
  }
}

function applyToolOrder() {
  const toolbar = document.querySelector('.editor-toolbar');
  const tabs = document.querySelector('.tool-tabs');
  const hidden = new Set(editorSettings.hiddenTools);
  for (const tool of editorSettings.toolOrder) {
    const barButton = toolbar?.querySelector(`[data-toolbar-tool="${tool}"]`);
    const tabButton = tabs?.querySelector(`[data-tool="${tool}"]`);
    if (barButton) {
      toolbar.appendChild(barButton);
      barButton.hidden = hidden.has(tool);
    }
    if (tabButton) {
      tabs.appendChild(tabButton);
      tabButton.hidden = hidden.has(tool);
    }
  }
  if (hidden.has(activeTool)) {
    const first = editorSettings.toolOrder.find((tool) => !hidden.has(tool));
    if (first) activateTool(first);
  }
}

function shortcutFromEvent(event) {
  const { key, ctrlKey, metaKey, altKey, shiftKey } = event;
  if (['Control', 'Meta', 'Alt', 'Shift', 'Dead'].includes(key)) return null;
  if (key === 'Escape' || key === 'Tab' || key.startsWith('F') && key.length > 1) return null;
  const combo = [];
  if (ctrlKey || metaKey) combo.push('Ctrl');
  if (altKey) combo.push('Alt');
  if (shiftKey && key.length === 1) combo.push('Maj');
  let label = key.length === 1 ? key.toUpperCase() : key;
  if (key === ' ') label = 'Espace';
  combo.push(label);
  return combo.join('+');
}

function shortcutConflicts(combo, exceptTool) {
  return Object.entries(editorSettings.shortcuts)
    .filter(([tool, value]) => tool !== exceptTool && value === combo)
    .map(([tool]) => tool);
}

function renderSettingsTools() {
  const list = $('#settings-tools');
  if (!list) return;
  const hidden = new Set(editorSettings.hiddenTools);
  list.innerHTML = editorSettings.toolOrder.map((tool, index) => `
    <li class="settings-tool${hidden.has(tool) ? ' hidden-tool' : ''}" data-settings-tool="${tool}">
      <span class="settings-tool-name">${TOOL_LABELS[tool]}</span>
      <span class="settings-tool-actions">
        <button type="button" data-settings-move="up" title="Monter"${index === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" data-settings-move="down" title="Descendre"${index === editorSettings.toolOrder.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" data-settings-visibility="1" title="${hidden.has(tool) ? 'Afficher' : 'Masquer'}">${hidden.has(tool) ? '🚫' : '👁'}</button>
      </span>
      <input class="settings-shortcut" data-settings-shortcut="${tool}" readonly
             value="${escapeHtml(editorSettings.shortcuts[tool] || '')}" placeholder="— touche —"
             title="Cliquez puis saisissez le raccourci">
    </li>`).join('');
}

function renderSettingsDisplay() {
  const set = (id, value) => {
    const input = $(id);
    if (input) input.checked = Boolean(value);
  };
  set('#set-default-doors', showDoors);
  set('#set-default-edges', showEdges);
  set('#set-default-volumes', showVolumes);
  set('#set-default-xray', displayMode === 'xray');
}

let shortcutListeningTool = null;

function bindSettingsModal() {
  const modal = $('#settings-modal');
  const button = $('#btn-settings');
  if (!modal || !button) return;

  const open = () => {
    renderSettingsTools();
    renderSettingsDisplay();
    modal.hidden = false;
  };
  button.addEventListener('click', open);
  const close = $('#settings-close');
  if (close) close.addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('pointerdown', (event) => {
    if (event.target === modal) modal.hidden = true;
  });

  const list = $('#settings-tools');
  list.addEventListener('click', (event) => {
    const moveButton = event.target.closest('[data-settings-move]');
    const visibilityButton = event.target.closest('[data-settings-visibility]');
    const row = event.target.closest('[data-settings-tool]');
    if (!row) return;
    const tool = row.dataset.settingsTool;
    const index = editorSettings.toolOrder.indexOf(tool);
    if (moveButton) {
      const direction = moveButton.dataset.settingsMove === 'up' ? -1 : 1;
      const target = index + direction;
      if (target < 0 || target >= editorSettings.toolOrder.length) return;
      const [removed] = editorSettings.toolOrder.splice(index, 1);
      editorSettings.toolOrder.splice(target, 0, removed);
      saveEditorSettings();
      applyToolOrder();
      renderSettingsTools();
    } else if (visibilityButton) {
      const hidden = new Set(editorSettings.hiddenTools);
      if (hidden.has(tool)) hidden.delete(tool);
      else if (editorSettings.toolOrder.length - hidden.size > 1) hidden.add(tool);
      else toast('Au moins un outil doit rester visible.', true);
      editorSettings.hiddenTools = [...hidden];
      saveEditorSettings();
      applyToolOrder();
      renderSettingsTools();
    }
  });

  // saisie des raccourcis
  list.addEventListener('click', (event) => {
    const input = event.target.closest('[data-settings-shortcut]');
    if (!input || shortcutListeningTool) return;
    shortcutListeningTool = input.dataset.settingsShortcut;
    input.classList.add('listening');
    input.value = '';
    input.placeholder = '…';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shortcutListeningTool) {
      event.preventDefault();
      event.stopPropagation();
      shortcutListeningTool = null;
      renderSettingsTools();
      return;
    }
    if (!shortcutListeningTool) return;
    if (['Control', 'Meta', 'Alt', 'Shift', 'Dead'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const combo = shortcutFromEvent(event);
    if (!combo) return;
    if (combo === 'Backspace' || combo === 'Delete') {
      delete editorSettings.shortcuts[shortcutListeningTool];
    } else {
      const conflicts = shortcutConflicts(combo, shortcutListeningTool);
      conflicts.forEach((tool) => delete editorSettings.shortcuts[tool]);
      editorSettings.shortcuts[shortcutListeningTool] = combo;
      if (conflicts.length) {
        toast(`Raccourci repris : ${conflicts.map((t) => TOOL_LABELS[t]).join(', ')}`);
      }
    }
    shortcutListeningTool = null;
    saveEditorSettings();
    renderSettingsTools();
  }, true);

  const reset = $('#settings-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      editorSettings = defaultEditorSettings();
      saveEditorSettings();
      applyToolOrder();
      renderSettingsTools();
      toast('Réglages réinitialisés.');
    });
  }

  // affichage par défaut → mêmes préférences que le menu Affichage
  const bindDefault = (id, apply) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener('change', () => {
      apply(input.checked);
      saveDisplayPrefs();
      render3D();
    });
  };
  bindDefault('#set-default-doors', (value) => {
    showDoors = value;
    const btn = $('#toggle-doors');
    if (btn) {
      btn.classList.toggle('active', value);
      btn.setAttribute('aria-pressed', String(value));
    }
  });
  bindDefault('#set-default-edges', (value) => { showEdges = value; });
  bindDefault('#set-default-volumes', (value) => { showVolumes = value; });
  bindDefault('#set-default-xray', (value) => {
    displayMode = value ? 'xray' : 'solid';
    const btn = $('#toggle-xray');
    if (btn) {
      btn.classList.toggle('active', value);
      btn.setAttribute('aria-pressed', String(value));
    }
  });
}

function bindToolShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (shortcutListeningTool) return;
    if ($('#settings-modal') && !$('#settings-modal').hidden) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT' || target.isContentEditable)) return;
    const combo = shortcutFromEvent(event);
    if (!combo) return;
    const entry = Object.entries(editorSettings.shortcuts).find(([, value]) => value === combo);
    if (!entry) return;
    // ne pas interférer avec Annuler/Rétablir du navigateur et les combos système
    if ((event.ctrlKey || event.metaKey) && ['Z', 'Y', 'P', 'S'].includes(combo.split('+').pop())) return;
    event.preventDefault();
    activateRightTab('tools');
    activateTool(entry[0]);
    toast(`Outil : ${TOOL_LABELS[entry[0]]}`);
  });
}

function downloadSketchSvg() {
  const svg = document.querySelector('#sketch-svg svg');
  if (!svg) return;
  const cabinet = sceneData.cabinet || {};
  const source = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${source}`], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `croquis-${(cabinet.name || 'caisson').replace(/\s+/g, '-')}.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderWarnings() {
  const warnings = sceneData.warnings || [];
  const list = $('#warning-list');
  if (!warnings.length) {
    list.innerHTML = '<li class="ok">Aucun conflit détecté. Géométrie et débattements cohérents.</li>';
  } else {
    list.innerHTML = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('');
  }
  const stats = sceneData.stats || {};
  $('#checks-summary').innerHTML = `
    <div>Volumes : <strong>${stats.volume_count || 0}</strong> (${stats.leaf_count || 0} niches libres)</div>
    <div>Étagères : <strong>${stats.shelf_count || 0}</strong> · Séparations : <strong>${stats.separation_count ?? stats.divider_count ?? 0}</strong></div>
    <div>Panneaux : <strong>${stats.panel_count || 0}</strong></div>
    <div>Dimensions internes : <strong>${fmt(sceneData.cabinet.internal_width)} × ${fmt(sceneData.cabinet.internal_height)} × ${fmt(sceneData.cabinet.internal_depth)} cm</strong></div>
  `;
}

/* ------------------------------------------------------------------ */
/* Three.js                                                           */
/* ------------------------------------------------------------------ */
let renderer;
let threeScene;
let camera;
let controls;
let modelGroup;
let edgesGroup;
let volumesGroup;
let doorsGroup;
let measureGroup;
let measurePickables = [];
let measureBoxes = [];
let measureLabelEl = null;
let pickables = [];
let raycaster;
let pointer;
let pointerDown = null;
const measureForward = new THREE.Vector3();


function initThree() {
  const container = $('#viewport');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cursor = FINE_ARROW_CURSOR;

  threeScene = new THREE.Scene();
  threeScene.fog = new THREE.FogExp2(0x101a21, 0.00003);

  // Environnement doux pour des panneaux moins plats et des arêtes plus nettes.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  threeScene.environment = environment.texture;
  threeScene.environmentIntensity = 0.42;
  room.dispose?.();
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(35, 1, 1, 100000);

  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  threeScene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xf8fafc, 0x334155, 0.9);
  threeScene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.05);
  key.position.set(900, 1600, 1500);
  threeScene.add(key);
  const fill = new THREE.DirectionalLight(0xbfdbfe, 0.9);
  fill.position.set(-1400, 700, -1100);
  threeScene.add(fill);
  const rim = new THREE.DirectionalLight(0xfbbf24, 0.5);
  rim.position.set(0, -900, 900);
  threeScene.add(rim);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.9;
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.target.set(0, 0, 0);

  modelGroup = new THREE.Group();
  volumesGroup = new THREE.Group();
  doorsGroup = new THREE.Group();
  edgesGroup = new THREE.Group();
  measureGroup = new THREE.Group();
  threeScene.add(modelGroup);
  threeScene.add(measureGroup);
  modelGroup.add(volumesGroup, doorsGroup, edgesGroup);
  measureLabelEl = $('#measure-label');

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!pointerDown) return;
    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;
    if (distance > 6) return;
    handlePick(event, { nicheClick: NICHE_CLICK_TOOLS.includes(activeTool) });
  });
  // Simple clic : sélectionne tous les éléments (panneaux de structure,
  // étagères, séparations, fond) ; avec Séparer, Côté et Étagère, il choisit
  // la niche cliquée. Double-clic : sélectionne la niche.
  renderer.domElement.addEventListener('dblclick', (event) => {
    if (['measure', 'move'].includes(activeTool)) return;
    handlePick(event, { allowNicheSelection: true });
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (activeTool === 'measure') {
      renderer.domElement.style.cursor = FINE_ARROW_CURSOR;
      return;
    }
    if (!pickables.length) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    // La flèche fine reste le pointeur en toutes circonstances : elle sert
    // aussi à viser précisément les points et arêtes sur le caisson.
    renderer.domElement.style.cursor = FINE_ARROW_CURSOR;
  });

  const observer = new ResizeObserver(() => resizeRenderer());
  observer.observe(container);
  resizeRenderer();

  const loop = () => {
    requestAnimationFrame(loop);
    controls.update();
    updateMeasureLabelPosition();
    renderer.render(threeScene, camera);
  };
  loop();

  // Point d'inspection pour les tests d'intégration / le support.
  window.__ploy3d = {
    get scene() { return threeScene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get controls() { return controls; },
    get data() { return sceneData; },
    get pickables() { return pickables; },
    get raycaster() { return raycaster; },
    get measure() { return { mode: measureMode, picks: measurePicks, result: measureResult }; },
  };
}

function resizeRenderer() {
  if (!renderer) return;
  const container = $('#viewport');
  const width = container.clientWidth || 1;
  const height = container.clientHeight || 1;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function viewPreset(name) {
  const cabinet = currentCabinet();
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(camera.aspect || 1, 0.35);
  const fitHeight = cabinet.height / (2 * Math.tan(vFov / 2));
  const fitWidth = cabinet.width / (2 * Math.tan(vFov / 2) * aspect);
  const distance = Math.max(fitHeight, fitWidth, cabinet.depth) * 1.42;

  const directions = {
    iso: new THREE.Vector3(0.82, 0.52, 1.0).normalize(),
    front: new THREE.Vector3(0, 0, 1),
    top: new THREE.Vector3(0, 1, 0.0001).normalize(),
    right: new THREE.Vector3(1, 0, 0),
  };
  const direction = directions[name] || directions.iso;
  camera.position.copy(direction.multiplyScalar(distance));
  controls.target.set(0, 0, 0);
  controls.update();
  $$('.viewport-group [data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
}

function makeMaterial(box) {
  const color = new THREE.Color(box.color || '#ffffff');
  const xray = displayMode === 'xray';
  const selected = isComponentSelected(box.component_id);
  const moveSelection = activeTool === 'move' ? moveHighlightIds() : [];
  const boundarySelected = Boolean(
    box.component_id
    && (
      partitionShelfIds.includes(box.component_id)
      || moveSelection.includes(box.component_id)
    ),
  );
  const solidOptions = {
    color,
    roughness: 0.52,
    metalness: 0.03,
    envMapIntensity: 0.75,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  };

  if (box.kind === 'volume') {
    const selectedVolume = box.volume_id === selectedVolumeId && !selectedComponentIds.size;
    return new THREE.MeshBasicMaterial({
      color: selectedVolume ? SELECT_FILL : 0x38bdf8,
      transparent: true,
      opacity: selectedVolume ? 0.22 : 0.035,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }

  if (box.kind === 'carcass') {
    const selectedCarcass = box.side === selectedCarcassSide;
    if (xray) {
      return new THREE.MeshStandardMaterial({
        ...solidOptions,
        roughness: 0.62,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide,
        ...(selectedCarcass
          ? { color: new THREE.Color(SELECT_FILL), emissive: new THREE.Color(SELECT_FILL), emissiveIntensity: 0.35 }
          : {}),
      });
    }
    const material = new THREE.MeshStandardMaterial({ ...solidOptions, roughness: 0.56 });
    if (selectedCarcass) {
      material.color = new THREE.Color(SELECT_FILL);
      material.emissive = new THREE.Color(SELECT_FILL);
      material.emissiveIntensity = 0.25;
    }
    return material;
  }

  if (box.kind === 'back') {
    const material = new THREE.MeshStandardMaterial({
      ...solidOptions,
      roughness: 0.78,
      metalness: 0.01,
      transparent: xray,
      opacity: xray ? 0.68 : 1,
      depthWrite: !xray,
      side: xray ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (selectedCarcassSide === 'back') {
      material.color = new THREE.Color(SELECT_FILL);
      material.emissive = new THREE.Color(SELECT_FILL);
      material.emissiveIntensity = xray ? 0.45 : 0.25;
    }
    return material;
  }

  if (box.kind === 'door' || box.kind === 'drawer') {
    return new THREE.MeshStandardMaterial({
      ...solidOptions,
      roughness: 0.42,
      metalness: 0.04,
      transparent: xray,
      opacity: xray ? 0.12 : 1,
      depthWrite: !xray,
      side: THREE.DoubleSide,
    });
  }

  // Étagères, séparations, plinthes : solides opaques. La sélection teinte
  // la face en bleu #2078CF (couleur pleine, pas un simple halo).
  const material = new THREE.MeshStandardMaterial({
    ...solidOptions,
    roughness: 0.48,
    metalness: 0.03,
  });
  if (selected) {
    material.color = new THREE.Color(SELECT_FILL);
    material.emissive = new THREE.Color(SELECT_FILL);
    material.emissiveIntensity = xray ? 0.45 : 0.25;
  } else if (boundarySelected) {
    material.emissive = new THREE.Color(PARTITION_EMISSIVE);
    material.emissiveIntensity = xray ? 0.6 : 0.38;
  }
  return material;
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse?.((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
        else node.material.dispose();
      }
    });
  }
}

function configureCameraForCabinet(cabinet) {
  const maxDim = Math.max(cabinet.width, cabinet.height, cabinet.depth);
  camera.near = Math.max(1, maxDim * 0.001);
  camera.far = maxDim * 30;
  camera.updateProjectionMatrix();
  controls.minDistance = maxDim * 0.35;
  controls.maxDistance = maxDim * 6;

  if (!camera.userData?.fitted) {
    viewPreset('iso');
    camera.userData = { fitted: true };
  }
}

function render3D() {
  if (!renderer) return;
  const cabinet = currentCabinet();
  clearGroup(volumesGroup);
  clearGroup(doorsGroup);
  clearGroup(edgesGroup);
  pickables = [];
  measurePickables = [];
  measureBoxes = [];

  const hiddenNote = $('#viewport-hidden-note');
  if (hiddenNote) hiddenNote.hidden = !cabinetHidden;
  updateViewportActionHint();
  if (cabinetHidden) {
    if (measurePicks.length) clearMeasurement();
    configureCameraForCabinet(cabinet);
    renderer.domElement.style.cursor = FINE_ARROW_CURSOR;
    return;
  }

  const ox = -cabinet.width / 2;
  const oy = -cabinet.height / 2;
  const oz = -cabinet.depth / 2;
  const boxes = sceneData.boxes || [];

  const addEdges = (geometry, position, box, selected, partitionSelected = false) => {
    const volumeEdge = box.kind === 'volume';
    const color = selected
      ? (partitionSelected ? PARTITION_SELECT : SELECT_BLUE)
      : (volumeEdge ? 0x7dd3fc : 0x14202b);
    const opacity = selected ? 1 : (volumeEdge ? 0.72 : 0.7);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    edges.position.copy(position);
    edges.userData.volumeId = box.volume_id;
    edges.userData.componentId = box.component_id;
    edges.renderOrder = selected ? 5 : 2;
    edgesGroup.add(edges);
  };

  for (const box of boxes) {
    if (box.kind === 'volume') {
      if (!box.volume_id) continue;
      if (isVolumeHidden(box.volume_id)) continue;
      const geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
      const position = new THREE.Vector3(
        box.x + box.w / 2 + ox,
        box.y + box.h / 2 + oy,
        box.z + box.d / 2 + oz,
      );
      const selectedVolume = box.volume_id === selectedVolumeId && !selectedComponentIds.size;

      // Boîte de picking invisible. Le clic privilégie ensuite les étagères et
      // séparations situées devant elle (voir handlePick).
      const pick = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          colorWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      pick.position.copy(position);
      pick.userData = { volumeId: box.volume_id, componentId: null, kind: 'volume' };
      volumesGroup.add(pick);
      pickables.push(pick);

      if (showVolumes || selectedVolume) {
        const overlay = new THREE.Mesh(geometry, makeMaterial(box));
        overlay.position.copy(position);
        overlay.userData = { volumeId: box.volume_id, componentId: null, kind: 'volume' };
        overlay.renderOrder = 3;
        volumesGroup.add(overlay);
      }

      if (selectedVolume || (showEdges && showVolumes)) {
        addEdges(geometry, position, box, selectedVolume);
      }
      continue;
    }

    if (!isKindVisible(box.kind) || isBoxHidden(box)) continue;

    const geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
    const material = makeMaterial(box);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(box.x + box.w / 2 + ox, box.y + box.h / 2 + oy, box.z + box.d / 2 + oz);
    mesh.userData = {
      volumeId: box.volume_id,
      componentId: box.component_id,
      carcassId: box.carcass_id,
      side: box.side,
      kind: box.kind,
      box,
    };
    mesh.renderOrder = 1;

    if (box.kind === 'door' || box.kind === 'drawer') doorsGroup.add(mesh);
    else volumesGroup.add(mesh);

    // Les faces, arêtes et sommets de tous les panneaux visibles servent à
    // l'outil de mesure. Le fond en fait partie, même s'il ne bloque pas le
    // clic de sélection des niches.
    measurePickables.push(mesh);
    measureBoxes.push(box);

    // Les panneaux de structure (côtés, dessous, dessus) et le fond restent
    // sélectionnables dans tous les modes de rendu, y compris en rayons X.
    // En solide, les façades et plinthes bloquent le clic derrière elles ;
    // les niches restent accessibles au double-clic par leur boîte de volume.
    const solidBlocker = displayMode === 'solid'
      && ['door', 'plinth', 'foot', 'base', 'skirt'].includes(box.kind);
    if (box.volume_id || box.component_id || solidBlocker || box.kind === 'back' || box.kind === 'carcass') {
      pickables.push(mesh);
    }

    const selectedComponent = isComponentSelected(box.component_id);
    const moveSelection = activeTool === 'move' ? moveHighlightIds() : [];
    const boundarySelected = Boolean(
      box.component_id
      && (
        partitionShelfIds.includes(box.component_id)
        || moveSelection.includes(box.component_id)
      ),
    );
    if (showEdges || selectedComponent || boundarySelected) {
      addEdges(
        geometry,
        mesh.position,
        box,
        selectedComponent || boundarySelected,
        boundarySelected && !selectedComponent,
      );
    }
  }

  // Un volume divisé n'a pas de boîte de volume (seules les niches feuilles en
  // ont une) : on dessine son contour pour que la sélection reste visible.
  if (selectedVolumeId && !selectedComponentIds.size && !isVolumeHidden(selectedVolumeId)) {
    const selectedVolume = (sceneData.volumes || []).find((volume) => volume.id === selectedVolumeId);
    const hasVolumeBox = boxes.some((box) => box.kind === 'volume' && box.volume_id === selectedVolumeId);
    if (selectedVolume && !hasVolumeBox) {
      const geometry = new THREE.BoxGeometry(selectedVolume.w, selectedVolume.h, selectedVolume.d);
      const position = new THREE.Vector3(
        selectedVolume.x + selectedVolume.w / 2 + ox,
        selectedVolume.y + selectedVolume.h / 2 + oy,
        selectedVolume.z + selectedVolume.d / 2 + oz,
      );
      const fill = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: SELECT_FILL,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      fill.position.copy(position);
      fill.renderOrder = 3;
      volumesGroup.add(fill);
      addEdges(
        geometry,
        position,
        { kind: 'volume', volume_id: selectedVolume.id, component_id: null },
        true,
      );
    }
  }

  configureCameraForCabinet(cabinet);
}

/* ------------------------------------------------------------------ */
/* Mesure entre faces, arêtes et sommets                              */
/* ------------------------------------------------------------------ */
function cabinetToWorld(point) {
  const cabinet = currentCabinet();
  return new THREE.Vector3(
    point.x - cabinet.width / 2,
    point.y - cabinet.height / 2,
    point.z - cabinet.depth / 2,
  );
}

function measurePointKey(point) {
  return [point.x, point.y, point.z]
    .map((value) => Number(value).toFixed(2))
    .join('|');
}

function measureBoxKey(box) {
  return [
    box.kind,
    box.volume_id ?? '',
    box.component_id ?? '',
    box.x,
    box.y,
    box.z,
    box.w,
    box.h,
    box.d,
  ].map((value) => (typeof value === 'number' ? value.toFixed(2) : String(value))).join('|');
}

function measureBoxLabel(box) {
  if (box.component_id) {
    const component = (sceneData.components || []).find((item) => item.id === box.component_id);
    if (component?.type === 'shelf') {
      const volume = volumeById.get(component.volume_id);
      const fullWidth = volume && component.width >= volume.w - 0.5;
      return `Étagère ${fmt(component.position_from_bottom)} cm${fullWidth ? '' : ` · ${fmt(component.width)} cm`}`;
    }
    if (component?.type === 'partition_v') {
      return `Séparation ${fmt(component.position_from_left)} cm`;
    }
    if (component?.type === 'divider_v') {
      const owner = volumeById.get(component.volume_id);
      return owner?.split?.side ? 'Côté' : 'Séparation';
    }
    if (component?.type === 'divider_h') {
      return `Étagère ${fmt(component.position_from_bottom)} cm`;
    }
  }
  if (box.kind === 'back') return 'Fond';
  if (box.kind === 'door') return box.label || 'Façade';
  if (box.kind === 'drawer') return box.label || 'Tiroir';
  if (box.kind === 'carcass') return box.label || 'Carcasse';
  return box.label || 'Élément';
}

function measureFaceDirection(axis, sign) {
  if (axis === 'y') return sign > 0 ? 'dessus' : 'dessous';
  if (axis === 'x') return sign > 0 ? 'face droite' : 'face gauche';
  return sign > 0 ? 'face avant' : 'face arrière';
}

function measureFaceFromHit(hit) {
  const box = hit.object.userData.box;
  const normal = hit.face?.normal;
  if (!box || !normal) return null;

  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  let axis = 'x';
  let sign = normal.x >= 0 ? 1 : -1;
  if (ay >= ax && ay >= az) {
    axis = 'y';
    sign = normal.y >= 0 ? 1 : -1;
  } else if (az >= ax && az >= ay) {
    axis = 'z';
    sign = normal.z >= 0 ? 1 : -1;
  }

  const min = { x: box.x, y: box.y, z: box.z };
  const max = { x: box.x + box.w, y: box.y + box.h, z: box.z + box.d };
  if (axis === 'x') min.x = max.x = sign > 0 ? box.x + box.w : box.x;
  else if (axis === 'y') min.y = max.y = sign > 0 ? box.y + box.h : box.y;
  else min.z = max.z = sign > 0 ? box.z + box.d : box.z;

  return {
    type: 'face',
    box,
    axis,
    sign,
    min,
    max,
    key: `${measureBoxKey(box)}|face|${axis}|${sign}`,
    label: `${measureBoxLabel(box)} · ${measureFaceDirection(axis, sign)}`,
  };
}

function measureBoxCorners(box) {
  const x0 = box.x;
  const x1 = box.x + box.w;
  const y0 = box.y;
  const y1 = box.y + box.h;
  const z0 = box.z;
  const z1 = box.z + box.d;
  return [
    { x: x0, y: y0, z: z0 },
    { x: x1, y: y0, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x0, y: y1, z: z0 },
    { x: x0, y: y0, z: z1 },
    { x: x1, y: y0, z: z1 },
    { x: x1, y: y1, z: z1 },
    { x: x0, y: y1, z: z1 },
  ];
}

function measureBoxEdges(box) {
  const corners = measureBoxCorners(box);
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return pairs.map(([first, second]) => ({
    a: corners[first],
    b: corners[second],
  }));
}

function measureEdgeAxis(first, second) {
  const dx = Math.abs(second.x - first.x);
  const dy = Math.abs(second.y - first.y);
  const dz = Math.abs(second.z - first.z);
  if (dx >= dy && dx >= dz) return 'X';
  if (dy >= dx && dy >= dz) return 'Y';
  return 'Z';
}

function measureEdgeLength(pick) {
  return Math.hypot(
    pick.b.x - pick.a.x,
    pick.b.y - pick.a.y,
    pick.b.z - pick.a.z,
  );
}

function measureFaceDimensions(pick) {
  const width = pick.max.x - pick.min.x;
  const height = pick.max.y - pick.min.y;
  const depth = pick.max.z - pick.min.z;
  if (pick.axis === 'x') {
    return { label: `${fmt(depth, 1)} × ${fmt(height, 1)} cm` };
  }
  if (pick.axis === 'y') {
    return { label: `${fmt(width, 1)} × ${fmt(depth, 1)} cm` };
  }
  return { label: `${fmt(width, 1)} × ${fmt(height, 1)} cm` };
}

function measureFaceCenter(pick) {
  return {
    x: (pick.min.x + pick.max.x) / 2,
    y: (pick.min.y + pick.max.y) / 2,
    z: (pick.min.z + pick.max.z) / 2,
  };
}

function measureProjectPoint(point, rect) {
  const projected = cabinetToWorld(point).project(camera);
  return {
    x: rect.left + (projected.x + 1) * 0.5 * rect.width,
    y: rect.top + (1 - projected.y) * 0.5 * rect.height,
    z: projected.z,
    inFront: projected.z >= -1 && projected.z <= 1,
  };
}

function measureSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  let t = length2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / length2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { distance: Math.hypot(px - x, py - y), x, y, t };
}

function measureNearestEdge(event, boxes, threshold) {
  if (!boxes.length) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  let best = null;

  for (const box of boxes) {
    for (const edge of measureBoxEdges(box)) {
      const first = measureProjectPoint(edge.a, rect);
      const second = measureProjectPoint(edge.b, rect);
      if (!first.inFront || !second.inFront) continue;
      const screen = measureSegmentDistance(
        event.clientX,
        event.clientY,
        first.x,
        first.y,
        second.x,
        second.y,
      );
      if (screen.distance > threshold) continue;
      const depth = cabinetToWorld(edge.a).distanceTo(camera.position)
        + cabinetToWorld(edge.b).distanceTo(camera.position);
      if (
        !best
        || screen.distance < best.screenDistance - 0.25
        || (Math.abs(screen.distance - best.screenDistance) <= 0.25 && depth < best.depth)
      ) {
        best = { box, edge, screenDistance: screen.distance, depth };
      }
    }
  }

  if (!best) return null;
  const firstKey = measurePointKey(best.edge.a);
  const secondKey = measurePointKey(best.edge.b);
  const edgeKey = firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
  return {
    type: 'edge',
    box: best.box,
    a: best.edge.a,
    b: best.edge.b,
    key: `edge|${edgeKey}`,
    label: `${measureBoxLabel(best.box)} · arête ${measureEdgeAxis(best.edge.a, best.edge.b)}`,
  };
}

function measureNearestPoint(event, boxes, threshold) {
  if (!boxes.length) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  let best = null;

  for (const box of boxes) {
    for (const point of measureBoxCorners(box)) {
      const screen = measureProjectPoint(point, rect);
      if (!screen.inFront) continue;
      const distance = Math.hypot(event.clientX - screen.x, event.clientY - screen.y);
      if (distance > threshold) continue;
      const depth = cabinetToWorld(point).distanceTo(camera.position);
      if (
        !best
        || distance < best.screenDistance - 0.25
        || (Math.abs(distance - best.screenDistance) <= 0.25 && depth < best.depth)
      ) {
        best = { box, point, screenDistance: distance, depth };
      }
    }
  }

  if (!best) return null;
  return {
    type: 'point',
    box: best.box,
    point: best.point,
    key: `point|${measurePointKey(best.point)}`,
    label: `${measureBoxLabel(best.box)} · sommet`,
  };
}

function handleMeasurePick(event) {
  if (!measurePickables.length) return;
  threeScene.updateMatrixWorld(true);
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(measurePickables, false);
  let pick = null;

  if (measureMode === 'face') {
    pick = hits[0] ? measureFaceFromHit(hits[0]) : null;
  } else {
    const hitBoxes = [];
    const seen = new Set();
    for (const hit of hits) {
      const box = hit.object.userData.box;
      if (!box) continue;
      const key = measureBoxKey(box);
      if (seen.has(key)) continue;
      seen.add(key);
      hitBoxes.push(box);
      if (hitBoxes.length >= 4) break;
    }

    if (measureMode === 'edge') {
      pick = measureNearestEdge(event, hitBoxes, 14);
      if (!pick && hitBoxes.length) pick = measureNearestEdge(event, measureBoxes, 8);
    } else {
      pick = measureNearestPoint(event, hitBoxes, 12);
      if (!pick && hitBoxes.length) pick = measureNearestPoint(event, measureBoxes, 8);
    }
  }

  if (!pick) return;
  if (measurePicks.length >= 2) {
    measurePicks = [];
    measureResult = null;
  }
  if (measurePicks.length === 1 && measurePicks[0].key === pick.key) return;
  measurePicks.push(pick);
  measureResult = measurePicks.length === 2
    ? computeMeasureResult(measurePicks[0], measurePicks[1])
    : null;
  renderMeasureOverlay();
}

function closestPointsAabb(firstMin, firstMax, secondMin, secondMax) {
  const first = {};
  const second = {};
  for (const axis of ['x', 'y', 'z']) {
    const a0 = firstMin[axis];
    const a1 = firstMax[axis];
    const b0 = secondMin[axis];
    const b1 = secondMax[axis];
    if (a1 < b0) {
      first[axis] = a1;
      second[axis] = b0;
    } else if (b1 < a0) {
      first[axis] = a0;
      second[axis] = b1;
    } else {
      const middle = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
      first[axis] = middle;
      second[axis] = middle;
    }
  }
  return { a: first, b: second };
}

function closestPointsSegments(firstStart, firstEnd, secondStart, secondEnd) {
  const p1 = new THREE.Vector3(firstStart.x, firstStart.y, firstStart.z);
  const q1 = new THREE.Vector3(firstEnd.x, firstEnd.y, firstEnd.z);
  const p2 = new THREE.Vector3(secondStart.x, secondStart.y, secondStart.z);
  const q2 = new THREE.Vector3(secondEnd.x, secondEnd.y, secondEnd.z);
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  const epsilon = 1e-9;
  let s = 0;
  let t = 0;

  if (a <= epsilon && e <= epsilon) {
    s = 0;
    t = 0;
  } else if (a <= epsilon) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= epsilon) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denominator = a * e - b * b;
      s = denominator !== 0
        ? THREE.MathUtils.clamp((b * f - c * e) / denominator, 0, 1)
        : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }

  const firstPoint = p1.clone().add(d1.multiplyScalar(s));
  const secondPoint = p2.clone().add(d2.multiplyScalar(t));
  return {
    a: { x: firstPoint.x, y: firstPoint.y, z: firstPoint.z },
    b: { x: secondPoint.x, y: secondPoint.y, z: secondPoint.z },
  };
}

function computeMeasureResult(first, second) {
  let points;
  if (first.type === 'face' && second.type === 'face') {
    points = closestPointsAabb(first.min, first.max, second.min, second.max);
  } else if (first.type === 'edge' && second.type === 'edge') {
    points = closestPointsSegments(first.a, first.b, second.a, second.b);
  } else if (first.type === 'point' && second.type === 'point') {
    points = { a: { ...first.point }, b: { ...second.point } };
  } else {
    return null;
  }

  const { a, b } = points;
  return {
    a,
    b,
    distance: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
    midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
  };
}

function syncMeasureModeButtons() {
  $$('[data-measure-mode]').forEach((button) => {
    const active = button.dataset.measureMode === measureMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setMeasureMode(mode) {
  const nextMode = ['face', 'edge', 'point'].includes(mode) ? mode : 'face';
  if (nextMode === measureMode) return;
  measureMode = nextMode;
  syncMeasureModeButtons();
  clearMeasurement();
}

function clearMeasurement() {
  measurePicks = [];
  measureResult = null;
  measureLabelAnchor = null;
  if (measureGroup) clearGroup(measureGroup);
  if (measureLabelEl) measureLabelEl.hidden = true;
  renderMeasurePanel();
}

function renderMeasurePanel() {
  const picks = $('#measure-picks');
  const result = $('#measure-result');
  const clear = $('#btn-measure-clear');
  const hint = $('#measure-hint');
  const distance = $('#measure-distance');
  const deltas = $('#measure-deltas');
  if (!picks || !result || !clear || !hint || !distance || !deltas) return;

  if (!measurePicks.length) {
    picks.hidden = true;
    picks.innerHTML = '';
    result.hidden = true;
    clear.disabled = true;
    hint.textContent = measureMode === 'face'
      ? 'Cliquez une première face, puis une seconde.'
      : (measureMode === 'edge'
        ? 'Cliquez une première arête (trait), puis une seconde.'
        : 'Cliquez un premier sommet (point), puis un second.');
    return;
  }

  picks.hidden = false;
  picks.innerHTML = measurePicks
    .map((pick, index) => `<div class="measure-pick"><span class="measure-dot${index === 1 ? ' second' : ''}"></span><span>${escapeHtml(pick.label)}</span></div>`)
    .join('');
  clear.disabled = false;

  if (measureResult) {
    const caption = $('#measure-caption');
    if (caption) caption.textContent = 'Distance minimale';
    result.hidden = false;
    distance.textContent = `${fmt(measureResult.distance, 1)} cm`;
    deltas.textContent = `ΔX ${fmt(Math.abs(measureResult.b.x - measureResult.a.x), 1)} · ΔY ${fmt(Math.abs(measureResult.b.y - measureResult.a.y), 1)} · ΔZ ${fmt(Math.abs(measureResult.b.z - measureResult.a.z), 1)} cm`;
    hint.textContent = 'Mesure terminée. Cliquez un nouveau repère pour recommencer.';
  } else if (measurePicks.length === 1) {
    const pick = measurePicks[0];
    const caption = $('#measure-caption');
    if (pick.type === 'edge') {
      if (caption) caption.textContent = 'Longueur de l’arête';
      result.hidden = false;
      distance.textContent = `${fmt(measureEdgeLength(pick), 1)} cm`;
      deltas.textContent = `Arête ${measureEdgeAxis(pick.a, pick.b)} · ${escapeHtml(pick.label)}`;
      hint.textContent = 'Longueur du trait. Cliquez un second trait en face pour mesurer la distance.';
    } else if (pick.type === 'face') {
      if (caption) caption.textContent = 'Dimensions de la face';
      result.hidden = false;
      distance.textContent = measureFaceDimensions(pick).label;
      deltas.textContent = measureFaceDirection(pick.axis, pick.sign);
      hint.textContent = 'Dimensions de la face. Cliquez une seconde face pour mesurer la distance.';
    } else {
      result.hidden = true;
      hint.textContent = 'Premier sommet sélectionné. Cliquez le second.';
    }
  } else {
    result.hidden = true;
    hint.textContent = 'Premier repère sélectionné. Cliquez le second.';
  }
}

function addMeasureFace(pick, color) {
  const cabinet = currentCabinet();
  const min = pick.min;
  const max = pick.max;
  let width = 0;
  let height = 0;
  let rotation = null;

  if (pick.axis === 'x') {
    width = max.z - min.z;
    height = max.y - min.y;
    rotation = new THREE.Euler(0, pick.sign * Math.PI / 2, 0);
  } else if (pick.axis === 'y') {
    width = max.x - min.x;
    height = max.z - min.z;
    rotation = new THREE.Euler(-pick.sign * Math.PI / 2, 0, 0);
  } else {
    width = max.x - min.x;
    height = max.y - min.y;
    rotation = new THREE.Euler(0, pick.sign < 0 ? Math.PI : 0, 0);
  }

  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  const maxDim = Math.max(cabinet.width, cabinet.height, cabinet.depth);
  const offset = Math.max(0.8, maxDim * 0.0006);
  const group = new THREE.Group();
  group.position.set(
    center.x - cabinet.width / 2 + (pick.axis === 'x' ? pick.sign * offset : 0),
    center.y - cabinet.height / 2 + (pick.axis === 'y' ? pick.sign * offset : 0),
    center.z - cabinet.depth / 2 + (pick.axis === 'z' ? pick.sign * offset : 0),
  );
  group.rotation.copy(rotation);
  group.renderOrder = 20;

  const geometry = new THREE.PlaneGeometry(Math.max(0.1, width), Math.max(0.1, height));
  const fill = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    }),
  );
  fill.renderOrder = 20;

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    }),
  );
  outline.renderOrder = 21;
  group.add(fill, outline);
  measureGroup.add(group);
}

function addMeasureEdge(pick, color, radius) {
  const first = cabinetToWorld(pick.a);
  const second = cabinetToWorld(pick.b);
  const length = first.distanceTo(second);
  const cylinderRadius = Math.max(1.4, radius * 0.5);
  const geometry = new THREE.CylinderGeometry(
    cylinderRadius,
    cylinderRadius,
    Math.max(0.1, length),
    10,
  );
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const body = new THREE.Mesh(geometry, material);
  body.position.copy(first).add(second).multiplyScalar(0.5);
  if (length > 0.001) {
    body.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      second.clone().sub(first).normalize(),
    );
  }
  body.renderOrder = 22;
  measureGroup.add(body);

  for (const point of [first, second]) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(2.6, radius * 1.8), 14, 10),
      material.clone(),
    );
    marker.position.copy(point);
    marker.renderOrder = 23;
    measureGroup.add(marker);
  }
}

function addMeasurePoint(pick, color, radius) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(3.4, radius * 2.4), 18, 12),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  marker.position.copy(cabinetToWorld(pick.point));
  marker.renderOrder = 23;
  measureGroup.add(marker);
}

function addMeasureLine(result, radius) {
  const first = cabinetToWorld(result.a);
  const second = cabinetToWorld(result.b);
  const length = first.distanceTo(second);
  if (length > 0.05) {
    const lineRadius = Math.max(1.6, radius * 0.5);
    const geometry = new THREE.CylinderGeometry(lineRadius, lineRadius, length, 10);
    const line = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: MEASURE_LINE,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    line.position.copy(first).add(second).multiplyScalar(0.5);
    line.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      second.clone().sub(first).normalize(),
    );
    line.renderOrder = 25;
    measureGroup.add(line);
  }

  const markerRadius = Math.max(3.2, radius * 1.5);
  for (const point of [first, second]) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(markerRadius, 12, 8),
      new THREE.MeshBasicMaterial({
        color: MEASURE_LINE,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    marker.position.copy(point);
    marker.renderOrder = 26;
    measureGroup.add(marker);
  }
}

function renderMeasureOverlay() {
  if (!measureGroup) return;
  clearGroup(measureGroup);
  if (!measurePicks.length) {
    if (measureLabelEl) measureLabelEl.hidden = true;
    renderMeasurePanel();
    return;
  }

  const cabinet = currentCabinet();
  const maxDim = Math.max(cabinet.width, cabinet.height, cabinet.depth);
  const radius = Math.max(4, maxDim * 0.003);
  measurePicks.forEach((pick, index) => {
    const color = index === 0 ? MEASURE_FIRST : MEASURE_SECOND;
    if (pick.type === 'face') addMeasureFace(pick, color);
    else if (pick.type === 'edge') addMeasureEdge(pick, color, radius);
    else addMeasurePoint(pick, color, radius);
  });

  measureLabelAnchor = null;
  if (measureResult) {
    addMeasureLine(measureResult, radius);
    measureLabelAnchor = measureResult.midpoint;
    if (measureLabelEl) {
      measureLabelEl.textContent = `${fmt(measureResult.distance, 1)} cm`;
    }
  } else if (measurePicks.length === 1) {
    const pick = measurePicks[0];
    if (pick.type === 'edge') {
      measureLabelAnchor = {
        x: (pick.a.x + pick.b.x) / 2,
        y: (pick.a.y + pick.b.y) / 2,
        z: (pick.a.z + pick.b.z) / 2,
      };
      if (measureLabelEl) {
        measureLabelEl.textContent = `${fmt(measureEdgeLength(pick), 1)} cm`;
      }
    } else if (pick.type === 'face') {
      measureLabelAnchor = measureFaceCenter(pick);
      if (measureLabelEl) {
        measureLabelEl.textContent = measureFaceDimensions(pick).label;
      }
    }
  }
  if (measureLabelEl) {
    measureLabelEl.hidden = !measureLabelAnchor;
    if (measureLabelAnchor) updateMeasureLabelPosition();
  }
  renderMeasurePanel();
}

function updateMeasureLabelPosition() {
  if (!measureLabelEl) return;
  if (!measureLabelAnchor) {
    measureLabelEl.hidden = true;
    return;
  }
  if (!camera || !renderer) return;

  const world = cabinetToWorld(measureLabelAnchor);
  const toPoint = world.clone().sub(camera.position);
  camera.getWorldDirection(measureForward);
  if (toPoint.dot(measureForward) <= 0) {
    measureLabelEl.hidden = true;
    return;
  }

  const projected = world.clone().project(camera);
  if (projected.z < -1 || projected.z > 1) {
    measureLabelEl.hidden = true;
    return;
  }

  const canvasRect = renderer.domElement.getBoundingClientRect();
  const parentRect = measureLabelEl.parentElement.getBoundingClientRect();
  const x = canvasRect.left - parentRect.left + (projected.x + 1) * 0.5 * canvasRect.width;
  const y = canvasRect.top - parentRect.top + (1 - projected.y) * 0.5 * canvasRect.height;
  if (x < 0 || x > parentRect.width || y < 0 || y > parentRect.height) {
    measureLabelEl.hidden = true;
    return;
  }

  measureLabelEl.hidden = false;
  measureLabelEl.style.left = `${x}px`;
  measureLabelEl.style.top = `${Math.max(14, y - 18)}px`;
}

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function handlePick(event, { allowNicheSelection = false, nicheClick = false } = {}) {
  if (activeTool === 'measure') {
    handleMeasurePick(event);
    return;
  }
  if (!pickables.length) return;
  // render3D() reconstruit les maillages après chaque sélection ; on force la
  // mise à jour des matrices avant le raycast pour que le clic suivant soit
  // pris en compte même s'il arrive avant la prochaine frame de rendu.
  threeScene.updateMatrixWorld(true);
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) return;
  // Séparer, Côté, Étagère : un clic dans une niche la choisit ; un clic posé
  // sur une étagère ou une séparation sélectionne encore ce panneau.
  if (nicheClick && !hits[0].object.userData.componentId && !(event.metaKey || event.ctrlKey || event.shiftKey)) {
    allowNicheSelection = true;
  }

  // Outil Déplacer : une fois la source choisie, un clic sur la face d'un
  // côté, d'une séparation, d'une étagère ou du fond désigne la niche
  // adjacente (et non le panneau lui-même).
  if (activeTool === 'move' && moveSource) {
    const targetVolumeId = moveTargetVolumeFromHits(hits);
    if (targetVolumeId) {
      handleMoveClick({ volumeId: targetVolumeId, componentId: null });
    } else {
      toast(
        'Cliquez la face intérieure d’un côté, d’une séparation ou l’intérieur d’une niche.',
        true,
      );
    }
    return;
  }

  // Un panneau opaque (carcasse, façade, plinthe) devant la niche bloque le
  // clic. Les boîtes de volume sont transparentes : on les ignore pour la
  // sélection afin d'atteindre la face intérieure des panneaux de structure.
  const first = hits[0];
  const firstKind = first.object.userData.kind;
  const firstCarcass = first.object.userData.carcassId
    && !first.object.userData.volumeId
    && !first.object.userData.componentId;
  const firstBack = firstKind === 'back';
  if (firstCarcass || firstBack) {
    selectedCarcassSide = firstBack ? 'back' : (first.object.userData.side || null);
    clearComponentSelection();
    selectedVolumeId = null;
    activateRightTab('selection');
    renderTree();
    renderSelection();
    render3D();
    updateToolBounds();
    return;
  }

  const componentHit = hits.find((candidate) => candidate.object.userData.componentId);
  const volumeHit = hits.find(
    (candidate) => candidate.object.userData.volumeId && !candidate.object.userData.componentId,
  );
  const selectableHits = hits.filter((candidate) => {
    const data = candidate.object.userData;
    return data.componentId
      || data.kind === 'back'
      || (data.carcassId && !data.volumeId && !data.componentId);
  });
  const opaqueBlockers = ['door', 'plinth', 'foot', 'base', 'skirt'];
  const blockedByOpaquePanel = opaqueBlockers.includes(firstKind);

  // Pour les outils, on garde la priorité historique : élément intérieur
  // (étagère/séparation), puis niche.
  const hit = componentHit || volumeHit;
  if (!hit) return;

  const volumeId = hit.object.userData.volumeId;
  const componentId = hit.object.userData.componentId || null;
  const additive = event.metaKey || event.ctrlKey || event.shiftKey;
  if (!blockedByOpaquePanel && !allowNicheSelection && additive && componentId) {
    selectedVolumeId = volumeId;
    selectedCarcassSide = null;
    toggleComponentSelection(componentId);
    activateRightTab('selection');
    renderTree();
    renderSelection();
    render3D();
    updateToolBounds();
    return;
  }
  if (!allowNicheSelection && activeTool === 'move') {
    handleMoveClick({ volumeId, componentId });
    return;
  }
  if (!allowNicheSelection && activeTool === 'partition' && hit.object.userData.kind === 'shelf' && componentId) {
    togglePartitionShelf(componentId);
    return;
  }
  if (activeTool === 'shelf' && shelfToolMode === 'series') {
    // La série remplit la niche : on choisit uniquement la niche. Un clic sur
    // une étagère existante est ignoré pour ne pas quitter le mode série.
    if (!allowNicheSelection) return;
    if (volumeId && !componentId) {
      selectedVolumeId = volumeId;
      clearComponentSelection();
      syncShelfSeriesTool();
      renderTree();
      renderSelection();
      render3D();
      updateViewportActionHint();
    }
    return;
  }
  if (activeTool === 'shelf' && shelfToolMode === 'single' && volumeId && hit.point) {
    const volume = volumeById.get(volumeId);
    if (volume?.is_leaf) {
      const cabinet = currentCabinet();
      const mode = $('#shelf-mode').value;
      const raw = Number($('#shelf-position').value);
      let height = mode === 'ratio' ? (raw / 100) * volume.h : raw;
      if (!Number.isFinite(height)) height = 10;
      const options = shelfColumnOptions(
        volume,
        height,
        Number(cabinet.thickness) || 18,
        Math.max(0, Number(cabinet.shelf_side_clearance) || 0),
      ).filter((option) => !option.disabled);
      // Le modèle 3D est centré sur l'origine : les boîtes sont décalées de
      // -cabinet.width / 2. On repasse en coordonnées locales du caisson.
      const modelOffsetX = -Number(cabinet.width) / 2;
      const localX = hit.point.x - modelOffsetX - volume.x;
      let column = options.find(
        (option) => localX >= option.left - 1 && localX <= option.right + 1,
      );
      if (!column) {
        column = options.sort(
          (a, b) => Math.abs((a.left + a.right) / 2 - localX)
            - Math.abs((b.left + b.right) / 2 - localX),
        )[0];
      }
      if (column) shelfColumnValue = column.value;
    }
  }
  // Sélection : au simple clic, on prend le premier élément sélectionnable
  // (étagère, séparation, côté, dessous, dessus, fond) en ignorant les boîtes
  // de volume. Au double-clic, la niche est prioritaire.
  const selectionHit = allowNicheSelection
    ? (volumeHit || selectableHits[0])
    : selectableHits[0];
  if (!selectionHit || blockedByOpaquePanel) return;

  const selectionData = selectionHit.object.userData;
  if (selectionData.componentId) {
    selectedVolumeId = selectionData.volumeId;
    selectedCarcassSide = null;
    if (additive) {
      toggleComponentSelection(selectionData.componentId);
    } else {
      setComponentSelection([selectionData.componentId], selectionData.componentId);
    }
    activateRightTab('selection');
    renderTree();
    renderSelection();
    render3D();
    updateToolBounds();
    return;
  }
  if (selectionData.kind === 'back' || (selectionData.carcassId && !selectionData.volumeId)) {
    selectedCarcassSide = selectionData.kind === 'back' ? 'back' : (selectionData.side || null);
    clearComponentSelection();
    selectedVolumeId = null;
    activateRightTab('selection');
    renderTree();
    renderSelection();
    render3D();
    updateToolBounds();
    return;
  }
  if (selectionData.volumeId && allowNicheSelection) {
    selectedVolumeId = selectionData.volumeId;
    selectedCarcassSide = null;
    clearComponentSelection();
    renderTree();
    renderSelection();
    render3D();
    updateToolBounds();
  }
}

/* ------------------------------------------------------------------ */
/* Initialisation                                                     */
/* ------------------------------------------------------------------ */
function bindViewportButtons() {
  $$('.viewport-group [data-view]').forEach((button) => {
    button.addEventListener('click', () => viewPreset(button.dataset.view));
  });

  const visibilityInputs = {
    'vis-carcass': (checked) => { showCarcass = checked; },
    'vis-back': (checked) => { showBack = checked; },
    'vis-doors': (checked) => { showDoors = checked; },
    'vis-shelves': (checked) => { showShelves = checked; },
    'vis-dividers': (checked) => { showDividers = checked; },
    'vis-external': (checked) => { showExternal = checked; },
    'vis-volumes': (checked) => { showVolumes = checked; },
    'vis-edges': (checked) => { showEdges = checked; },
  };

  const syncDisplayButtons = () => {
    const hasDoors = Boolean(currentCabinet()?.has_doors);
    if (!hasDoors) showDoors = false;

    const xray = displayMode === 'xray';
    $('#toggle-xray').classList.toggle('active', xray);
    $('#toggle-xray').setAttribute('aria-pressed', String(xray));

    $('#toggle-doors').hidden = !hasDoors;
    const doorsInput = $('#vis-doors');
    const doorsRow = doorsInput?.closest('.display-check');
    if (doorsRow) doorsRow.hidden = !hasDoors;
    if (doorsInput) doorsInput.disabled = !hasDoors;
    $('#toggle-doors').classList.toggle('active', hasDoors && showDoors);
    $('#toggle-doors').setAttribute('aria-pressed', String(hasDoors && showDoors));

    const states = {
      'vis-carcass': showCarcass,
      'vis-back': showBack,
      'vis-doors': hasDoors && showDoors,
      'vis-shelves': showShelves,
      'vis-dividers': showDividers,
      'vis-external': showExternal,
      'vis-volumes': showVolumes,
      'vis-edges': showEdges,
    };
    for (const [id, checked] of Object.entries(states)) {
      const input = $(`#${id}`);
      if (input) input.checked = checked;
    }

    const hiddenCount = [
      !showCarcass,
      !showBack,
      hasDoors && !showDoors,
      !showShelves,
      !showDividers,
      !showExternal,
      !showEdges,
    ].filter(Boolean).length;
    $('#toggle-display').classList.toggle('has-hidden', hiddenCount > 0);
    $('#toggle-display').title = hiddenCount
      ? `${hiddenCount} catégorie${hiddenCount > 1 ? 's' : ''} masquée${hiddenCount > 1 ? 's' : ''}`
      : 'Visibilité des éléments';
  };
  syncDisplayUI = syncDisplayButtons;

  const commitDisplayChange = () => {
    if (activeTool === 'measure') clearMeasurement();
    const component = currentComponent();
    if (component && !isKindVisible(componentVisibilityKind(component))) {
      clearComponentSelection();
    }
    syncDisplayButtons();
    saveDisplayPrefs();
    renderTree();
    renderSelection();
    render3D();
    updateToolBounds();
  };

  $('#toggle-xray').addEventListener('click', () => {
    displayMode = displayMode === 'xray' ? 'solid' : 'xray';
    syncDisplayButtons();
    saveDisplayPrefs();
    render3D();
  });

  $('#toggle-doors').addEventListener('click', () => {
    showDoors = !showDoors;
    commitDisplayChange();
  });

  for (const [id, apply] of Object.entries(visibilityInputs)) {
    $(`#${id}`)?.addEventListener('change', (event) => {
      apply(event.target.checked);
      commitDisplayChange();
    });
  }

  const menuButton = $('#toggle-display');
  const popover = $('#display-popover');
  const closeMenu = () => {
    popover.hidden = true;
    menuButton.classList.remove('active');
    menuButton.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    popover.hidden = false;
    menuButton.classList.add('active');
    menuButton.setAttribute('aria-expanded', 'true');
  };
  menuButton.addEventListener('click', () => {
    if (popover.hidden) openMenu();
    else closeMenu();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.display-menu')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  $('#display-all').addEventListener('click', () => {
    cabinetHidden = false;
    hiddenVolumeIds.clear();
    hiddenComponentIds.clear();
    showCarcass = true;
    showBack = true;
    showDoors = true;
    showShelves = true;
    showDividers = true;
    showExternal = true;
    showVolumes = true;
    showEdges = true;
    commitDisplayChange();
  });

  $('#display-work').addEventListener('click', () => {
    cabinetHidden = false;
    hiddenVolumeIds.clear();
    hiddenComponentIds.clear();
    showCarcass = true;
    showBack = true;
    showDoors = false;
    showShelves = true;
    showDividers = true;
    showExternal = true;
    showVolumes = false;
    showEdges = true;
    displayMode = 'solid';
    commitDisplayChange();
    closeMenu();
  });

  syncDisplayButtons();
}

function installCursorEnforcer() {
  /* Garantit la flèche fine comme pointeur unique du viewport : certains
     codes réécrivent le curseur ; on ré-applique le nôtre dès que le
     style change. */
  if (!renderer?.domElement || !FINE_ARROW_CURSOR.includes('data:image/png')) return;
  const canvas = renderer.domElement;
  const enforce = () => {
    if (!(canvas.getAttribute('style') || '').includes('data:image/png')) {
      canvas.style.cursor = FINE_ARROW_CURSOR;
    }
  };
  enforce();
  new MutationObserver(enforce).observe(canvas, {
    attributes: true,
    attributeFilter: ['style'],
  });
}

function init() {
  loadDisplayPrefs();
  bindToolTabs();
  bindRightTabs();
  bindEditorToolbar();
  bindSliders();
  bindForms();
  bindViewportButtons();
  bindHistory();
  bindHistoryModal();
  bindPhotoModal();
  bindSettingsModal();
  bindToolShortcuts();
  applyToolOrder();
  bindCalculator();
  initThree();
  applyScene(initialScene);
  syncSplitToolModeUI();
  syncMeasureModeButtons();
  $('#quote-status').value = initialScene.quote?.status_code || 'draft';
  if (!initialScene.quote) {
    $('#quote-status').value = 'draft';
  }
  installCursorEnforcer();
}

if (!Number.isFinite(cabinetId)) {
  toast('Identifiant de caisson manquant.', true);
} else {
  init();
}
