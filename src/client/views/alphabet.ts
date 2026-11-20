import { api } from "../api.ts";
import { btn, element as element, toast } from "../dom.ts";
import type { Language, Letter } from "../../shared/types.ts";

export function alphabetBody(language: Language): HTMLElement[] {
  let letters: Letter[] = language.letters;
  const rows = element("div", { class: "grid alphabet-grid", role: "table", "aria-label": "Alphabet" });
  const list = element("div", { class: "grid", role: "rowgroup" });
  const status = element("p", { class: "status", role: "status", "aria-live": "polite" });

  const say = (text: string) => {
    status.textContent = text;
  };

  async function reload(): Promise<void> {
    letters = (await api.language(language.id)).letters;
    render();
  }

  async function move(index: number, by: -1 | 1): Promise<void> {
    const other = index + by;
    if (other < 0 || other >= letters.length) return;
    const ids = letters.map((l) => l.id);
    [ids[index], ids[other]] = [ids[other], ids[index]];
    try {
      await api.orderLetters(language.id, ids);
      await reload();

      rows.querySelector<HTMLElement>(`[data-move="${other}:${by}"]`)?.focus();
    } catch (error) {
      toast((error as Error).message);
    }
  }

  function existingRow(letter: Letter, index: number): HTMLElement {
    const lower = element("input", { type: "text", value: letter.lower, maxlength: "8", "aria-label": `Letter ${index + 1}` });
    const upper = element("input", { type: "text", value: letter.upper, maxlength: "8", "aria-label": `Capital of ${letter.lower}` });
    const pron = element("input", { type: "text", value: letter.pronunciation, maxlength: "200", "aria-label": `Pronunciation of ${letter.lower}`});
    
    let previousLower = letter.lower;

    const save = async () => {
      if (!lower.value.trim()) {
        lower.value = previousLower;
        say("A letter can't be empty. Use ✕ to delete it.");
        return;
      }

      if (upper.value === previousLower.toLocaleUpperCase()) upper.value = lower.value.trim().toLocaleUpperCase();
      try {
        await api.updateLetter(letter.id, { lower: lower.value, upper: upper.value, pronunciation: pron.value });
        previousLower = lower.value.trim();
        say(`Saved ${previousLower}.`);
      } catch (error) {
        toast((error as Error).message);
      }
    };
    [lower, upper, pron].forEach((input) => {
      input.addEventListener("change", () => void save());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
    });

    return element(
      "div",
      { class: "row", role: "row" },
      element(
        "span",
        { class: "move" },
        btn("↑", () => void move(index, -1), { class: "icon", "aria-label": `Move ${letter.lower} up`, "data-move": `${index}:-1`, disabled: index === 0 }),
        btn("↓", () => void move(index, 1), {
          class: "icon",
          "aria-label": `Move ${letter.lower} down`,
          "data-move": `${index}:1`,
          disabled: index === letters.length - 1,
        }),
      ),

      lower, upper, pron,

      btn(
        "✕",
        async () => {
          try {
            await api.deleteLetter(letter.id);
            say(`Deleted ${letter.lower}.`);
            await reload();
          } catch (error) {
            toast((error as Error).message);
          }
        },
        { class: "icon", "aria-label": `Delete ${letter.lower}` },
      ),
    );
  }

  function newRow(): HTMLElement {
    const lower = element("input", { type: "text", maxlength: "8", placeholder: "а", "aria-label": "New letter" });
    const upper = element("input", { type: "text", maxlength: "8", placeholder: "А", "aria-label": "Its capital" });
    const pron = element("input", { type: "text", maxlength: "200", placeholder: "how it sounds", "aria-label": "How it sounds" });

    lower.addEventListener("input", () => {
      upper.placeholder = lower.value.trim().toLocaleUpperCase() || "А";
    });

    const add = async () => {
      const value = {
        lower: lower.value.normalize("NFC").trim(),
        upper: upper.value.normalize("NFC").trim(),
        pronunciation: pron.value.trim(),
      };
      if (!value.lower) {
        lower.focus();
        return;
      }

      lower.value = upper.value = pron.value = "";
      upper.placeholder = "А";
      lower.focus();
      try {
        const { id } = await api.addLetter(language.id, value);
        letters = [
          ...letters,
          { id, ...value, upper: value.upper || value.lower.toLocaleUpperCase(), position: letters.length },
        ];
        renderList();
        say(`Added ${value.lower}.`);
      } catch (error) {
        if (!lower.value && !pron.value) {
          lower.value = value.lower;
          upper.value = value.upper;
          pron.value = value.pronunciation;
        }
        toast((error as Error).message);
      }
    };
    [lower, upper, pron].forEach((input) =>
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void add();
      }),
    );

    return element("div", { class: "row new", role: "row" }, element("span", { class: "move" }), lower, upper, pron, btn("add", () => void add()));
  }

  function renderList(): void {
    list.replaceChildren(...letters.map(existingRow));
  }
  const render = renderList;

  rows.append(
    element(
      "div",
      { class: "row head", role: "row" },
      element("span", { role: "columnheader" }),
      element("span", { role: "columnheader" }, "letter"),
      element("span", { role: "columnheader" }, "capital"),
      element("span", { role: "columnheader" }, "pronunciation"),
      element("span", { role: "columnheader" }),
    ),
    list,
    newRow(),
  );
  render();
  return [
    element(
      "p",
      { class: "muted" },
      letters.length === 0
        ? "Add every letter of the alphabet. Type with your own keyboard or paste letters in. These letters become visible on screen."
        : "This is the order the letters show up visible on your screen.",
    ),
    rows,
    status,
  ];
}
