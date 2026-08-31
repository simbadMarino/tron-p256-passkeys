/**
 * The shape both platforms produce from a passkey assertion.
 *
 * The ceremony differs (navigator.credentials on web, the Expo native
 * module on device) but the result must not, since the same contract
 * consumes both.
 */

/**
 * What the Backup Eligible / Backup State bits say about where the
 * private key can live.
 *
 *   device-bound   BE=0 — the key cannot be backed up or synced. Fixed
 *                  for the credential's lifetime.
 *   sync-eligible  BE=1, BS=0 — syncable, but no copy exists yet (e.g.
 *                  iCloud Keychain was off when it was created).
 *   synced         BE=1, BS=1 — a copy exists in the provider's cloud,
 *                  so the key's security inherits that account's.
 */
export type Custody = "device-bound" | "sync-eligible" | "synced";

export interface AssertionFlags {
  userPresent: boolean;
  userVerified: boolean;
  /** Immutable at credential creation — the honest device-bound signal. */
  backupEligible: boolean;
  /** Mutable over the credential's life; reflects the current backup. */
  backupState: boolean;
  /**
   * The whole flags byte. A contract reads this same byte out of
   * authenticatorData[32], so keeping it lets you reproduce an on-chain
   * mask check exactly rather than re-deriving it from the booleans.
   */
  raw: number;
}

export interface P256Assertion {
  /** Signature components, ready to pass as uint256. */
  r: string;
  s: string;
  /** True when s was folded to n - s to satisfy the low-s rule. */
  sNormalized: boolean;
  /** sha256(authenticatorData ‖ sha256(clientDataJSON)) — the signed digest. */
  digest: string;
  /** Which credential signed, base64url as WebAuthn reports it. */
  credentialId: string;
  /** Raw inputs a contract needs to re-derive the digest itself. */
  authenticatorData: string;
  clientDataJSON: string;
  /**
   * Byte offsets into clientDataJSON of the `"challenge":"` and
   * `"type":"` keys, matching the convention in Coinbase's
   * WebAuthn.sol (the index points at the opening quote of the *key*,
   * and the contract slices key + value + closing quote). Check these
   * against your own verifier before wiring them up.
   */
  challengeIndex: number;
  typeIndex: number;
  /** The digest as it appears inside clientDataJSON. */
  challengeBase64Url: string;
  /** UP / UV / BE / BS bits, so you can assert them on-chain. */
  flags: AssertionFlags;
  /** BE+BS read as a custody statement. */
  custody: Custody;
}
