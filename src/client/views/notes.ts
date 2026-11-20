import { api } from "../api.ts";
import { element as element } from "../dom.ts";
import type { Language } from "../../shared/types.ts";

export function notesBody(language: Language): HTMLElement[] {
  const status = element("p", { class: "status", role: "status", "aria-live": "polite" }, "Saves automatically.");
  const area = element("textarea", {
    class: "notes",
    "aria-label": `Notes for ${language.name}`,
    placeholder: "Add your notes here...",
    spellcheck: "false",
  });
  area.value = language.notes;

  let timer: number | undefined;
  let saved = language.notes;

  const save = async () => {
    const text = area.value;
    if (text === saved) return;
    try {
      await api.updateLanguage(language.id, { notes: text });
      saved = text;
      status.textContent = "Saved.";
    } catch (error) {
      status.textContent = (error as Error).message;
    }
  };

  area.addEventListener("input", () => {
    status.textContent = "Saving…";
    clearTimeout(timer);
    timer = window.setTimeout(() => void save(), 600);
  });
  area.addEventListener("blur", () => {
    clearTimeout(timer);
    void save();
  });
  window.addEventListener("pagehide", () => void save(), { once: true });

  return [area, status];
}
