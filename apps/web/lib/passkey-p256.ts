"use client";

/**
 * Sign an arbitrary 32-byte digest with a passkey and return it in the
 * shape an on-chain P256VERIFY verifier wants.
 *
 * This deliberately does NOT go through expo-passkey's
 * /expo-passkey/authenticate. That endpoint's job is to log you in: it
 * mints its own server-side challenge and consumes the assertion. A
 * smart-wallet signature is the opposite — *you* choose the challenge
 * (the userOp / transaction hash you want authorised), and the
 * assertion goes to the chain rather than to the auth server. So we
 * talk to the WebAuthn API directly and leave the login flow alone.
 *
 * The passkey is the same credential either way, so a key registered
 * through the dashboard works here unchanged.
 */

import {
  type AssertionFlags,
  type Custody,
  type P256Assertion,
  base64UrlToBytes,
  bytesToBase64Url,
  parseDerSignature,
  toHex,
  toHex32,
  webauthnDigest,
} from "@tron-p256/wallet-core";

// Re-exported so callers can keep importing the assertion shape from the
// signing module they already use. The definitions live in the shared
// package because the native path returns the identical shape.
export type { AssertionFlags, Custody, P256Assertion };

export interface SignOptions {
  /** Exactly 32 bytes — the hash you want the passkey to authorise. */
  digest: Uint8Array;
  /**
   * Restrict the ceremony to specific credentials (base64url ids). Omit
   * to let the platform offer any discoverable credential for this rpId.
   */
  allowCredentialIds?: string[];
  rpId?: string;
}

export async function signDigestWithPasskey(
  opts: SignOptions,
): Promise<P256Assertion> {
  const { digest, allowCredentialIds, rpId } = opts;

  if (digest.length !== 32) {
    throw new Error(
      `Digest must be exactly 32 bytes, got ${digest.length}. Hash your ` +
        `payload first — the authenticator signs the challenge as opaque bytes.`,
    );
  }

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: digest as BufferSource,
      rpId: rpId ?? window.location.hostname,
      userVerification: "required",
      timeout: 60_000,
      ...(allowCredentialIds?.length
        ? {
            allowCredentials: allowCredentialIds.map((id) => ({
              type: "public-key" as const,
              id: base64UrlToBytes(id) as BufferSource,
            })),
          }
        : {}),
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("The ceremony returned no credential");

  const response = credential.response as AuthenticatorAssertionResponse;
  const authenticatorData = new Uint8Array(response.authenticatorData);
  const clientDataBytes = new Uint8Array(response.clientDataJSON);
  const derSignature = new Uint8Array(response.signature);

  const { r, s, normalized } = parseDerSignature(derSignature);
  const computedDigest = webauthnDigest(
    authenticatorData,
    clientDataBytes,
  );

  const clientDataJSON = new TextDecoder().decode(clientDataBytes);
  const challengeBase64Url = bytesToBase64Url(digest);

  // The authenticator echoes the challenge back inside clientDataJSON.
  // If it does not match, the digest on-chain will not be the one we
  // asked for — fail loudly rather than hand back a wrong signature.
  if (!clientDataJSON.includes(`"challenge":"${challengeBase64Url}"`)) {
    throw new Error(
      "clientDataJSON does not echo the requested challenge — refusing to " +
        "return a signature that would not verify against your digest.",
    );
  }

  // Flags byte sits immediately after the 32-byte rpIdHash.
  //   bit 0 (0x01) UP · bit 2 (0x04) UV · bit 3 (0x08) BE · bit 4 (0x10) BS
  if (authenticatorData.length < 37) {
    throw new Error(
      `authenticatorData is ${authenticatorData.length} bytes; expected at ` +
        `least 37 (32 rpIdHash + 1 flags + 4 counter)`,
    );
  }
  const flagsByte = authenticatorData[32]!;
  const backupEligible = (flagsByte & 0x08) !== 0;
  const backupState = (flagsByte & 0x10) !== 0;

  // WebAuthn L3: BS must not be set when BE is clear. Reading that
  // combination as "device-bound" would be the least safe guess
  // available, so refuse it instead of classifying it.
  if (!backupEligible && backupState) {
    throw new Error(
      `Malformed flags 0x${flagsByte.toString(16).padStart(2, "0")}: ` +
        `BS is set while BE is clear. Refusing to infer custody.`,
    );
  }

  return {
    custody: !backupEligible
      ? "device-bound"
      : backupState
        ? "synced"
        : "sync-eligible",
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
