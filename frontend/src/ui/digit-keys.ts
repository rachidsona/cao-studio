/**
 * Digits typed without Maj in the number fields. On a French (AZERTY) keyboard the keys of the digit row give
 * & é " ' ( § è ! ç à without Maj (or Verr. Maj): in a number field, those keys type their digit. A sign stays what it
 * is: « - » (the 6 of a PC keyboard) for negative values, and in the fields that take a calculation (a « ( » …)
 * the « ( » too.
 */

/** The digit a key types in a number field, or null when the key types what it shows. */
export function digitOfKey(event: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey">, expression: boolean): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const digit = /^Digit([0-9])$/.exec(event.code)?.[1];
  // Not the digit row, or already a digit (Maj, Verr. Maj, a QWERTY keyboard).
  if (!digit || event.key.length !== 1 || /^[0-9]$/.test(event.key)) return null;
  if (event.key === "-" || (expression && /^[()+*/.,]$/.test(event.key))) return null;
  return digit;
}

/** A field of numbers: decimal keypad on phones, or a number input. */
function numberInput(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof HTMLInputElement) || target.readOnly || target.disabled) return null;
  return target.type === "number" || target.inputMode === "decimal" || target.inputMode === "numeric" ? target : null;
}

/** Puts the digit where the caret is, as if it had been typed (the field's own listeners hear it). */
function insert(input: HTMLInputElement, text: string): void {
  if (input.selectionStart !== null && input.type !== "number") {
    input.setRangeText(text, input.selectionStart, input.selectionEnd ?? input.selectionStart, "end");
  } else input.value += text;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
}

/** Number fields of the page take the digits of the digit row without Maj. */
export function bindDigitKeys(root: Document = document): void {
  root.addEventListener(
    "keydown",
    (event) => {
      const input = numberInput(event.target);
      if (!input || event.isComposing) return;
      const digit = digitOfKey(event, input.dataset.expression !== undefined);
      if (digit === null) return;
      event.preventDefault();
      insert(input, digit);
    },
    { capture: true },
  );
}
