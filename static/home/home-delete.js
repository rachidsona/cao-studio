/*
 * Deleting from the home page (projects/project_list.html): one project by its row's button, or those ticked in a list
 * with « Supprimer la sélection ». Both ask first, in the page: window.confirm is refused by some embedded browsers.
 */
(function () {
  const dialog = document.getElementById('delete-dialog');
  const title = document.getElementById('delete-title');
  const names = document.getElementById('delete-names');
  const text = document.getElementById('delete-text');
  let pending = null;

  function ask(form, message, labels) {
    pending = form;
    title.textContent = labels.length > 1 ? 'Supprimer ces projets ?' : 'Supprimer ce projet ?';
    text.textContent = message;
    names.replaceChildren(...labels.map(function (label) {
      const item = document.createElement('li');
      item.textContent = label;
      return item;
    }));
    names.hidden = labels.length === 0;
    dialog.showModal();
  }

  document.querySelectorAll('form[data-delete] button').forEach(function (button) {
    button.addEventListener('click', function () {
      ask(button.form, button.form.dataset.delete, []);
      // A folder rather than a project (its own title).
      if (button.form.dataset.title) title.textContent = button.form.dataset.title;
    });
  });

  document.querySelectorAll('form[data-many]').forEach(function (form) {
    const boxes = Array.from(document.querySelectorAll(`input[name="ids"][form="${form.id}"]`));
    const all = form.querySelector('[data-select-all]');
    const remove = form.querySelector('[data-delete-selected]');
    const ticked = function () { return boxes.filter(function (box) { return box.checked; }); };

    function update() {
      const count = ticked().length;
      all.checked = count === boxes.length;
      all.indeterminate = count > 0 && count < boxes.length;
      remove.hidden = count === 0;
      remove.textContent = `Supprimer la sélection (${count})`;
      // « Ranger dans… » the folder chosen, the projects ticked (folders.py).
      const move = form.querySelector('[data-move-selected]');
      if (move) move.hidden = count === 0;
    }

    boxes.forEach(function (box) { box.addEventListener('change', update); });
    all.addEventListener('change', function () {
      boxes.forEach(function (box) { box.checked = all.checked; });
      update();
    });
    remove.addEventListener('click', function () {
      const chosen = ticked();
      const message = chosen.length > 1 ? form.dataset.many.replace('{n}', chosen.length) : form.dataset.one;
      ask(form, message, chosen.map(function (box) { return box.dataset.name; }));
    });
    // The browser may give back ticked boxes on « Back ».
    window.addEventListener('pageshow', update);
    update();
  });

  dialog.querySelector('[data-delete-cancel]').addEventListener('click', function () { dialog.close(); });
  dialog.querySelector('[data-delete-confirm]').addEventListener('click', function () { pending.submit(); });
})();
