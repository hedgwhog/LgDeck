import { api } from "../api.ts";
import { btn, element, plural, toast } from "../dom.ts";
import { go } from "../router.ts";
import type { Language } from "../../shared/types.ts";

export function settingsBody(language: Language): HTMLElement[] {
  const name = element("input", { type: "text", id: "lang-name", value: language.name, maxlength: "40" });
  const rename = async () => {
    try {
      await api.updateLanguage(language.id, { name: name.value });
      toast(`Renamed to ${name.value.trim()}.`);
      go(`/lang/${language.id}`);
    } catch (err) {
      toast((err as Error).message);
    }
  };
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void rename();
  });

  const cards = language.decks.reduce((n, d) => n + d.cardCount, 0);
  const remove = async () => {
    const what = `${language.name}, its alphabet, notes and ${plural(language.decks.length, "deck")} (${plural(cards, "card")})`;
    if (!window.confirm(`Delete ${what}? This can't be undone.`)) return;
    try {
      await api.deleteLanguage(language.id);
      toast(`Deleted ${language.name}.`);
      go("/");
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return [
    element("label", { for: "lang-name" }, "Name"),
    element("div", { class: "inline" }, name, btn("save name", () => void rename())),
    element("hr"),
    element(
      "p",
      { class: "muted" },
      `Deleting removes the alphabet, notes and all ${plural(language.decks.length, "deck")} of ${language.name}.`,
    ),
    btn(`delete ${language.name}`, () => void remove(), { class: "danger" }),
  ];
}
