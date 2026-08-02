import { requireEnv } from './env';

// Single source of truth for who's allowed into the admin panel — was
// previously a hardcoded array copy-pasted across proxy.ts, admin/layout.tsx,
// and admin/actions.ts, which risked one copy being updated and the others
// forgotten (split-brain authorization). Adding/removing an admin now only
// requires updating the ADMIN_EMAILS env var, no code change or redeploy of
// application logic.
export const ALLOWED_ADMIN_EMAILS = requireEnv('ADMIN_EMAILS', process.env.ADMIN_EMAILS)
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);
