/*
 * Deleting from the catalogue (catalog/base.html): a form with data-confirm asks first, in the page — window.confirm is
 * refused by some embedded browsers.
 */
(function () {
  const dialog = document.getElementById("confirm-dialog");
  const text = document.getElementById("confirm-text");
  if (!dialog || !text) return;
  let pending = null;
  document.querySelectorAll("form[data-confirm]").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      if (form.dataset.confirmed) return;
      event.preventDefault();
      pending = form;
      text.textContent = form.dataset.confirm;
      dialog.showModal();
    });
  });
  dialog.querySelector("[data-confirm-cancel]").addEventListener("click", function () {
    pending = null;
    dialog.close();
  });
  dialog.querySelector("[data-confirm-ok]").addEventListener("click", function () {
    dialog.close();
    if (!pending) return;
    pending.dataset.confirmed = "1";
    pending.submit();
  });
})();
