"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { expoPasskeyClient } from "expo-passkey/web";

/**
 * The auth handler is mounted in this same Next app at /api/auth, so the
 * browser's own origin is always the right base. Deriving it at runtime
 * keeps sign-in working when the dev server lands on a port other than the
 * one NEXT_PUBLIC_APP_URL was built with (port 3000 taken → `next dev`
 * silently falls back to 3001). A baked-in host sends the request
 * cross-origin instead, where it dies in preflight as "Failed to fetch".
 */
const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const rawClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient(), expoPasskeyClient()],
});

/**
 * Better Auth's chained-plugin inference can narrow core methods past
 * the point where property access remains viable. The runtime is
 * unaffected — we widen with a narrow shape covering only what this
 * app touches.
 */
interface SessionResult {
  data:
    | { user: { id: string; email: string; name?: string | null } }
    | null;
  error: { message?: string; code?: string } | null;
  isPending: boolean;
}

interface AuthResult<T = unknown> {
  data: T | null;
  error: { message?: string; code?: string } | null;
}

type WidenedClient = Omit<
  typeof rawClient,
  "useSession" | "getSession" | "signIn" | "signOut" | "$fetch" | "$store"
> & {
  /**
   * Better Auth revalidates `useSession` when a response comes back from
   * one of its own session-mutating paths, or from a path a plugin
   * registers via `atomListeners`. expo-passkey's client plugin registers
   * none, and `/expo-passkey/authenticate` is not on the built-in list —
   * so a passkey sign-in leaves the store holding whatever it had before
   * the ceremony. Notifying `$sessionSignal` forces the refetch.
   */
  $store: { notify: (signal: "$sessionSignal") => void };
  useSession: () => SessionResult;
  getSession: () => Promise<SessionResult>;
  signIn: {
    emailOtp: (input: {
      email: string;
      otp: string;
    }) => Promise<AuthResult>;
  };
  signOut: () => Promise<unknown>;
  emailOtp: {
    sendVerificationOtp: (input: {
      email: string;
      type: "sign-in" | "email-verification" | "forget-password";
    }) => Promise<AuthResult>;
  };
  $fetch: <T = unknown>(
    path: string,
    init: {
      method?: "GET" | "POST";
      body?: unknown;
      throw?: boolean;
      headers?: Record<string, string>;
    },
  ) => Promise<{
    data: T | null;
    error: { code?: string; message?: string } | null;
  }>;
};

export const authClient = rawClient as unknown as WidenedClient;

export const {
  signIn,
  signOut,
  useSession,
  getSession,
  emailOtp,
  $fetch,
  $store,
} = authClient;

/**
 * Pull a fresh /get-session and push it into the `useSession` store.
 *
 * Call after any sign-in that Better Auth does not recognise as
 * session-mutating (i.e. the passkey ceremony). Returns whether a
 * session actually came back, so callers can tell "signed in" apart
 * from "signed in but no cookie landed".
 */
export async function refreshSession(): Promise<boolean> {
  $store.notify("$sessionSignal");
  const fresh = await getSession();
  return Boolean(fresh.data);
}

// expo-passkey client actions are added by expoPasskeyClient(). They
// are reachable at runtime; better-auth's plugin-chain typing
// occasionally hides them from TS, so we widen here.
type PasskeyClientShape = typeof authClient & {
  registerPasskey: (input: {
    userId: string;
    userName: string;
    displayName: string;
    rpId: string;
    rpName: string;
    metadata?: Record<string, unknown>;
  }) => Promise<AuthResult>;
  authenticateWithPasskey: (input?: {
    rpId?: string;
    userVerification?: "required" | "preferred" | "discouraged";
  }) => Promise<AuthResult>;
  isPasskeySupported?: () => Promise<boolean>;
};

const widened = authClient as unknown as PasskeyClientShape;
export const registerPasskey = widened.registerPasskey;
export const authenticateWithPasskey = widened.authenticateWithPasskey;
