import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { expoPasskeyClient } from "expo-passkey/native";
import * as SecureStore from "expo-secure-store";

import { env } from "./env";

const rawClient = createAuthClient({
  baseURL: env.apiUrl,
  plugins: [
    expoClient({
      // Must match `scheme` in app.config.ts — that is what the OS
      // registers. A mismatch sends auth redirects nowhere.
      scheme: "tronpasskeydemo",
      // Namespaces the session in expo-secure-store. Changing it orphans
      // any previously stored session, which signs the device out once.
      storagePrefix: "tron_passkey_demo",
      storage: SecureStore,
    }),
    emailOTPClient(),
    // Passing rpId here has no effect: ExpoPasskeyClient's constructor
    // copies only storagePrefix and timeout, so client.getOptions().rpId is
    // always undefined on native. rpId and rpName are supplied per call
    // instead — see registerPasskey below.
    expoPasskeyClient(),
  ],
});

// Better Auth's chained-plugin inference can narrow core methods past
// the point where property access still works. The runtime is fine;
// we widen the surface this demo touches.
interface SessionData {
  user: { id: string; email: string; name?: string | null };
}
interface SessionResult {
  data: SessionData | null;
  error: { message?: string; code?: string } | null;
  /**
   * True while the store is refetching. `data` is null during that window as
   * well as when signed out, so anything gating on the session has to check
   * this first — see (tabs)/_layout.tsx.
   */
  isPending: boolean;
}
interface AuthResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

type WidenedClient = Omit<
  typeof rawClient,
  "useSession" | "getSession" | "signIn" | "signOut" | "$fetch"
> & {
  useSession: () => SessionResult;
  getSession: () => Promise<SessionResult>;
  signIn: {
    emailOtp: (input: { email: string; otp: string }) => Promise<AuthResult>;
  };
  signOut: () => Promise<AuthResult>;
  emailOtp: {
    sendVerificationOtp: (input: {
      email: string;
      type: "sign-in" | "email-verification" | "forget-password";
    }) => Promise<AuthResult>;
  };
  $fetch: (typeof rawClient)["$fetch"];
};

export const authClient = rawClient as unknown as WidenedClient;

export const { useSession, signIn, signOut, getSession, emailOtp } = authClient;

/**
 * Pull a fresh /get-session and push it into the `useSession` store.
 *
 * Better Auth only revalidates the session store for paths on its built-in
 * matcher list, or ones a plugin registers via `atomListeners`. Neither
 * `/sign-in/email-otp` nor `/expo-passkey/authenticate` qualifies — the
 * emailOTP client plugin registers no listeners, and expo-passkey's registers
 * none either. So a successful sign-in leaves the store holding its previous
 * value, and `(tabs)/_layout.tsx` redirects straight back to the auth screen
 * off that stale read. Reloading the app masked it by clearing the store.
 *
 * Returns whether a session actually came back, so callers can tell
 * "signed in" apart from "signed in but nothing was stored".
 */
export async function refreshSession(): Promise<boolean> {
  const store = authClient as unknown as {
    $store?: { notify: (signal: string) => void };
  };
  store.$store?.notify("$sessionSignal");
  const fresh = await getSession();
  return Boolean(fresh.data);
}

// expoPasskeyClient adds these — pulled off the underlying client.
export const registerPasskey = (
  rawClient as unknown as {
    registerPasskey: (opts: {
      userId: string;
      userName: string;
      displayName: string;
      /**
       * Both are mandatory on native and neither has a default. The client
       * option `expoPasskeyClient({ rpId })` looks like it should cover rpId,
       * but ExpoPasskeyClient's constructor copies only storagePrefix and
       * timeout into its options — rpId is accepted, typed, and dropped. So
       * it has to come in per call.
       */
      rpId: string;
      rpName: string;
    }) => Promise<AuthResult>;
  }
).registerPasskey;

export const authenticateWithPasskey = (
  rawClient as unknown as {
    /**
     * rpId must be passed here as well. The native path falls back to an
     * empty string rather than erroring, so omitting it produces a ceremony
     * with rpId "" that silently matches nothing.
     */
    authenticateWithPasskey: (opts: { rpId: string }) => Promise<AuthResult>;
  }
).authenticateWithPasskey;
