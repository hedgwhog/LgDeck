import type {
  Deck,
  DirectionChoice,
  Language,
  LanguageSummary,
  StudyItem,
  StudyMode,
  User,
  Direction,
} from "../shared/types.ts";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized = (): void => {};
export function whenLoggedOut(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (method !== "GET") {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(data ?? {});
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new HttpError(0, "Can't reach the server.");
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && path !== "/login" && path !== "/me") onUnauthorized();
    throw new HttpError(res.status, json.error ?? "Something went wrong.");
  }
  return json as T;
}

type Id = { id: number };

export const api = {
  me: () => request<User>("GET", "/me"),
  login: (username: string, password: string) => request<User>("POST", "/login", { username, password }),
  signup: (username: string, password: string) => request<User>("POST", "/signup", { username, password }),
  logout: () => request<unknown>("POST", "/logout"),

  languages: () => request<LanguageSummary[]>("GET", "/languages"),
  language: (id: number) => request<Language>("GET", `/languages/${id}`),
  createLanguage: (name: string) => request<Id>("POST", "/languages", { name }),
  updateLanguage: (id: number, data: { name?: string; notes?: string }) =>
    request<unknown>("PATCH", `/languages/${id}`, data),
  deleteLanguage: (id: number) => request<unknown>("DELETE", `/languages/${id}`),

  addLetter: (languageId: number, data: { lower: string; upper: string; pronunciation: string }) =>
    request<Id>("POST", `/languages/${languageId}/letters`, data),
  updateLetter: (id: number, data: { lower: string; upper: string; pronunciation: string }) =>
    request<unknown>("PATCH", `/letters/${id}`, data),
  deleteLetter: (id: number) => request<unknown>("DELETE", `/letters/${id}`),
  orderLetters: (languageId: number, ids: number[]) =>
    request<unknown>("POST", `/languages/${languageId}/letters/order`, { ids }),

  createDeck: (languageId: number, name: string) => request<Id>("POST", `/languages/${languageId}/decks`, { name }),
  deck: (id: number) => request<Deck>("GET", `/decks/${id}`),
  renameDeck: (id: number, name: string) => request<unknown>("PATCH", `/decks/${id}`, { name }),
  deleteDeck: (id: number) => request<unknown>("DELETE", `/decks/${id}`),

  addCard: (deckId: number, word: string, translation: string) =>
    request<Id>("POST", `/decks/${deckId}/cards`, { word, translation }),
  updateCard: (id: number, word: string, translation: string) =>
    request<unknown>("PATCH", `/cards/${id}`, { word, translation }),
  deleteCard: (id: number) => request<unknown>("DELETE", `/cards/${id}`),

  study: (deckId: number, mode: StudyMode, direction: DirectionChoice) =>
    request<StudyItem[]>("GET", `/decks/${deckId}/study?mode=${mode}&direction=${direction}`),
  review: (cardId: number, direction: Direction, correct: boolean) =>
    request<{ box: number; due: string }>("POST", `/cards/${cardId}/review`, { direction, correct }),
};
