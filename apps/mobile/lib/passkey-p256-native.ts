/**
 * Sign an arbitrary 32-byte digest with a passkey, on device.
 *
 * The native counterpart of `apps/web/lib/passkey-p256.ts`. Everything after
 * the ceremony — DER parsing, the digest, custody flags — comes from
 * `@tron-p256/wallet-core`, so both platforms agree by construction rather
 * than by discipline.
 *
 * Why this bypasses expo-passkey's `authenticateWithPasskey`: that helper
 * fetches a challenge from the auth server and consumes the assertion to log
 * you in. A wallet signature is the opposite — *you* choose the challenge (the
 * operation digest) and the assertion goes to the chain. The underlying native
 * module takes raw WebAuthn options, so we build our own request and call it
 * directly, exactly as the web version calls `navigator.credentials.get()`.
 */

// `expo-passkey/native` default-exports the native module; the deeper path
// is not in the package export map and will not resolve.
import ExpoPasskeyModule from "expo-passkey/native";

import {
  base64UrlToBytes,
  bytesToBase64Url,
  parseDerSignature,
  toHex,
  toHex32,
  webauthnDigest,
  type Custody,
  type P256Assertion,
} from "@tron-p256/wallet-core";

export interface NativeSignOptions {
  /** Exactly 32 bytes — the digest to authorise. */
  digest: Uint8Array;
  /** The rpId the credential was registered under. Domain only, no scheme. */
  rpId: string;
  /** Restrict to specific credentials (base64url ids); omit for discoverable. */
  allowCredentialIds?: string[];
  timeoutMs?: number;
}

/**
 * The native module hands back WebAuthn's JSON serialisation, where binary
 * fields are base64url strings rather than the ArrayBuffers a browser returns.
 * That difference is the only thing this file has to reconcile.
 */
interface NativeAssertion {
  id: string;
  rawId?: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string | null;
  };
}

export async function signDigestWithPasskeyNative(
  opts: NativeSignOptions,
): Promise<P256Assertion> {
  const { digest, rpId, allowCredentialIds, timeoutMs = 60_000 } = opts;

  if (digest.length !== 32) {
    throw new Error(
      `Digest must be exactly 32 bytes, got ${digest.length}. Hash your ` +
        `payload first — the authenticator signs the challenge as opaque bytes.`,
    );
  }

  const challengeBase64Url = bytesToBase64Url(digest);

  const requestJson = JSON.stringify({
    challenge: challengeBase64Url,
    rpId,
    userVerification: "required",
    timeout: timeoutMs,
    ...(allowCredentialIds?.length
      ? {
          allowCredentials: allowCredentialIds.map((id) => ({
            type: "public-key",
            id,
          })),
        }
      : {}),
  });

  const raw = await ExpoPasskeyModule.authenticateWithPasskey({ requestJson });
  const credential: NativeAssertion =
    typeof raw === "string" ? JSON.parse(raw) : (raw as NativeAssertion);

  if (!credential?.response) {
    throw new Error("Native assertion returned no response payload");
  }

  const authenticatorData = base64UrlToBytes(
    credential.response.authenticatorData,
  );
  const clientDataBytes = base64UrlToBytes(credential.response.clientDataJSON);
  const derSignature = base64UrlToBytes(credential.response.signature);

  const { r, s, normalized } = parseDerSignature(derSignature);
  const computedDigest = webauthnDigest(authenticatorData, clientDataBytes);
  const clientDataJSON = new TextDecoder().decode(clientDataBytes);

  // The authenticator echoes the challenge back. If it does not match, the
  // digest going on-chain is not the one we asked for — fail rather than
  // hand back a signature that cannot verify.
  if (!clientDataJSON.includes(`"challenge":"${challengeBase64Url}"`)) {
    throw new Error(
      "clientDataJSON does not echo the requested challenge — refusing to " +
        "return a signature that would not verify against your digest.",
    );
  }

  if (authenticatorData.length < 37) {
    throw new Error(
      `authenticatorData is ${authenticatorData.length} bytes; expected at ` +
        `least 37 (32 rpIdHash + 1 flags + 4 counter)`,
    );
  }

  const flagsByte = authenticatorData[32]!;
  const backupEligible = (flagsByte & 0x08) !== 0;
  const backupState = (flagsByte & 0x10) !== 0;

  // WebAuthn L3: BS must not be set when BE is clear. Reading that as
  // "device-bound" would be the least safe guess available.
  if (!backupEligible && backupState) {
    throw new Error(
      `Malformed flags 0x${flagsByte.toString(16).padStart(2, "0")}: ` +
        `BS is set while BE is clear. Refusing to infer custody.`,
    );
  }

  const custody: Custody = !backupEligible
    ? "device-bound"
    : backupState
      ? "synced"
      : "sync-eligible";

  return {
    custody,
    r: toHex32(r),
    s: toHex32(s),
    sNormalized: normalized,
    digest: toHex(computedDigest),
    credentialId: credential.id,
    authenticatorData: toHex(authenticatorData),
    clientDataJSON,
    challengeIndex: clientDataJSON.indexOf('"challenge":"'),
    typeIndex: clientDataJSON.indexOf('"type":"'),
    challengeBase64Url,
    flags: {
      userPresent: (flagsByte & 0x01) !== 0,
      userVerified: (flagsByte & 0x04) !== 0,
      backupEligible,
      backupState,
      raw: flagsByte,
    },
  };
}
