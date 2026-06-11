import "server-only";

// Secrets only ever live here, on the server. They are read lazily (at
// request time, not build time) so `next build` works without secrets.
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export const env = {
  get adzunaAppId(): string {
    return required("ADZUNA_APP_ID");
  },
  get adzunaAppKey(): string {
    return required("ADZUNA_APP_KEY");
  },
  get reedApiKey(): string {
    return required("REED_API_KEY");
  },
  get supabaseUrl(): string {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
};
