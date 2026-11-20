import { api } from "../api.ts";
import { animate, btn, element, plural, toast } from "../dom.ts";
import { go } from "../router.ts";
import type { Language, LanguageSummary } from "../../shared/types.ts";

let lastDealt: number | null = null;

export const SUITS = {
  alphabet: "Aa",
  notes: "¶",
  settings: "*",
  deck: "#",
  add: "+",
} as const;

function corners(suit: string): HTMLElement[] {
  return [
    element("span", { class: "suit tl", "aria-hidden": "true" }, suit),
    element("span", { class: "suit br", "aria-hidden": "true" }, suit),
  ];
}

function tableCard(opts: {
  suit: string;
  title: string;
  lines?: string[];
  onClick: () => void;
  index: number;
  deal: boolean;
}): HTMLElement {
  return element(
    "button",
    {
      type: "button",
      class: `card table-card${opts.deal ? " deal" : ""}`,
      style: { "--i": String(opts.index) },
      onclick: opts.onClick,
    },
    ...corners(opts.suit),
    element("span", { class: "card-title" }, opts.title),
    ...(opts.lines ?? []).map((line) => element("span", { class: "card-line" }, line)),
  );
}

function newSlot(opts: {
  label: string;
  placeholder: string;
  index: number;
  deal: boolean;
  disabledReason?: string;
  onCreate: (name: string) => Promise<void>;
}): HTMLElement {
  const slot = element(
    "div",
    { class: `card slot${opts.deal ? " deal" : ""}`, style: { "--i": String(opts.index) } },
  );

  function showButton(): void {
    slot.classList.remove("editing");
    slot.replaceChildren(
      element(
        "button",
        {
          type: "button",
          class: "slot-button",
          disabled: !!opts.disabledReason,
          "aria-describedby": opts.disabledReason ? `why-${opts.index}` : undefined,
          onclick: showForm,
        },
        element("span", { class: "card-title" }, `+ ${opts.label}`),
        opts.disabledReason ? element("span", { class: "card-line", id: `why-${opts.index}` }, opts.disabledReason) : null,
      ),
    );
  }

  function showForm(): void {
    slot.classList.add("editing");
    const input = element("input", { type: "text", maxlength: "40", placeholder: opts.placeholder, "aria-label": opts.label });
    const create = async () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      try {
        await opts.onCreate(name);
      } catch (err) {
        toast((err as Error).message);
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void create();
      if (e.key === "Escape") showButton();
    });
    slot.replaceChildren(
      ...corners(SUITS.add),
      element("span", { class: "card-title" }, opts.label),
      input,
      element("span", { class: "slot-actions" }, btn("create", () => void create()), btn("cancel", showButton)),
    );
    input.focus();
  }

  showButton();
  return slot;
}

function pile(language: LanguageSummary | Language, onClick: () => void, label: string): HTMLElement {
  const letters = "letterCount" in language ? language.letterCount : language.letters.length;
  const decks = "deckCount" in language ? language.deckCount : language.decks.length;
  return element(
    "button",
    { type: "button", class: "card pile", onclick: onClick, "aria-label": label },
    ...corners(language.name.slice(0, 2)),
    element("span", { class: "card-title" }, language.name),
    element("span", { class: "card-line" }, plural(letters, "letter")),
    element("span", { class: "card-line" }, plural(decks, "deck")),
  );
}

export async function buildTable(): Promise<HTMLElement> {
  const languages = await api.languages();
  lastDealt = null;

  const piles = languages.map((lang) => pile(lang, () => go(`/lang/${lang.id}`), `Deal ${lang.name}`));
  const slot = newSlot({
    label: "New language",
    placeholder: "e.g. Dutch",
    index: piles.length,
    deal: false,
    onCreate: async (name) => {
      const { id } = await api.createLanguage(name);
      go(`/lang/${id}/alphabet`);
    },
  });

  return element(
    "main",
    { class: "table" },
    element(
      "p",
      { class: "table-hint" },
      languages.length === 0
        ? "Your table is empty. Add the first language you're learning."
        : "Choose a language to deal its cards, or add a new language.",
    ),
    element("div", { class: "piles" }, ...piles, slot),
  );
}

export async function buildDealt(languageId: number): Promise<{ el: HTMLElement; language: Language }> {
  const language = await api.language(languageId);
  const deal = lastDealt !== languageId;
  lastDealt = languageId;

  const hasLetters = language.letters.length > 0;
  let i = 0;
  const cards: HTMLElement[] = [
    tableCard({
      suit: SUITS.alphabet,
      title: "Alphabet",
      lines: [hasLetters ? plural(language.letters.length, "letter") : "Start here"],
      onClick: () => go(`/lang/${language.id}/alphabet`),
      index: i++,
      deal,
    }),
    tableCard({
      suit: SUITS.notes,
      title: "Notes",
      lines: [language.notes.trim() ? plural(language.notes.trim().split(/\s+/).length, "word") : "Empty"],
      onClick: () => go(`/lang/${language.id}/notes`),
      index: i++,
      deal,
    }),
    ...language.decks.map((deck) =>
      tableCard({
        suit: SUITS.deck,
        title: deck.name,
        lines: [plural(deck.cardCount, "card"), deck.dueCount > 0 ? `${deck.dueCount} due today` : ""].filter(Boolean),
        onClick: () => go(`/deck/${deck.id}`),
        index: i++,
        deal,
      }),
    ),
    newSlot({
      label: "new deck",
      placeholder: "e.g. Food",
      index: i++,
      deal,
      disabledReason: hasLetters ? undefined : "Add letters to the alphabet first",
      onCreate: async (name) => {
        const { id } = await api.createDeck(language.id, name);
        go(`/deck/${id}`);
      },
    }),
    tableCard({
      suit: SUITS.settings,
      title: "Settings",
      lines: ["Rename or delete"],
      onClick: () => go(`/lang/${language.id}/settings`),
      index: i++,
      deal,
    }),
  ];

  const dealt = element("div", { class: "dealt" }, ...cards);
  const gather = async () => {
    await Promise.all(cards.map((c) => animate(c, "gather", 300)));
    go("/");
  };

  const el = element(
    "main",
    { class: "table" },
    element(
      "div",
      { class: "dealt-head" },
      pile(language, () => void gather(), `Gather up ${language.name}`),
      // element("p", { class: "table-hint" }, "Tap the pile to gather the cards back up."),
    ),
    dealt,
  );
  return { el, language };
}

export function openSheet(opts: {
  suit: string;
  title: string;
  body: HTMLElement[];
  onClose: () => void;
}): HTMLElement {
  const close = btn("close", opts.onClose, { "aria-label": "Close this card" });
  const sheet = element(
    "section",
    { class: "card sheet flip", role: "dialog", "aria-modal": "true", "aria-label": opts.title },
    ...corners(opts.suit),
    element("header", { class: "sheet-head" }, element("h2", { class: "card-title" }, opts.title), close),
    ...opts.body,
  );
  const overlay = element("div", { class: "overlay" }, sheet);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) opts.onClose();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") opts.onClose();
  });
  return overlay;
}
