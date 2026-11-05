/*
 * The workshop's list of cabinets (poly/dashboard.html): the search and the affair filter work in the page, the « … »
 * menu of a row stays alone open, and « Nouveau caisson » opens its form in a dialog.
 */
(function () {
  const search = document.getElementById('cabinet-search');
  const affair = document.getElementById('cabinet-affair');
  const rows = Array.from(document.querySelectorAll('[data-cabinet]'));
  const empty = document.getElementById('cabinet-empty');

  function matches(row, text, wanted) {
    if (!row.dataset.name.includes(text)) return false;
    const affairs = row.dataset.affairs.trim().split(' ').filter(Boolean);
    if (wanted === 'none') return affairs.length === 0;
    return !wanted || affairs.includes(wanted);
  }

  function filter() {
    const text = search.value.trim().toLowerCase();
    let shown = 0;
    rows.forEach(function (row) {
      row.hidden = !matches(row, text, affair.value);
      if (!row.hidden) shown += 1;
    });
    if (rows.length) empty.hidden = shown > 0;
  }

  search.addEventListener('input', filter);
  affair.addEventListener('change', filter);

  const menus = Array.from(document.querySelectorAll('.row-menu'));
  menus.forEach(function (menu) {
    menu.addEventListener('toggle', function () {
      if (menu.open) menus.forEach(function (other) { if (other !== menu) other.open = false; });
    });
  });
  document.addEventListener('click', function (event) {
    menus.forEach(function (menu) { if (!menu.contains(event.target)) menu.open = false; });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') menus.forEach(function (menu) { menu.open = false; });
  });

  document.querySelectorAll('[data-open-dialog]').forEach(function (button) {
    const dialog = document.getElementById(button.dataset.openDialog);
    button.addEventListener('click', function () { dialog.showModal(); });
    dialog.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
    // A click on the backdrop lands on the dialog itself.
    dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
  });
})();
