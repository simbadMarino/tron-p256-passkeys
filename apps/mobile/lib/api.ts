import { authClient } from "./auth-client";
import { env } from "./env";

/**
 * The debug routes are plain Next handlers, not `/api/auth/*`, and they
 * authenticate with `auth.api.getSession({ headers })`.
 *
 * A browser attaches the session cookie automatically, which is why the web
 * dashboard can call these with a bare `fetch`. React Native has no cookie
 * jar: `@better-auth/expo` keeps the session in expo-secure-store and only
 * replays it on requests made through the auth client. So a plain `fetch`
 * here arrives with no credentials and gets a 401 — regardless of whether
 * sign-in or the passkey ceremony worked.
 *
 * `getCookie()` is the documented escape hatch for exactly this case.
 */
function sessionCookie(): string {
  // The widened client type hides plugin-added methods; the runtime has it.
  const withCookie = authClient as unknown as { getCookie?: () => string };
  return withCookie.getCookie?.() ?? "";
}

async function authedFetch<T>(path: string): Promise<T> {
  const cookie = sessionCookie();
  const response = await fetch(`${env.apiUrl}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });

  if (!response.ok) {
    // Include the body: these routes answer 401 with
    // `{ error: "Not signed in" }`, which is far more useful than the code.
    const body = await response.text().catch(() => "");
    throw new Error(
      `${path}: ${response.status}${body ? ` — ${body.slice(0, 200)}` : ""}` +
        (response.status === 401 && !cookie
          ? " (no session cookie stored — sign in first)"
          : ""),
    );
  }

  return response.json() as Promise<T>;
}

/** Mirrors the `passkey` Prisma model, with `metadata` parsed server-side. */
export interface PasskeyDebugRow {
  id: string;
  userId: string;
  credentialId: string;
  platform: string;
  status: string;
  aaguid: string | null;
  counter: number;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}


/**
 * The route wraps its rows in an object rather than returning a bare array
 * (`{ user, passkeys }`). Unwrapped here so callers get the list they expect.
 */
export async function fetchPasskeys(): Promise<PasskeyDebugRow[]> {
  const body = await authedFetch<{ passkeys?: PasskeyDebugRow[] }>(
    "/api/debug/passkeys",
  );
  return body.passkeys ?? [];
}

/**
 * One registered credential with its public key decoded out of the stored
 * COSE_Key by the server.
 *
 * `x`/`y` are what a smart wallet stores as its signer. They cannot be
 * recovered from an assertion — WebAuthn only returns the public key at
 * registration — so they have to come from the server rather than from the
 * signing ceremony. `error` is set (and x/y null) for a credential that is
 * not ES256, e.g. an RSA key, rather than the row being dropped silently.
 */
export interface P256KeyRow {
  credentialId: string;
  platform: string;
  createdAt: string;
  x: string | null;
  y: string | null;
  aaguid: string | null;
  counter: number;
  error: string | null;
}

export async function fetchP256Keys(): Promise<P256KeyRow[]> {
  const body = await authedFetch<{ keys?: P256KeyRow[] }>("/api/p256/keys");
  return body.keys ?? [];
}
