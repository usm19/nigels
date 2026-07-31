"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

const signupSchema = z.object({
  organisation: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
});

export async function signup(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error:
        "Check the form: company and your name are required, email must be valid, password at least 10 characters.",
    };
  }
  const { organisation, name, email, password } = parsed.data;
  const db = await getDb();

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return { error: "An account with that email already exists — log in instead." };
  }

  const [org] = await db
    .insert(schema.organisations)
    .values({ name: organisation })
    .returning({ id: schema.organisations.id });
  const [user] = await db
    .insert(schema.users)
    .values({
      organisationId: org.id,
      email,
      name,
      passwordHash: hashPassword(password),
    })
    .returning({ id: schema.users.id });

  await createSession(user.id);
  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };

  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, parsed.data.email))
    .limit(1);
  const user = rows[0];
  // Always verify against something to keep timing uniform.
  const ok = user
    ? verifyPassword(parsed.data.password, user.passwordHash)
    : (verifyPassword(parsed.data.password, "00:00"), false);
  if (!ok) return { error: "Wrong email or password." };

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
