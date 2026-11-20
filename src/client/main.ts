import { api, whenLoggedOut } from "./api.ts";
import { btn, element, toast } from "./dom.ts";
import { initKeyboard, setLetters } from "./keyboard.ts";
import { currentRoute, go } from "./router.ts";
import type { User } from "../shared/types.ts";
import { renderAuth } from "./views/auth.ts";
import { buildDealt, buildTable, openSheet, SUITS } from "./views/table.ts";
import { alphabetBody } from "./views/alphabet.ts";
import { notesBody } from "./views/notes.ts";
import { settingsBody } from "./views/settings.ts";
import { deckBody } from "./views/deck.ts";
import { buildStudy } from "./views/study.ts";

const app = document.getElementById("app")!;
let user: User | null = null;
let renderCount = 0;

function header(): HTMLElement {
  return element(
    "header",
    { class: "top" },
    element("a", { href: "#/", class: "brand", "aria-label": "LgDeck, back to the table" }, "LgDeck"),
    element(
      "span",
      { class: "who" },
      element("span", { class: "muted" }, user?.username ?? ""),
      btn("log out", async () => {
        try {
          await api.logout();
        } finally {
          user = null;
          setLetters(null);
          go("/");
          void render();
        }
      }),
    ),
  );
}

async function render(): Promise<void> {
  const mine = ++renderCount;

  if (!user) {
    setLetters(null);
    renderAuth(app, (u) => {
      user = u;
      go("/");
      void render();
    });
    return;
  }

  const route = currentRoute();
  try {
    let main: HTMLElement;
    let overlay: HTMLElement | null = null;

    switch (route.name) {
      case "table": {
        main = await buildTable();
        setLetters(null);
        break;
      }
      case "language":
      case "alphabet":
      case "notes":
      case "settings": {
        const { el, language } = await buildDealt(route.id);
        main = el;
        const close = () => go(`/lang/${language.id}`);
        if (route.name === "alphabet") {
          overlay = openSheet({ suit: SUITS.alphabet, title: `${language.name} alphabet`, body: alphabetBody(language), onClose: close });
          setLetters(null);
        } else if (route.name === "notes") {
          overlay = openSheet({ suit: SUITS.notes, title: `${language.name} notes`, body: notesBody(language), onClose: close });
          setLetters(language.letters);
        } else if (route.name === "settings") {
          overlay = openSheet({ suit: SUITS.settings, title: `${language.name} settings`, body: settingsBody(language), onClose: close });
          setLetters(null);
        } else {
          setLetters(null);
        }
        break;
      }
      case "deck": {
        const deck = await api.deck(route.id);
        const { el, language } = await buildDealt(deck.language.id);
        main = el;
        const summary = language.decks.find((d) => d.id === deck.id);
        overlay = openSheet({
          suit: SUITS.deck,
          title: deck.name,
          body: deckBody(deck, summary),
          onClose: () => go(`/lang/${language.id}`),
        });
        setLetters(deck.language.letters);
        break;
      }
      case "study": {
        main = await buildStudy(route.id, route.mode, route.direction);
        break;
      }
    }

    if (mine !== renderCount) return;
    app.replaceChildren(header(), main, ...(overlay ? [overlay] : []));
    document.body.classList.toggle("has-overlay", !!overlay);
    if (overlay) {
      const sheet = overlay.querySelector<HTMLElement>(".sheet")!;
      sheet.setAttribute("tabindex", "-1");
      const typeRightAway = route.name === "alphabet" || route.name === "notes";
      const field = overlay.querySelector<HTMLElement>("textarea, .row.new input");
      if (typeRightAway && field && window.matchMedia("(pointer: fine)").matches) field.focus();
      else sheet.focus();
    } else {
      window.scrollTo(0, 0);
    }
  } catch (err) {
    if (mine !== renderCount) return;
    if ((err as { status?: number }).status === 404) {
      toast((err as Error).message);
      go("/");
      return;
    }
    if (!user) return;
    app.replaceChildren(
      header(),
      element(
        "main",
        { class: "table" },
        element("div", { class: "card study-card" }, element("p", null, (err as Error).message), btn("try again", () => void render())),
      ),
    );
  }
}

async function start(): Promise<void> {
  initKeyboard();
  whenLoggedOut(() => {
    user = null;
    toast("Your session ended. Log in again.");
    void render();
  });
  try {
    user = await api.me();
  } catch {
    user = null;
  }
  window.addEventListener("hashchange", () => void render());
  await render();
}

void start();
