/**
 * Panneau « Assistant » : on écrit ce qu'on veut (« un bas de 600 avec trois tiroirs à droite du caisson »,
 * « passe les façades en chêne »), Claude répond et propose des actions ; elles s'affichent en clair et ne
 * s'appliquent qu'au clic sur « Appliquer », en une seule annulation. La conversation reste le temps de la visite.
 * Le serveur parle à Claude (apps/projects/assistant.py) : la clé API n'est jamais dans le navigateur.
 */
import { applyActions, assistantContext, describeAction, type AssistantAction } from "../document/assistant-actions";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { floatingPanel } from "./workshop/workshop-ui";

interface Turn {
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
  applied?: boolean;
}

const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "");
const EXAMPLES = ["Ajoute un bas de cuisine de 600 avec trois tiroirs à droite du caisson", "Implante une cuisine en L de 3 m sur 2,4 m, façades blanches, plan de travail chêne", "Quelle profondeur pour une penderie ?"];

export function bindAssistant(root: HTMLElement, viewport: Viewport, editor: Editor, apiUrl: string): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="assistant"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  const turns: Turn[] = [];
  let busy = false;

  const apply = (turn: Turn): void => {
    try {
      const { doc, done, refused } = applyActions(editor.doc, turn.actions ?? []);
      if (done.length) {
        void editor.change(doc);
        turn.applied = true;
      }
      editor.notify(refused.length ? `Appliqué : ${done.length}. Refusé : ${refused.join(" ; ")}` : `${done.length} action(s) appliquée(s) — ⌘Z pour annuler.`, refused.length ? "error" : "success");
    } catch (error) {
      editor.notify(error instanceof Error ? error.message : String(error), "error");
    }
    render();
  };

  const send = async (text: string): Promise<void> => {
    if (busy || !text.trim()) return;
    busy = true;
    const history = turns.map(({ role, content }) => ({ role, content }));
    turns.push({ role: "user", content: text.trim() });
    render();
    try {
      const response = await fetch(`${apiUrl}assistant/`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRFToken": csrf() },
        body: JSON.stringify({ message: text.trim(), history, context: assistantContext(editor.doc) }),
      });
      const payload = (await response.json().catch(() => ({}))) as { reply?: string; actions?: AssistantAction[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Erreur serveur (${response.status}).`);
      turns.push({ role: "assistant", content: payload.reply || "(pas de réponse)", actions: payload.actions ?? [] });
    } catch (error) {
      turns.pop();
      editor.notify(error instanceof Error ? error.message : String(error), "error");
      draft = text;
    } finally {
      busy = false;
      render();
    }
  };

  let draft = "";
  const render = (): void => {
    if (!panel) return;
    const log = turns.map((t) => {
      if (t.role === "user") return el("p", { class: "ml-6 bg-sky-50 p-2 whitespace-pre-wrap dark:bg-sky-950" }, t.content);
      const actions = t.actions ?? [];
      const go = el("button", { type: "button", class: "h-8 btn-accent px-3 text-xs font-medium disabled:opacity-50", disabled: !!t.applied }, t.applied ? "Appliqué" : "Appliquer");
      go.addEventListener("click", () => apply(t));
      return el(
        "div",
        { class: "mr-6 space-y-1.5 border border-gray-200 p-2 dark:border-gray-700" },
        el("p", { class: "whitespace-pre-wrap" }, t.content),
        actions.length ? el("ol", { class: "list-decimal space-y-0.5 pl-5 text-[11px] text-gray-600 dark:text-gray-300" }, ...actions.map((a) => el("li", {}, describeAction(a)))) : null,
        actions.length ? go : null,
      );
    });
    const input = el("textarea", { class: "w-full border border-gray-300 bg-white p-2 text-xs dark:border-gray-600 dark:bg-gray-900", rows: "3", placeholder: "Décrivez ce que vous voulez construire ou modifier…", "aria-label": "Demande à l'assistant" });
    input.value = draft;
    input.addEventListener("input", () => (draft = input.value));
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        draft = "";
        void send(input.value);
      }
    });
    const go = el("button", { type: "button", class: "h-8 btn-accent px-3 text-xs font-medium disabled:opacity-50", disabled: busy }, busy ? "Réflexion…" : "Envoyer");
    go.addEventListener("click", () => {
      draft = "";
      void send(input.value);
    });
    const examples = turns.length
      ? []
      : EXAMPLES.map((x) => {
          const b = el("button", { type: "button", class: "block w-full border border-dashed border-gray-300 p-1.5 text-left text-[11px] text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800" }, x);
          b.addEventListener("click", () => {
            draft = x;
            render();
          });
          return b;
        });
    const scroller = el("div", { class: "max-h-[50vh] space-y-2 overflow-auto text-xs" }, ...log, ...examples);
    panel.body.replaceChildren(
      scroller,
      input,
      el("div", { class: "flex items-center justify-between gap-2" }, el("span", { class: "text-[11px] text-gray-500" }, "Claude propose, vous appliquez (⌘↵ pour envoyer)."), go),
    );
    scroller.scrollTop = scroller.scrollHeight;
    if (!busy) input.focus();
  };

  button?.addEventListener("click", () => {
    if (panel) return panel.close();
    panel = floatingPanel(
      container,
      "Assistant",
      () => {
        panel = null;
        button.setAttribute("aria-pressed", "false");
      },
      true,
    );
    button.setAttribute("aria-pressed", "true");
    render();
  });
}
