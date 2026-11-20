type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class") {
      el.className = String(value);
    } else if (key === "value" || key === "checked" || key === "disabled" || key === "hidden") {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else if (key === "style" && typeof value === "object") {
      Object.assign(el.style, value);
    } else {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function btn(label: string, onClick: (e: MouseEvent) => void, attrs: Attrs = {}): HTMLButtonElement {
  return element("button", { type: "button", ...attrs, class: `btn ${attrs.class ?? ""}`.trim(), onclick: onClick }, label);
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function animate(el: HTMLElement, className: string, fallbackMs = 400): Promise<void> {
  if (reducedMotion.matches) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.remove(className);
      resolve();
    };
    el.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, fallbackMs);
    el.classList.remove(className);
    void el.offsetWidth; // restart the animation
    el.classList.add(className);
  });
}

let toastTimer: number | undefined;

export function toast(message: string): void {
  let el = document.querySelector<HTMLElement>(".toast");
  if (!el) {
    el = element("div", { class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove("show"), 3500);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
