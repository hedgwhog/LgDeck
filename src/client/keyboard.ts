import type { Letter } from "../shared/types.ts";
import { element } from "./dom.ts";

const PHONE_PREF = "lgdeck.phoneKeyboard";
const BIG = 12;

type Field = HTMLInputElement | HTMLTextAreaElement;

let letters: Letter[] | null = null;
let shift = false;
let pinned = false; 
let closed = false;
let target: Field | null = null;

const panel = element("div", { class: "kbd", role: "group", "aria-label": "On-screen keyboard", hidden: true });
const toggle = element("button", {
  type: "button",
  class: "kbd-toggle",
  "aria-label": "Show the on-screen keyboard",
  hidden: true,
});

const coarse = window.matchMedia("(pointer: coarse)");

function phonePreferred(): boolean {
  try {
    return localStorage.getItem(PHONE_PREF) === "1";
  } catch {
    return false;
  }
}

function setPhonePreferred(on: boolean): void {
  try {
    if (on) localStorage.setItem(PHONE_PREF, "1");
    else localStorage.removeItem(PHONE_PREF);
  } catch {
    // storage unavailable
  }
}

function isBig(): boolean {
  return !!letters && letters.length > BIG;
}

function replacing(): boolean {
  return coarse.matches && isBig() && !phonePreferred();
}

function isField(node: unknown): node is Field {
  if (node instanceof HTMLTextAreaElement) return true;
  return node instanceof HTMLInputElement && (node.type === "text" || node.type === "search");
}

function applyInputMode(field: Field): void {
  if (replacing()) field.setAttribute("inputmode", "none");
  else field.removeAttribute("inputmode");
}

export function kbd<T extends Field>(field: T): T {
  field.dataset.kbd = "1";
  field.setAttribute("autocapitalize", "none");
  field.setAttribute("autocomplete", "off");
  field.setAttribute("spellcheck", "false");
  applyInputMode(field);
  return field;
}

export function pin(): void {
  pinned = true;
  closed = false;
  update();
}

export function setLetters(next: Letter[] | null): void {
  letters = next && next.length > 0 ? next : null;
  pinned = false;
  closed = false;
  shift = false;
  document.querySelectorAll<Field>("[data-kbd]").forEach(applyInputMode);
  build();
  update();
}

function insert(text: string): void {
  if (!target || !target.isConnected || target.disabled) return;
  if (document.activeElement !== target) target.focus();
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  target.setRangeText(text, start, end, "end");
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function backspace(): void {
  if (!target || !target.isConnected || target.disabled) return;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  if (start !== end) {
    target.setRangeText("", start, end, "end");
  } else if (start > 0) {
    const before = Array.from(target.value.slice(0, start));
    const removed = before.pop() ?? "";
    target.setRangeText("", start - removed.length, start, "end");
  }
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function enter(): void {
  target?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function key(label: string, action: () => void, opts: { cls?: string; aria?: string; pressed?: boolean } = {}) {
  const el = element(
    "button",
    {
      type: "button",
      class: `key ${opts.cls ?? ""}`.trim(),
      "aria-label": opts.aria,
      "aria-pressed": opts.pressed === undefined ? undefined : String(opts.pressed),
    },
    label,
  );
  el.addEventListener("pointerdown", (e) => e.preventDefault());
  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", action);
  return el;
}

function build(): void {
  panel.replaceChildren();
  if (!letters) return;
  toggle.textContent = letters.slice(0, 2).map((l) => l.lower).join("");

  const keys = element("div", { class: "kbd-keys" });
  for (const letter of letters) {
    const label = shift ? letter.upper : letter.lower;
    keys.append(
      key(label, () => {
        insert(label);
        if (shift) {
          shift = false;
          build();
        }
      }),
    );
  }

  const controls = element("div", { class: "kbd-controls" });
  controls.append(
    key("shift", () => {
      shift = !shift;
      build();
    }, { cls: "wide", aria: "Capital letters", pressed: shift }),
  );
  if (replacing()) {
    controls.append(
      key("space", () => insert(" "), { cls: "space" }),
      key("del", backspace, { cls: "wide", aria: "Backspace" }),
      key("↵", enter, { cls: "wide", aria: "Enter" }),
      key("abc", usePhoneKeyboard, { cls: "wide", aria: "Use your phone's keyboard" }),
    );
  }
  controls.append(key("hide", hide, { cls: "wide", aria: "Hide the on-screen keyboard" }));

  panel.append(keys, controls);
}

function hide(): void {
  pinned = false;
  closed = true;
  update();
}

function usePhoneKeyboard(): void {
  setPhonePreferred(true);
  pinned = false;
  document.querySelectorAll<Field>("[data-kbd]").forEach(applyInputMode);
  build();
  update();
  if (target) {
    target.blur();
    target.focus();
  }
}

function show(): void {
  closed = false;
  pinned = true;
  if (coarse.matches && isBig() && phonePreferred()) {
    setPhonePreferred(false);
    document.querySelectorAll<Field>("[data-kbd]").forEach(applyInputMode);
    build();
  }
  if (target?.isConnected) {
    target.blur();
    target.focus();
  }
  update();
}

function update(): void {
  const active = document.activeElement;
  const onLanguageField = isField(active) && active.dataset.kbd === "1";
  const auto = onLanguageField && !closed && !(coarse.matches && isBig() && phonePreferred());
  const visible = !!letters && (pinned || auto);

  const anyField = !!document.querySelector('#app input[type="text"]:not([readonly]), #app textarea');
  panel.hidden = !visible;
  toggle.hidden = !letters || visible || !anyField;
  document.body.classList.toggle("kbd-open", visible);
  requestAnimationFrame(place);
}

function place(): void {
  const vv = window.visualViewport;
  const bottom = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  panel.style.bottom = `${bottom}px`;
  toggle.style.bottom = `${bottom + 12}px`;
  const height = panel.hidden ? 0 : panel.offsetHeight + bottom;
  document.body.style.setProperty("--kbd-element", `${height}px`);
}

export function initKeyboard(): void {
  document.body.append(panel, toggle);
  toggle.addEventListener("pointerdown", (e) => e.preventDefault());
  toggle.addEventListener("mousedown", (e) => e.preventDefault());
  toggle.addEventListener("click", show);

  document.addEventListener("focusin", (e) => {
    if (isField(e.target)) {
      target = e.target;
    }
    update();
    if (!panel.hidden && target) {
      setTimeout(() => target?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
    }
  });
  document.addEventListener("focusout", () => setTimeout(update, 0));
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  }).observe(document.getElementById("app")!, { childList: true, subtree: true });
  window.visualViewport?.addEventListener("resize", place);
  window.visualViewport?.addEventListener("scroll", place);
  coarse.addEventListener("change", () => {
    document.querySelectorAll<Field>("[data-kbd]").forEach(applyInputMode);
    build();
    update();
  });
}
