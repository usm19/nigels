"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser-side Supabase client using the PUBLISHABLE (anon) key. This key is
// safe to ship to the browser — it grants nothing on its own; row-level
// security decides what each signed-in user may read/write. A singleton so the
// auth session and the magic-link (PKCE) verifier are shared across the app.
let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
