import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db, today, daysFromToday, transaction } from "./db.ts";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  clearFailures,
  createSession,
  deleteSession,
  hashPassword,
  isLockedOut,
  recordFailure,
  userForSession,
  verifyPassword,
} from "./auth.ts";
import { nextBox, intervalDays } from "../shared/leitner.ts";
import type {
  Card,
  Deck,
  DeckSummary,
  Direction,
  Language,
  LanguageSummary,
  Letter,
  StudyItem,
  User,
} from "../shared/types.ts";

type Env = { Variables: { user: User } };
export const api = new Hono<Env>();

// ── helpers ────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 429,
    message: string,
  ) {
    super(message);
  }
}

api.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong on the server." }, 500);
});

async function body(c: Context): Promise<Record<string, unknown>> {
  const data = await c.req.json().catch(() => null);
  if (!data || typeof data !== "object") throw new ApiError(400, "The request was not valid JSON.");
  return data as Record<string, unknown>;
}

/** Reads a text field; `required` fields may not be empty. */
function text(data: Record<string, unknown>, field: string, label: string, max: number, required = true): string {
  const value = data[field];
  if (value === undefined && !required) return "";
  if (typeof value !== "string") throw new ApiError(400, `${label} is missing.`);
  const trimmed = value.normalize("NFC").trim();
  if (required && trimmed.length === 0) throw new ApiError(400, `${label} can't be empty.`);
  if (trimmed.length > max) throw new ApiError(400, `${label} can be at most ${max} characters.`);
  return trimmed;
}

function id(c: Context, name = "id"): number {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, "Not found.");
  return n;
}

function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:" || process.env.LGDECK_SECURE_COOKIE === "1",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

// Ownership checks: every lookup goes through the user who is logged in.

function ownLanguage(userId: number, languageId: number): { id: number; name: string; notes: string } {
  const row = db
    .prepare("SELECT id, name, notes FROM languages WHERE id = ? AND user_id = ?")
    .get(languageId, userId) as { id: number; name: string; notes: string } | undefined;
  if (!row) throw new ApiError(404, "That language doesn't exist.");
  return row;
}

function ownDeck(userId: number, deckId: number): { id: number; name: string; language_id: number } {
  const row = db
    .prepare(
      `SELECT decks.id, decks.name, decks.language_id FROM decks
       JOIN languages ON languages.id = decks.language_id
       WHERE decks.id = ? AND languages.user_id = ?`,
    )
    .get(deckId, userId) as { id: number; name: string; language_id: number } | undefined;
  if (!row) throw new ApiError(404, "That deck doesn't exist.");
  return row;
}

function ownLetter(userId: number, letterId: number): { id: number; language_id: number } {
  const row = db
    .prepare(
      `SELECT letters.id, letters.language_id FROM letters
       JOIN languages ON languages.id = letters.language_id
       WHERE letters.id = ? AND languages.user_id = ?`,
    )
    .get(letterId, userId) as { id: number; language_id: number } | undefined;
  if (!row) throw new ApiError(404, "That letter doesn't exist.");
  return row;
}

interface CardRow {
  id: number;
  deck_id: number;
  word: string;
  translation: string;
  box_forward: number;
  due_forward: string;
  box_reverse: number;
  due_reverse: string;
}

function ownCard(userId: number, cardId: number): CardRow {
  const row = db
    .prepare(
      `SELECT cards.* FROM cards
       JOIN decks ON decks.id = cards.deck_id
       JOIN languages ON languages.id = decks.language_id
       WHERE cards.id = ? AND languages.user_id = ?`,
    )
    .get(cardId, userId) as CardRow | undefined;
  if (!row) throw new ApiError(404, "That card doesn't exist.");
  return row;
}

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    word: row.word,
    translation: row.translation,
    boxForward: row.box_forward,
    boxReverse: row.box_reverse,
  };
}

function lettersOf(languageId: number): Letter[] {
  return db
    .prepare(
      "SELECT id, lower, upper, pronunciation, position FROM letters WHERE language_id = ? ORDER BY position, id",
    )
    .all(languageId) as unknown as Letter[];
}

// ── accounts ───────────────────────────────────────────────────────────

const USERNAME = /^[a-zA-Z0-9_.-]{3,32}$/;

api.post("/signup", async (c) => {
  const data = await body(c);
  const username = text(data, "username", "Username", 32);
  const password = typeof data.password === "string" ? data.password : "";
  if (!USERNAME.test(username)) {
    throw new ApiError(400, "Usernames are 3–32 characters: letters, numbers, dots, dashes or underscores.");
  }
  if (password.length < 8) throw new ApiError(400, "Passwords need at least 8 characters.");
  if (password.length > 200) throw new ApiError(400, "Passwords can be at most 200 characters.");

  const taken = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
  if (taken) throw new ApiError(400, "That username is taken. Pick another one.");

  const hash = await hashPassword(password);
  const result = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hash);
  const userId = Number(result.lastInsertRowid);
  setSessionCookie(c, createSession(userId));
  return c.json({ id: userId, username } satisfies User);
});

api.post("/login", async (c) => {
  const data = await body(c);
  const username = typeof data.username === "string" ? data.username.trim() : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (isLockedOut(username)) {
    throw new ApiError(429, "Too many wrong passwords. Wait 15 minutes and try again.");
  }
  const row = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username) as { id: number; username: string; password_hash: string } | undefined;
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    recordFailure(username);
    throw new ApiError(401, "Wrong username or password.");
  }
  clearFailures(username);
  setSessionCookie(c, createSession(row.id));
  return c.json({ id: row.id, username: row.username } satisfies User);
});

api.post("/logout", (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) deleteSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// Everything below needs a logged-in user.
api.use("*", async (c, next) => {
  const user = userForSession(getCookie(c, SESSION_COOKIE));
  if (!user) throw new ApiError(401, "Log in to continue.");
  c.set("user", user);
  await next();
});

api.get("/me", (c) => c.json(c.get("user")));

// ── languages ──────────────────────────────────────────────────────────

api.get("/languages", (c) => {
  const rows = db
    .prepare(
      `SELECT l.id, l.name,
         (SELECT COUNT(*) FROM letters WHERE language_id = l.id) AS letterCount,
         (SELECT COUNT(*) FROM decks WHERE language_id = l.id) AS deckCount
       FROM languages l WHERE l.user_id = ? ORDER BY l.created_at, l.id`,
    )
    .all(c.get("user").id) as unknown as LanguageSummary[];
  return c.json(rows);
});

api.post("/languages", async (c) => {
  const name = text(await body(c), "name", "Language name", 40);
  const result = db
    .prepare("INSERT INTO languages (user_id, name) VALUES (?, ?)")
    .run(c.get("user").id, name);
  return c.json({ id: Number(result.lastInsertRowid) });
});

api.get("/languages/:id", (c) => {
  const language = ownLanguage(c.get("user").id, id(c));
  const now = today();
  const decks = db
    .prepare(
      `SELECT d.id, d.name,
         (SELECT COUNT(*) FROM cards WHERE deck_id = d.id) AS cardCount,
         (SELECT COUNT(*) FROM cards WHERE deck_id = d.id AND (due_forward <= ? OR due_reverse <= ?)) AS dueCount
       FROM decks d WHERE d.language_id = ? ORDER BY d.created_at, d.id`,
    )
    .all(now, now, language.id) as unknown as DeckSummary[];
  return c.json({ ...language, letters: lettersOf(language.id), decks } satisfies Language);
});

api.patch("/languages/:id", async (c) => {
  const language = ownLanguage(c.get("user").id, id(c));
  const data = await body(c);
  if (data.name !== undefined) {
    db.prepare("UPDATE languages SET name = ? WHERE id = ?").run(
      text(data, "name", "Language name", 40),
      language.id,
    );
  }
  if (data.notes !== undefined) {
    if (typeof data.notes !== "string") throw new ApiError(400, "Notes must be text.");
    if (data.notes.length > 100_000) throw new ApiError(400, "Notes can be at most 100,000 characters.");
    db.prepare("UPDATE languages SET notes = ? WHERE id = ?").run(data.notes, language.id);
  }
  return c.json({ ok: true });
});

api.delete("/languages/:id", (c) => {
  const language = ownLanguage(c.get("user").id, id(c));
  db.prepare("DELETE FROM languages WHERE id = ?").run(language.id);
  return c.json({ ok: true });
});

// ── alphabet ───────────────────────────────────────────────────────────

function letterFields(data: Record<string, unknown>): { lower: string; upper: string; pronunciation: string } {
  const lower = text(data, "lower", "Letter", 8);
  const upper = text(data, "upper", "Capital letter", 8, false) || lower.toLocaleUpperCase();
  const pronunciation = text(data, "pronunciation", "Pronunciation", 200, false);
  return { lower, upper, pronunciation };
}

api.post("/languages/:id/letters", async (c) => {
  const language = ownLanguage(c.get("user").id, id(c));
  const f = letterFields(await body(c));
  const { next } = db
    .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM letters WHERE language_id = ?")
    .get(language.id) as { next: number };
  const result = db
    .prepare("INSERT INTO letters (language_id, lower, upper, pronunciation, position) VALUES (?, ?, ?, ?, ?)")
    .run(language.id, f.lower, f.upper, f.pronunciation, next);
  return c.json({ id: Number(result.lastInsertRowid) });
});

api.patch("/letters/:id", async (c) => {
  const letter = ownLetter(c.get("user").id, id(c));
  const f = letterFields(await body(c));
  db.prepare("UPDATE letters SET lower = ?, upper = ?, pronunciation = ? WHERE id = ?").run(
    f.lower,
    f.upper,
    f.pronunciation,
    letter.id,
  );
  return c.json({ ok: true });
});

api.delete("/letters/:id", (c) => {
  const letter = ownLetter(c.get("user").id, id(c));
  db.prepare("DELETE FROM letters WHERE id = ?").run(letter.id);
  return c.json({ ok: true });
});

api.post("/languages/:id/letters/order", async (c) => {
  const language = ownLanguage(c.get("user").id, id(c));
  const data = await body(c);
  const ids = data.ids;
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n))) {
    throw new ApiError(400, "The new order must be a list of letter ids.");
  }
  const update = db.prepare("UPDATE letters SET position = ? WHERE id = ? AND language_id = ?");
  transaction(() => {
    (ids as number[]).forEach((letterId, index) => update.run(index, letterId, language.id));
  });
  return c.json({ ok: true });
});

// ── decks ──────────────────────────────────────────────────────────────

api.post("/languages/:id/decks", async (c) => {
  const language = ownLanguage(c.get("user").id, id(c));
  const name = text(await body(c), "name", "Deck name", 40);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM letters WHERE language_id = ?").get(language.id) as {
    n: number;
  };
  if (n === 0) throw new ApiError(400, "Add at least one letter to the alphabet before making decks.");
  const result = db.prepare("INSERT INTO decks (language_id, name) VALUES (?, ?)").run(language.id, name);
  return c.json({ id: Number(result.lastInsertRowid) });
});

api.get("/decks/:id", (c) => {
  const deck = ownDeck(c.get("user").id, id(c));
  const language = ownLanguage(c.get("user").id, deck.language_id);
  const cards = (
    db.prepare("SELECT * FROM cards WHERE deck_id = ? ORDER BY created_at, id").all(deck.id) as unknown as CardRow[]
  ).map(toCard);
  return c.json({
    id: deck.id,
    name: deck.name,
    language: { id: language.id, name: language.name, letters: lettersOf(language.id) },
    cards,
  } satisfies Deck);
});

api.patch("/decks/:id", async (c) => {
  const deck = ownDeck(c.get("user").id, id(c));
  const name = text(await body(c), "name", "Deck name", 40);
  db.prepare("UPDATE decks SET name = ? WHERE id = ?").run(name, deck.id);
  return c.json({ ok: true });
});

api.delete("/decks/:id", (c) => {
  const deck = ownDeck(c.get("user").id, id(c));
  db.prepare("DELETE FROM decks WHERE id = ?").run(deck.id);
  return c.json({ ok: true });
});

// ── cards ──────────────────────────────────────────────────────────────

function cardFields(data: Record<string, unknown>): { word: string; translation: string } {
  return {
    word: text(data, "word", "Word", 200),
    translation: text(data, "translation", "Translation", 200),
  };
}

api.post("/decks/:id/cards", async (c) => {
  const deck = ownDeck(c.get("user").id, id(c));
  const f = cardFields(await body(c));
  const result = db
    .prepare("INSERT INTO cards (deck_id, word, translation) VALUES (?, ?, ?)")
    .run(deck.id, f.word, f.translation);
  return c.json({ id: Number(result.lastInsertRowid) });
});

api.patch("/cards/:id", async (c) => {
  const card = ownCard(c.get("user").id, id(c));
  const f = cardFields(await body(c));
  db.prepare("UPDATE cards SET word = ?, translation = ? WHERE id = ?").run(f.word, f.translation, card.id);
  return c.json({ ok: true });
});

api.delete("/cards/:id", (c) => {
  const card = ownCard(c.get("user").id, id(c));
  db.prepare("DELETE FROM cards WHERE id = ?").run(card.id);
  return c.json({ ok: true });
});

// ── studying ───────────────────────────────────────────────────────────

function item(row: CardRow, direction: Direction): StudyItem {
  return direction === "forward"
    ? { cardId: row.id, direction, prompt: row.word, answer: row.translation, box: row.box_forward }
    : { cardId: row.id, direction, prompt: row.translation, answer: row.word, box: row.box_reverse };
}

api.get("/decks/:id/study", (c) => {
  const deck = ownDeck(c.get("user").id, id(c));
  const mode = c.req.query("mode") === "smart" ? "smart" : "simple";
  const choice = c.req.query("direction");
  const direction = choice === "reverse" || choice === "mixed" ? choice : "forward";
  const rows = db.prepare("SELECT * FROM cards WHERE deck_id = ?").all(deck.id) as unknown as CardRow[];
  const now = today();
  const items: StudyItem[] = [];

  for (const row of rows) {
    if (mode === "simple") {
      // Every card once; "mixed" picks a random direction per card.
      const dir: Direction =
        direction === "mixed" ? (Math.random() < 0.5 ? "forward" : "reverse") : direction;
      items.push(item(row, dir));
    } else {
      // Only what's due; each direction has its own box and due date.
      if (direction !== "reverse" && row.due_forward <= now) items.push(item(row, "forward"));
      if (direction !== "forward" && row.due_reverse <= now) items.push(item(row, "reverse"));
    }
  }

  // Shuffle (Fisher–Yates).
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return c.json(items);
});

/** Records a smart-mode answer and moves the card between Leitner boxes. */
api.post("/cards/:id/review", async (c) => {
  const card = ownCard(c.get("user").id, id(c));
  const data = await body(c);
  const direction: Direction = data.direction === "reverse" ? "reverse" : "forward";
  const correct = data.correct === true;
  const current = direction === "forward" ? card.box_forward : card.box_reverse;
  const box = nextBox(current, correct);
  const due = daysFromToday(intervalDays(box));
  if (direction === "forward") {
    db.prepare("UPDATE cards SET box_forward = ?, due_forward = ? WHERE id = ?").run(box, due, card.id);
  } else {
    db.prepare("UPDATE cards SET box_reverse = ?, due_reverse = ? WHERE id = ?").run(box, due, card.id);
  }
  return c.json({ box, due });
});
