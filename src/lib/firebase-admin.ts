import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { requireEnv } from './env';

// The bot integration's *entire* seam is Firestore (see website-integration.md
// §1). This is the single Admin-SDK connection the website owns; the bot's
// worker and Discord gateway hold their own. `firebase-admin` is a peer of the
// vendored `@dota2inhouse/core` on purpose — one app, one SDK instance, so we
// never initialise two against the same project.
//
// Server-only by construction: the game document holds `lobbyPassword` and the
// full unpublished-game record, so browsers must never touch Firestore (§2.2).
// Reads happen here, in ordinary TypeScript, behind the `published` check.

const APP_NAME = 'inhouse';

interface ServiceAccountJson {
  project_id: string;
  client_email: string;
  private_key: string;
}

function decodeServiceAccount(): ServiceAccountJson {
  const b64 = requireEnv(
    'FIREBASE_SERVICE_ACCOUNT_BASE64',
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  );
  let json: string;
  try {
    json = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64.');
  }
  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(json) as ServiceAccountJson;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 does not decode to valid JSON.');
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is missing project_id/client_email/private_key.');
  }
  return parsed;
}

let cached: Firestore | null = null;

/**
 * The shared Firestore handle. Reused across requests and across Next's dev
 * hot-reloads (guarded via `getApps()`), so we never leak a second SDK app.
 */
export function getDb(): Firestore {
  if (cached) return cached;

  const existing = getApps().find((a) => a.name === APP_NAME);
  const app: App =
    existing ??
    (() => {
      const sa = decodeServiceAccount();
      return initializeApp(
        {
          credential: cert({
            projectId: sa.project_id,
            clientEmail: sa.client_email,
            // The base64'd JSON preserves real newlines through JSON.parse, so
            // no `\n` unescaping is needed here.
            privateKey: sa.private_key,
          }),
        },
        APP_NAME,
      );
    })();

  cached = getFirestore(app);
  return cached;
}

/** True when the service account is configured — lets pages degrade gracefully. */
export function isInhouseConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
}
