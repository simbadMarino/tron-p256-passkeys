/**
 * Reports the preconditions `registerPasskey` checks before it invokes
 * Credential Manager.
 *
 * Three gates run first, and all of them throw or return early *before* any
 * system prompt appears — so "no prompt and no error" is ambiguous from the
 * outside. This reads each one directly so the failing gate is visible
 * instead of inferred from logcat.
 *
 * The gates, in the order expo-passkey applies them:
 *   1. ExpoPasskeyModule.isPasskeySupported()
 *   2. LocalAuthentication.hasHardwareAsync() && isEnrolledAsync()
 *   3. Android API >= 28 / iOS >= 16
 * then a network call to the auth server for a challenge.
 */

import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import ExpoPasskeyModule from "expo-passkey/native";

import { env } from "./env";

export interface Gate {
  label: string;
  value: string;
  ok: boolean;
  /** Why this blocks registration, when it does. */
  hint?: string;
}

const AUTH_TYPE_NAMES: Record<number, string> = {
  1: "fingerprint",
  2: "facial",
  3: "iris",
};

export async function collectPasskeyGates(): Promise<Gate[]> {
  const gates: Gate[] = [];

  // --- gate 1: the native module's own capability check -------------------
  let nativeSupported: boolean | null = null;
  try {
    nativeSupported = ExpoPasskeyModule.isPasskeySupported();
  } catch (e) {
    gates.push({
      label: "native module",
      value: e instanceof Error ? e.message : String(e),
      ok: false,
      hint: "expo-passkey's native module did not load — the dev build may predate it.",
    });
  }
  if (nativeSupported !== null) {
    gates.push({
      label: "isPasskeySupported()",
      value: String(nativeSupported),
      ok: nativeSupported,
      hint: nativeSupported
        ? undefined
        : "Android needs Play Services and a credential provider; a signed-in Google account is required for Google Password Manager to offer one.",
    });
  }

  // --- gate 2: biometric hardware and enrollment -------------------------
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const level = await LocalAuthentication.getEnrolledLevelAsync();

    gates.push({
      label: "hasHardwareAsync()",
      value: String(hasHardware),
      ok: hasHardware,
      hint: hasHardware ? undefined : "No biometric hardware reported.",
    });
    gates.push({
      label: "isEnrolledAsync()",
      value: String(isEnrolled),
      ok: isEnrolled,
      hint: isEnrolled
        ? undefined
        : "Nothing enrolled. On an emulator, enrolment needs `adb -e emu finger touch 1` repeatedly while Settings prompts for a touch — clicking through Settings alone does not complete it.",
    });
    gates.push({
      label: "supported types",
      value:
        types.length === 0
          ? "none"
          : types.map((t) => AUTH_TYPE_NAMES[t] ?? `type ${t}`).join(", "),
      ok: types.length > 0,
    });
    gates.push({
      label: "enrolled level",
      value: String(level),
      ok: level > 0,
      hint: level > 0 ? undefined : "0 = nothing; 1 = passcode only; 2 = biometric.",
    });
  } catch (e) {
    gates.push({
      label: "expo-local-authentication",
      value: e instanceof Error ? e.message : String(e),
      ok: false,
    });
  }

  // --- gate 3: platform version -----------------------------------------
  const apiLevel = Device.platformApiLevel ?? null;
  const versionOk =
    Platform.OS === "android"
      ? (apiLevel ?? 0) >= 28
      : parseInt(String(Platform.Version), 10) >= 16;
  gates.push({
    label: Platform.OS === "android" ? "API level" : "iOS version",
    value:
      Platform.OS === "android"
        ? String(apiLevel ?? "unknown")
        : String(Platform.Version),
    ok: versionOk,
    hint: versionOk
      ? undefined
      : Platform.OS === "android"
        ? "Passkeys need API 28+."
        : "Passkeys need iOS 16+.",
  });

  // --- then: can the app even reach the auth server? ---------------------
  // A hang here looks identical to a blocked prompt from the UI.
  try {
    const started = Date.now();
    const r = await fetch(`${env.apiUrl}/api/auth/ok`, { method: "GET" });
    gates.push({
      label: "auth server reachable",
      value: `${r.status} in ${Date.now() - started}ms`,
      ok: r.status < 500,
    });
  } catch (e) {
    gates.push({
      label: "auth server reachable",
      value: e instanceof Error ? e.message : String(e),
      ok: false,
      hint: `Cannot reach ${env.apiUrl} — the ceremony stalls at the challenge request, with no prompt and no error.`,
    });
  }

  return gates;
}
