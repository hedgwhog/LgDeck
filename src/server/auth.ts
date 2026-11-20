import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db.ts";
import type { User } from "../shared/types.ts";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "lgdeck_session";
export const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expires,
  );
  // Clean up expired sessions now and then.
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  return token;
}

export function userForSession(token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT users.id, users.username FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > ?`,
    )
    .get(token, Date.now()) as User | undefined;
  return row ?? null;
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// A small guard against password guessing: after too many failed
// logins for one username, further attempts are refused for a while.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

export function isLockedOut(username: string): boolean {
  const entry = failures.get(username.toLowerCase());
  if (!entry) return false;
  if (Date.now() - entry.since > WINDOW_MS) {
    failures.delete(username.toLowerCase());
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordFailure(username: string): void {
  const name = username.toLowerCase();
  const entry = failures.get(name);
  if (!entry || Date.now() - entry.since > WINDOW_MS) {
    failures.set(name, { count: 1, since: Date.now() });
  } else {
    entry.count++;
  }
}

export function clearFailures(username: string): void {
  failures.delete(username.toLowerCase());
}
