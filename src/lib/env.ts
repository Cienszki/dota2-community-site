/**
 * Fails fast with a clear, actionable error instead of a cryptic downstream
 * crash (e.g. "supabaseUrl is required" or a raw crypto TypeError) when a
 * required environment variable wasn't set.
 *
 * Takes the *value* rather than looking it up by name, so this stays safe
 * to wrap around `NEXT_PUBLIC_*` vars: Next.js only statically inlines
 * `process.env.NEXT_PUBLIC_X` when it appears as a literal member-access
 * expression in the source, which a dynamic `process.env[name]` lookup
 * inside this helper would defeat for client bundles.
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env.local (development) or your hosting provider's environment configuration (production).`
    );
  }
  return value;
}
