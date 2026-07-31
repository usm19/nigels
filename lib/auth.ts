// Authentication: scrypt password hashing (node:crypto, no dependencies),
// database-backed sessions, httpOnly cookie. All functions are server-only.

import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const SESSION_COOKIE = "moiety_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ id, userId, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  organisationId: string;
  organisationName: string;
}

/** Returns the logged-in user, or null. */
export async function currentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({
      sessionExpires: schema.sessions.expiresAt,
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      organisationId: schema.users.organisationId,
      organisationName: schema.organisations.name,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .innerJoin(
      schema.organisations,
      eq(schema.users.organisationId, schema.organisations.id),
    )
    .where(eq(schema.sessions.id, token))
    .limit(1);
  const row = rows[0];
  if (!row || row.sessionExpires < new Date()) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organisationId: row.organisationId,
    organisationName: row.organisationName,
  };
}

/** Guard for authed pages/actions: returns the user or redirects to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
  }
  store.delete(SESSION_COOKIE);
}
