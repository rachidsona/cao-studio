/** La recherche de la palette de commandes : sans accents ni majuscules, tous les mots tapés, le nom avant le reste. Pur. */
export interface Command {
  key: string;
  label: string;
  /** Its group of the ribbon, and what its tooltip says: found, but after the names. */
  group: string;
  hint: string;
}

const STRIP = new RegExp("[\\u0300-\\u036f]", "g");
const plain = (text: string) => text.normalize("NFD").replace(STRIP, "").toLowerCase();

function score(command: Command, words: string[]): number {
  const label = plain(command.label);
  const rest = plain(`${command.group} ${command.hint}`);
  let total = 0;
  for (const word of words) {
    if (label.startsWith(word)) total += 4;
    else if (label.includes(` ${word}`)) total += 3;
    else if (label.includes(word)) total += 2;
    else if (rest.includes(word)) total += 1;
    else return 0;
  }
  return total;
}

/** The commands that hold every word typed, the best first; with nothing typed, those used last, then all of them. */
export function searchCommands(commands: readonly Command[], query: string, recent: readonly string[] = []): Command[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) {
    const used = recent.flatMap((key) => commands.filter((c) => c.key === key));
    return [...used, ...commands.filter((c) => !used.includes(c))];
  }
  return commands
    .map((command, i) => ({ command, i, value: score(command, words) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .map((c) => c.command);
}
