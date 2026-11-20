import { api } from "../api.ts";
import { btn, element as element, plural, toast } from "../dom.ts";
import { kbd } from "../keyboard.ts";
import { go } from "../router.ts";
import type { Card, Deck, DeckSummary, DirectionChoice, StudyMode } from "../../shared/types.ts";

const PREF = "lgdeck.study";

function loadChoice(): { mode: StudyMode; direction: DirectionChoice } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF) ?? "{}");
    return {
      mode: saved.mode === "smart" ? "smart" : "simple",
      direction: ["forward", "reverse", "mixed"].includes(saved.direction) ? saved.direction : "forward",
    };
  } catch {
    return { mode: "simple", direction: "forward" };
  }
}

function saveChoice(choice: { mode: StudyMode; direction: DirectionChoice }): void {
  try {
    localStorage.setItem(PREF, JSON.stringify(choice));
  } catch {
    // choice just isnt remembered, but thats fine
  }
}

function radios<T extends string>(name: string, legend: string, options: [T, string][], value: T, onChange: (v: T) => void) {
  return element(
    "fieldset",
    { class: "radios" },
    element("legend", null, legend),
    ...options.map(([checked, label]) => {
      const input = element("input", { type: "radio", name, value: checked, id: `${name}-${checked}`, checked: checked === value });
      input.addEventListener("change", () => onChange(checked));
      return element("span", { class: "radio" }, input, element("label", { for: `${name}-${checked}` }, label));
    }),
  );
}

export function deckBody(deck: Deck, summary: DeckSummary | undefined): HTMLElement[] {
  let cards: Card[] = deck.cards;
  const lang = deck.language.name;
  const choice = loadChoice();

  const start = btn("start studying", () => {
    saveChoice(choice);
    go(`/deck/${deck.id}/study?mode=${choice.mode}&direction=${choice.direction}`);
  }, { class: "primary" });
  const due = summary?.dueCount ?? 0;

  const study = element(
    "section",
    { class: "study-setup", "aria-label": "Study" },
    radios<StudyMode>(
      "mode",
      "Mode",
      [
        ["simple", "simple: all cards one time"],
        ["smart", `smart: only the cards you have not done today (${plural(due, "card")} due)`],
      ],
      choice.mode,
      (v) => (choice.mode = v),
    ),
    radios<DirectionChoice>(
      "direction",
      "Show",
      [
        ["forward", `${lang} → translation`],
        ["reverse", `translation → ${lang}`],
        ["mixed", "mixed"],
      ],
      choice.direction,
      (v) => (choice.direction = v),
    ),
    start,
  );

  const rows = element("div", { class: "grid words-grid", role: "table", "aria-label": "Words" });
  const list = element("div", { class: "grid", role: "rowgroup" });
  const count = element("p", { class: "muted small" });
  const status = element("p", { class: "status", role: "status", "aria-live": "polite" });

  async function reload(): Promise<void> {
    cards = (await api.deck(deck.id)).cards;
    render();
  }

  function existingRow(card: Card): HTMLElement {
    const word = kbd(element("input", { type: "text", value: card.word, maxlength: "200", "aria-label": `${lang} word` }));
    const translation = element("input", { type: "text", value: card.translation, maxlength: "200", "aria-label": "Translation" });
    let last = { word: card.word, translation: card.translation };

    const save = async () => {
      if (!word.value.trim() || !translation.value.trim()) {
        word.value = last.word;
        translation.value = last.translation;
        status.textContent = "Both sides need text.";
        return;
      }
      try {
        await api.updateCard(card.id, word.value, translation.value);
        last = { word: word.value.trim(), translation: translation.value.trim() };
        status.textContent = `Saved ${last.word}.`;
      } catch (error) {
        toast((error as Error).message);
      }
    };
    [word, translation].forEach((input) => {
      input.addEventListener("change", () => void save());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
    });

    return element(
      "div",
      { class: "row", role: "row" },
      word,
      translation,
      btn(
        "✕",
        async () => {
          try {
            await api.deleteCard(card.id);
            status.textContent = `Deleted ${card.word}.`;
            await reload();
          } catch (error) {
            toast((error as Error).message);
          }
        },
        { class: "icon", "aria-label": `Delete ${card.word}` },
      ),
    );
  }

  function newRow(): HTMLElement {
    const word = kbd(element("input", { type: "text", maxlength: "200", placeholder: "word", "aria-label": `New ${lang} word` }));
    const translation = element("input", { type: "text", maxlength: "200", placeholder: "translation", "aria-label": "Its translation" });

    const add = async () => {
      const value = { word: word.value.normalize("NFC").trim(), translation: translation.value.normalize("NFC").trim() };
      if (!value.word) return word.focus();
      if (!value.translation) return translation.focus();
      word.value = translation.value = "";
      word.focus();
      try {
        const { id } = await api.addCard(deck.id, value.word, value.translation);
        cards = [...cards, { id, ...value, boxForward: 1, boxReverse: 1 }];
        render();
        status.textContent = `Added ${value.word}.`;
      } catch (error) {
        if (!word.value && !translation.value) {
          word.value = value.word;
          translation.value = value.translation;
        }
        toast((error as Error).message);
      }
    };
    word.addEventListener("keydown", (e) => {
      if (e.key === "Enter") (translation.value.trim() ? void add() : translation.focus());
    });
    translation.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void add();
    });

    return element("div", { class: "row new", role: "row" }, word, translation, btn("add", () => void add()));
  }

  function render(): void {
    count.replaceChildren(
      `${plural(cards.length, "card")}. Separate several correct answers with /, like `, 
      element("span", { class: "nowrap" }, '"hi / hi hi"'), "."
    );
    start.disabled = cards.length === 0;
    list.replaceChildren(...cards.map(existingRow));
  }
  rows.append(
    element(
      "div",
      { class: "row head", role: "row" },
      element("span", { role: "columnheader" }, lang),
      element("span", { role: "columnheader" }, "translation"),
      element("span", { role: "columnheader" }),
    ),
    list,
    newRow(),
  );
  render();

  const name = element("input", { type: "text", id: "deck-name", value: deck.name, maxlength: "40" });
  const rename = async () => {
    try {
      await api.renameDeck(deck.id, name.value);
      toast(`Renamed to ${name.value.trim()}.`);
      go(`/deck/${deck.id}`);
    } catch (error) {
      toast((error as Error).message);
    }
  };
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void rename();
  });
  const remove = async () => {
    if (!window.confirm(`Delete "${deck.name}" and its ${plural(cards.length, "card")}? This can't be undone.`)) return;
    try {
      await api.deleteDeck(deck.id);
      toast(`Deleted ${deck.name}.`);
      go(`/lang/${deck.language.id}`);
    } catch (error) {
      toast((error as Error).message);
    }
  };

  return [
    study,
    element("hr"),
    element("h3", null, "Words"),
    count,
    rows,
    status,
    element("hr"),
    element("label", { for: "deck-name" }, "Deck name"),
    element("div", { class: "inline" }, name, btn("save name", () => void rename())),
    btn(`delete ${deck.name}`, () => void remove(), { class: "danger" }),
  ];
}
