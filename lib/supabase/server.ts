import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Request-scoped Supabase client that reads the signed-in user's session from
// cookies. Used by the per-user API routes (saved searches, applied jobs) so
// that row-level security applies — a user can only ever touch their own rows.
// (The shared job pool + refresh keep using the service-role client.)
export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a context with read-only cookies — the middleware
            // refreshes the session instead, so this is safe to ignore.
          }
        },
      },
    }
  );
}

/** The signed-in user for this request, or null. */
export async function getCurrentUser() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
