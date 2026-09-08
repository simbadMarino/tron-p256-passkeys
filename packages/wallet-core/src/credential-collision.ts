/**
 * Whether registering another passkey would destroy one you already have.
 *
 * A discoverable passkey is keyed by `(rpId, userHandle)`. WebAuthn requires
 * an authenticator that already holds a credential for that pair to
 * *overwrite* it rather than store a second one. Because this app sends the
 * same user id as the userHandle on every registration, re-registering
 * against the same provider silently replaces the previous credential — the
 * old private key is gone, and any smart wallet that stored its public key
 * can no longer be signed for.
 *
 * Nothing warns about this on its own: `excludeCredentials` would make the
 * authenticator refuse with `InvalidStateError` instead, but expo-passkey
 * never populates it and exposes no way to. So the check has to happen here,
 * before the ceremony starts.
 *
 * Kept platform-free and shared so the web and Expo apps cannot drift on a
 * rule this easy to get subtly wrong.
 */

/** The subset of a stored credential row this check needs. */
export interface ExistingCredential {
  credentialId: string;
  /** "web" | "android" | "ios" — as the server recorded it. */
  platform: string;
  aaguid: string | null;
  /** "active" | "revoked". */
  status: string;
  createdAt: string;
  /**
   * `Device.modelName` on native, the raw user agent on web. Reliable for
   * matching a device on native; not on web, where the same provider is
   * reached from several user agents.
   */
  deviceName?: string | null;
}

export interface OverwriteRisk {
  /**
   * Active credentials a new registration on this platform could replace,
   * same-device ones first. Empty means registering is safe.
   */
  atRisk: ExistingCredential[];
  /**
   * True when one of them is from this exact device, which makes an
   * overwrite near-certain rather than merely possible. Only ever true on
   * native — see `deviceName`.
   */
  sameDevice: boolean;
}

/**
 * AAGUIDs are only named here when this project has actually observed the
 * pairing, so a warning never asserts a provider it cannot vouch for.
 * Anything else falls back to a generic phrase via `describeAuthenticator`.
 */
const KNOWN_AUTHENTICATORS: Record<string, string> = {
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
};

/** All-zero AAGUID: the authenticator declined to identify itself. */
const ANONYMOUS_AAGUID = "00000000-0000-0000-0000-000000000000";

/**
 * A human name for the provider that holds a credential, or null when it
 * cannot be determined. Callers should fall back to wording that does not
 * name a provider.
 */
export function describeAuthenticator(aaguid: string | null): string | null {
  if (!aaguid || aaguid === ANONYMOUS_AAGUID) return null;
  return KNOWN_AUTHENTICATORS[aaguid.toLowerCase()] ?? null;
}

export function credentialsAtRiskOfOverwrite(
  existing: readonly ExistingCredential[],
  target: { platform: string; deviceName?: string | null },
): OverwriteRisk {
  // Only active credentials can be lost. A revoked row is already a record
  // of a key that no longer exists.
  const candidates = existing.filter(
    (c) => c.status !== "revoked" && c.platform === target.platform,
  );

  // Matching on platform alone deliberately over-reports on web, where one
  // provider spans several user agents: warning about a credential that
  // turns out to survive is recoverable, staying silent about one that gets
  // destroyed is not.
  const isSameDevice = (c: ExistingCredential): boolean =>
    Boolean(
      target.deviceName && c.deviceName && c.deviceName === target.deviceName,
    );

  const atRisk = [...candidates].sort((a, b) => {
    const aSame = isSameDevice(a);
    const bSame = isSameDevice(b);
    if (aSame !== bSame) return aSame ? -1 : 1;
    // ISO-8601 sorts correctly lexicographically; newest first.
    return b.createdAt.localeCompare(a.createdAt);
  });

  return { atRisk, sameDevice: atRisk.some(isSameDevice) };
}

/**
 * The warning to show before starting a registration that would overwrite
 * something, or null when there is nothing to warn about.
 *
 * Lives here rather than in each app so the two surfaces say the same thing.
 */
export function overwriteWarning(risk: OverwriteRisk): string | null {
  if (risk.atRisk.length === 0) return null;

  const provider = describeAuthenticator(risk.atRisk[0]!.aaguid);
  const where = provider ? `in ${provider}` : "with the same passkey provider";
  const certainty = risk.sameDevice ? "will replace" : "is likely to replace";
  const subject =
    risk.atRisk.length === 1
      ? "an active passkey"
      : `${risk.atRisk.length} active passkeys`;

  return (
    `You already have ${subject} ${where} for this account. ` +
    `Registering another one ${certainty} ${
      risk.atRisk.length === 1 ? "it" : "them"
    }: the old key stops working, and any smart wallet holding its public key ` +
    `can no longer be signed for. Add a passkey from a different device or ` +
    `provider to keep this one.`
  );
}
