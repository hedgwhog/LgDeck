// Uses the SQLite built into Node.js (node:sqlite), so there is no
// native package to install or compile on the server.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.LGDECK_DB ?? "data/lgdeck.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

/** Runs `work` as one transaction: all of it is saved, or none of it. */
export function transaction(work: () => void): void {
  db.exec("BEGIN");
  try {
    work();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Each entry upgrades the database by one version.
// To change the schema later, append a new entry; never edit old ones.
const migrations: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE languages (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE letters (
    id            INTEGER PRIMARY KEY,
    language_id   INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    lower         TEXT NOT NULL,
    upper         TEXT NOT NULL,
    pronunciation TEXT NOT NULL DEFAULT '',
    position      INTEGER NOT NULL
  );

  CREATE TABLE decks (
    id          INTEGER PRIMARY KEY,
    language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- due_* is a date (YYYY-MM-DD); '' means "due now" (never studied).
  CREATE TABLE cards (
    id          INTEGER PRIMARY KEY,
    deck_id     INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    word        TEXT NOT NULL,
    translation TEXT NOT NULL,
    box_forward INTEGER NOT NULL DEFAULT 1,
    due_forward TEXT NOT NULL DEFAULT '',
    box_reverse INTEGER NOT NULL DEFAULT 1,
    due_reverse TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_sessions_user ON sessions(user_id);
  CREATE INDEX idx_languages_user ON languages(user_id);
  CREATE INDEX idx_letters_language ON letters(language_id, position);
  CREATE INDEX idx_decks_language ON decks(language_id);
  CREATE INDEX idx_cards_deck ON cards(deck_id);
  `,
];

function migrate(): void {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = current; version < migrations.length; version++) {
    transaction(() => {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

migrate();

/** Today's date as YYYY-MM-DD in the server's time zone. */
export function today(): string {
  return dateString(new Date());
}

export function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateString(d);
}

function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
