import type { DirectionChoice, StudyMode } from "../shared/types.ts";

export type Route =
  | { name: "table" }
  | { name: "language"; id: number }
  | { name: "alphabet"; id: number }
  | { name: "notes"; id: number }
  | { name: "settings"; id: number }
  | { name: "deck"; id: number }
  | { name: "study"; id: number; mode: StudyMode; direction: DirectionChoice };

export function currentRoute(): Route {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const id = Number(parts[1]);
  const params = new URLSearchParams(query);

  if (parts[0] === "lang" && id > 0) {
    if (parts[2] === "alphabet") return { name: "alphabet", id };
    if (parts[2] === "notes") return { name: "notes", id };
    if (parts[2] === "settings") return { name: "settings", id };
    return { name: "language", id };
  }
  if (parts[0] === "deck" && id > 0) {
    if (parts[2] === "study") {
      const mode = params.get("mode") === "smart" ? "smart" : "simple";
      const d = params.get("direction");
      const direction = d === "reverse" || d === "mixed" ? d : "forward";
      return { name: "study", id, mode, direction };
    }
    return { name: "deck", id };
  }
  return { name: "table" };
}

export function go(path: string): void {
  if (location.hash === `#${path}`) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = path;
  }
}
