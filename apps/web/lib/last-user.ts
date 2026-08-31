"use client";

/**
 * Web stand-in for the native device cache.
 *
 * An *authentication* liveness session has to name the user it belongs
 * to: /expo-passkey/liveness/session resolves the id from the request
 * session, falling back to `userId` in the body, and rejects the call
 * when it finds neither. At the login screen neither is available by
 * default — there is no session yet, and a discoverable-credential
 * ceremony deliberately never asks for an identifier.
 *
 * Native clients answer this from on-device storage. On web we do the
 * same thing with localStorage: remember the id while we hold a
 * session, then replay it as a hint on the next passkey sign-in.
 *
 * This is a hint, not a credential. The WebAuthn assertion is what
 * actually proves who the user is — the id only tells the liveness
 * provider which session to open, and the server never trusts it in
 * place of the ceremony.
 */

const KEY = "epk:last-user-id";

/** Storage throws in private-mode Safari and when cookies are blocked. */
export function rememberUserId(userId: string): void {
  try {
    window.localStorage.setItem(KEY, userId);
  } catch {
    /* non-fatal — passkey sign-in falls back to the email path */
  }
}

export function getRememberedUserId(): string | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function forgetUserId(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
