import { api } from "../api.ts";
import { animate, btn, element as element } from "../dom.ts";
import type { User } from "../../shared/types.ts";

export const LOGO = String.raw` _          ____            _
| |    __ _|  _ \  ___  ___| | __
| |   / _' | | | |/ _ \/ __| |/ /
| |__| (_| | |_| |  __/ (__|   <
|_____\__, |____/ \___|\___|_|\_\
      |___/`;

export function renderAuth(root: HTMLElement, onDone: (user: User) => void): void {
  let mode: "login" | "signup" = "login";

  const username = element("input", {
    type: "text",
    id: "username",
    autocomplete: "username",
    autocapitalize: "none",
    spellcheck: "false",
    required: true,
  });
  const password = element("input", { type: "password", id: "password", required: true });
  const issue = element("p", { class: "error", role: "alert" });
  const title = element("h1", { class: "card-title" });
  const submit = element("button", { type: "submit", class: "btn primary" });
  const hint = element("p", { class: "muted small" });
  const switchText = element("span");
  const switcher = btn("", () => setMode(mode === "login" ? "signup" : "login"), { class: "link" });

  const card = element(
    "form",
    { class: "card auth-card", novalidate: true },
    element("span", { class: "suit tl", "aria-hidden": "true" }, "?"),
    element("span", { class: "suit br", "aria-hidden": "true" }, "?"),
    title,
    element("label", { for: "username" }, "Username"),
    username,
    element("label", { for: "password" }, "Password"),
    password,
    hint,
    issue,
    submit,
    element("p", { class: "switch" }, switchText, " ", switcher),
  );

  function setMode(next: typeof mode): void {
    mode = next;
    title.textContent = mode === "login" ? "Log in" : "Sign up";
    submit.textContent = mode === "login" ? "log in" : "create account";
    password.autocomplete = mode === "login" ? "current-password" : "new-password";
    hint.textContent = mode === "signup" ? "At least 8 characters. There's no password reset, so keep it safe." : "";
    switchText.textContent = mode === "login" ? "No account yet?" : "Have an account?";
    switcher.textContent = mode === "login" ? "sign up" : "log in";
    issue.textContent = "";
    void animate(card, "flip", 400);
  }

  card.addEventListener("submit", async (e) => {
    e.preventDefault();
    issue.textContent = "";
    submit.disabled = true;
    try {
      const user =
        mode === "login"
          ? await api.login(username.value.trim(), password.value)
          : await api.signup(username.value.trim(), password.value);
      onDone(user);
    } catch (error) {
      issue.textContent = (error as Error).message;
      void animate(card, "shake");
    } finally {
      submit.disabled = false;
    }
  });

  root.replaceChildren(
    element(
      "main",
      { class: "table auth" },
      element("pre", { class: "logo", "aria-label": "LgDeck" }, LOGO),
      element("p", { class: "tagline" }, "Flashcards for the languages you're learning."),
      card,
    ),
  );
  setMode("login");
  username.focus();
}
