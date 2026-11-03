/*
 * Confirmations and short questions drawn in the page, for the workshop's pages (poly_3D). The browser's own
 * window.confirm and window.prompt are refused by some embedded browsers (they answer « no » at once without showing
 * anything): every deletion of the room editor stopped there. Échap or « Annuler » answers no; Entrée answers yes.
 *   await window.polyConfirm(message, { ok: 'Supprimer', danger: true })  → true / false
 *   await window.polyPrompt(title, [{ label, value }])                    → the values, or null
 * A form with data-confirm="…" asks before it is sent.
 */
(function () {
  'use strict';

  function open(title, body, okLabel, danger, focus) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'poly-dialog';
      overlay.setAttribute('role', 'presentation');
      var card = document.createElement('div');
      card.className = 'poly-dialog-card';
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', title);
      var heading = document.createElement('p');
      heading.className = 'poly-dialog-title';
      heading.textContent = title;
      var actions = document.createElement('div');
      actions.className = 'poly-dialog-actions';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = 'Annuler';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = danger ? 'btn btn-danger-solid' : 'btn btn-primary';
      ok.textContent = okLabel;
      actions.append(cancel, ok);
      card.append(heading, body, actions);
      overlay.append(card);
      var done = function (answer) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(answer);
      };
      var onKey = function (event) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(false); }
        if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); event.stopPropagation(); done(true); }
      };
      cancel.addEventListener('click', function () { done(false); });
      ok.addEventListener('click', function () { done(true); });
      overlay.addEventListener('pointerdown', function (event) { if (event.target === overlay) done(false); });
      document.addEventListener('keydown', onKey, true);
      document.body.append(overlay);
      (focus || ok).focus();
    });
  }

  window.polyConfirm = function (message, options) {
    var o = options || {};
    var body = document.createElement('div');
    var deleting = /^(supprimer|retirer)\b/i.test(message);
    return open(message, body, o.ok || (deleting ? 'Supprimer' : 'Confirmer'), o.danger === undefined ? deleting : o.danger);
  };

  window.polyPrompt = function (title, fields) {
    var body = document.createElement('div');
    body.className = 'poly-dialog-fields';
    var inputs = fields.map(function (f) {
      var label = document.createElement('label');
      label.textContent = f.label;
      var input = document.createElement('input');
      input.type = 'text';
      input.value = f.value || '';
      label.append(input);
      body.append(label);
      return input;
    });
    return open(title, body, 'Enregistrer', false, inputs[0]).then(function (yes) {
      return yes ? inputs.map(function (i) { return i.value; }) : null;
    });
  };

  // The messages of the server (top right) go away by themselves after a while, or with a click: they would cover
  // the buttons of the view otherwise.
  function dismissFlashes() {
    document.querySelectorAll('.flash').forEach(function (flash) {
      var gone = function () {
        flash.classList.add('is-leaving');
        setTimeout(function () { flash.remove(); }, 250);
      };
      flash.addEventListener('click', gone);
      flash.title = 'Cliquez pour fermer';
      setTimeout(gone, flash.classList.contains('flash-error') ? 9000 : 4000);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dismissFlashes);
  else dismissFlashes();

  // The menu of a page's name (<details class="page-menu">): closed by a choice, a click elsewhere or Échap.
  document.addEventListener('pointerdown', function (event) {
    document.querySelectorAll('details.page-menu[open]').forEach(function (menu) {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
  });
  document.addEventListener('click', function (event) {
    var item = event.target.closest && event.target.closest('details.page-menu [role="menuitem"]');
    if (item) item.closest('details').removeAttribute('open');
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('details.page-menu[open]').forEach(function (menu) { menu.removeAttribute('open'); });
  });

  // Forms that ask first: <form data-confirm="Supprimer … ?">.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.confirm || form.dataset.confirmed === '1') return;
    event.preventDefault();
    // The button clicked goes with the form (its name and value tell the server what to do).
    var submitter = event.submitter || null;
    window.polyConfirm(form.dataset.confirm).then(function (yes) {
      if (!yes) return;
      form.dataset.confirmed = '1';
      if (form.requestSubmit) form.requestSubmit(submitter);
      else form.submit();
    });
  }, true);
})();
