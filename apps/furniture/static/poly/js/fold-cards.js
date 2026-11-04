/*
 * Les cartes des deux colonnes de l'éditeur de caisson se replient et se déplient par leur titre (▾ / ▸), comme les
 * cartes de l'éditeur : un clic, ou Entrée / Espace au clavier, sur le bandeau.
 * - Colonne de droite (les options) : en accordéon. Toutes les cartes sont fermées à l'ouverture de la page, en ouvrir
 *   une ferme les autres. Choisir un outil dans la barre du haut ouvre la carte « Outils », où sont ses réglages.
 * - Colonne de gauche (le Navigateur) : ouverte par défaut ; le navigateur retient si on l'a repliée (localStorage).
 * Une carte dans une carte ne se replie pas : elle suit la sienne. Les styles sont dans poly/css/side-panels.css.
 */
const KEY = 'poly.cabinet.folded';

function readFolded() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function saveFolded(folded) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...folded]));
  } catch {
    /* Sans stockage, le repli dure jusqu'au rechargement. */
  }
}

/** The name of a card: its title without its counters (« Navigateur », « Sélection »…). */
function cardName(title) {
  const own = [...title.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('');
  return own.replace(/\s+/g, ' ').trim();
}

function setFolded(card, folded) {
  card.section.toggleAttribute('data-folded', folded);
  card.title.setAttribute('aria-expanded', String(!folded));
}

export function initFoldCards(root = document) {
  const remembered = readFolded();
  const cards = [];
  root.querySelectorAll('.editor-side .pane-section > .pane-title').forEach((title) => {
    const section = title.parentElement;
    const name = cardName(title);
    if (!name || title.classList.contains('foldable') || section.parentElement.closest('.pane-section')) return;
    const column = section.closest('.editor-side');
    const card = { title, section, name, column, accordion: column.classList.contains('editor-right') };
    cards.push(card);
    title.classList.add('foldable');
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.title = `Replier ou déplier « ${name} »`;
    const chevron = document.createElement('span');
    chevron.className = 'fold-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';
    title.prepend(chevron);
    setFolded(card, card.accordion || remembered.has(name));
  });

  const open = (card, wanted) => {
    setFolded(card, !wanted);
    if (card.accordion) {
      if (wanted) cards.filter((other) => other !== card && other.column === card.column).forEach((other) => setFolded(other, true));
      return;
    }
    if (wanted) remembered.delete(card.name);
    else remembered.add(card.name);
    saveFolded(remembered);
  };
  cards.forEach((card) => {
    const toggle = () => open(card, card.section.hasAttribute('data-folded'));
    card.title.addEventListener('click', toggle);
    card.title.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle();
    });
  });

  // A tool chosen in the top bar: its settings are in « Outils ».
  const tools = cards.find((card) => card.accordion && card.name === 'Outils');
  if (tools) {
    root.querySelectorAll('[data-toolbar-tool]').forEach((button) => {
      button.addEventListener('click', () => open(tools, true));
    });
  }
}

initFoldCards();
