import { api } from "../api.ts";
import { animate, btn, element, plural, toast } from "../dom.ts";
import { kbd, pin, setLetters } from "../keyboard.ts";
import { go } from "../router.ts";
import { checkAnswer } from "../../shared/check.ts";
import { BOX_COUNT, intervalDays, nextBox } from "../../shared/leitner.ts";
import type { DirectionChoice, StudyItem, StudyMode } from "../../shared/types.ts";
import { SUITS } from "./table.ts";

function days(n: number): string {
  return n === 1 ? "tomorrow" : `in ${n} days`;
}

export async function buildStudy(deckId: number, mode: StudyMode, direction: DirectionChoice): Promise<HTMLElement> {
  const [deck, items] = await Promise.all([api.deck(deckId), api.study(deckId, mode, direction)]);
  const lang = deck.language.name;
  setLetters(deck.language.letters);

  const backToDeck = () => go(`/deck/${deck.id}`);
  const modeText = mode === "smart" ? "smart" : "simple";
  const dirText =
    direction === "forward" ? `${lang} → translation` : direction === "reverse" ? `translation → ${lang}` : "mixed";

  // ── piles ──
  const drawCount = element("span", { class: "card-title" });
  const drawPile = element(
    "div",
    { class: "card pile mini draw-pile", "aria-label": "Cards left" },
    drawCount,
    element("span", { class: "card-line" }, "left"),
  );

  const landing: { el: HTMLElement; count: HTMLElement; n: number }[] = [];
  const labels =
    mode === "smart"
      ? Array.from({ length: BOX_COUNT }, (_, i) => `box ${i + 1}`)
      : ["✓ right", "✗ wrong"];
  for (const label of labels) {
    const count = element("span", { class: "card-title" }, "0");
    const el = element("div", { class: "card pile mini landing empty" }, count, element("span", { class: "card-line" }, label));
    landing.push({ el, count, n: 0 });
  }

  const slot = element("div", { class: "study-slot" });
  const top = element(
    "header",
    { class: "study-head" },
    element("div", null, element("h1", { class: "study-title" }, deck.name), element("p", { class: "muted small" }, `${modeText}, ${dirText}`)),
    btn("end session", backToDeck),
  );
  const root = element(
    "main",
    { class: "table study" },
    top,
    element("div", { class: "study-stage" }, drawPile, slot),
    element("div", { class: `landing-row ${mode}` }, ...landing.map((l) => l.el)),
  );

  // ── nothing to study ──
  if (items.length === 0) {
    drawPile.hidden = true;
    const message =
      mode === "smart"
        ? "Nothing is due in this deck today. Come back tomorrow, or study it in simple mode."
        : "This deck has no cards yet. Add words first.";
    slot.append(
      element(
        "div",
        { class: "card study-card draw" },
        element("span", { class: "suit tl", "aria-hidden": "true" }, "z"),
        element("span", { class: "suit br", "aria-hidden": "true" }, "z"),
        element("p", { class: "prompt small-prompt" }, message),
        element(
          "div",
          { class: "actions" },
          mode === "smart"
            ? btn("study in simple mode", () => go(`/deck/${deck.id}/study?mode=simple&direction=${direction}`), { class: "primary" })
            : null,
          btn("back to deck", backToDeck),
        ),
      ),
    );
    return root;
  }

  let index = 0;
  const missed: StudyItem[] = [];
  let right = 0;

  function updateDrawPile(): void {
    const left = items.length - index;
    drawCount.textContent = String(left);
    drawPile.classList.toggle("empty", left === 0);
  }

  function showCard(item: StudyItem): void {
    const reverse = item.direction === "reverse";
    const input = element("input", { type: "text", id: "answer", autocomplete: "off", spellcheck: "false", autocapitalize: "none" });
    if (reverse) kbd(input);
    const result = element("div", { class: "result", "aria-live": "polite" });
    const check = btn("check", () => submit(), { class: "primary" });
    let checked = false;

    const card = element(
      "div",
      { class: "card study-card draw" },
      element("span", { class: "suit tl", "aria-hidden": "true" }, SUITS.deck),
      element("span", { class: "suit br", "aria-hidden": "true" }, SUITS.deck),
      element("p", { class: "prompt" }, item.prompt),
      element("label", { for: "answer", class: "muted small" }, reverse ? `Type it in ${lang}.` : "Type the translation."),
      element("div", { class: "answer-line" }, element("span", { "aria-hidden": "true" }, ">"), input),
      result,
      element("div", { class: "actions" }, check),
    );

    async function submit(): Promise<void> {
      if (checked) return next();
      if (!input.value.trim()) {
        input.focus();
        return;
      }
      checked = true;
      input.readOnly = true;
      const outcome = checkAnswer(input.value, item.answer);
      if (outcome.correct) right++;
      else missed.push(item);

      const answer = element(
        "span",
        { class: "answer" },
        ...Array.from(outcome.expected).map((ch, i) => element("span", { class: outcome.marks[i] ? "miss" : undefined }, ch)),
      );
      result.replaceChildren(element("p", { class: "verdict" }, outcome.correct ? "✓ Right." : "✗ Not quite."));
      if (!outcome.correct) {
        result.append(element("p", null, "Answer: ", answer));
      } else if (outcome.expected !== item.answer.trim()) {
        result.append(element("p", null, "All answers: ", item.answer));
      }

      let pile = outcome.correct ? 0 : 1;
      if (mode === "smart") {
        const box = nextBox(item.box, outcome.correct);
        pile = box - 1;
        result.append(
          element(
            "p",
            { class: "muted small" },
            outcome.correct
              ? `Moves to box ${box}. Back ${days(intervalDays(box))}.`
              : `Back to box 1. Returns ${days(intervalDays(1))}.`,
          ),
        );
        api.review(item.cardId, item.direction, outcome.correct).catch((err: Error) => toast(err.message));
      }
      card.dataset.pile = String(pile);

      check.textContent = index === items.length - 1 ? "finish" : "next";
      check.focus();
      void animate(card, outcome.correct ? "flash" : "shake");
    }

    async function next(): Promise<void> {
      const target = landing[Number(card.dataset.pile)];
      await animate(card, "fly", 320);
      target.n++;
      target.count.textContent = String(target.n);
      target.el.classList.remove("empty");
      void animate(target.el, "bump", 250);
      index++;
      updateDrawPile();
      if (index < items.length) showCard(items[index]);
      else showSummary();
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    });

    slot.replaceChildren(card);
    requestAnimationFrame(() => input.focus());
  }

  function showSummary(): void {
    drawPile.hidden = true;
    const list = missed.length
      ? element(
          "ul",
          { class: "missed" },
          ...missed.map((m) => element("li", null, element("span", null, m.prompt), element("span", { "aria-hidden": "true" }, " → "), element("span", null, m.answer))),
        )
      : element("p", null, "No mistakes.");
    const again = btn("study again", () => go(`/deck/${deck.id}/study?mode=${mode}&direction=${direction}&t=${Date.now()}`), {
      class: "primary",
    });
    slot.replaceChildren(
      element(
        "div",
        { class: "card study-card draw" },
        element("span", { class: "suit tl", "aria-hidden": "true" }, "="),
        element("span", { class: "suit br", "aria-hidden": "true" }, "="),
        element("p", { class: "prompt small-prompt" }, `${right} of ${plural(items.length, "card")} right.`),
        missed.length ? element("h3", null, "Practice these") : null,
        list,
        element("div", { class: "actions" }, again, btn("back to deck", backToDeck)),
      ),
    );
    requestAnimationFrame(() => again.focus());
  }

  updateDrawPile();
  showCard(items[0]);
  if (items.some((i) => i.direction === "reverse")) requestAnimationFrame(pin);
  return root;
}
