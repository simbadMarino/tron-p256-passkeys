import { db } from "./db";

/**
 * Mark the credential a fresh registration just destroyed as revoked.
 *
 * A discoverable passkey is keyed by `(rpId, userHandle)`, and an
 * authenticator that already holds one for that pair overwrites it rather
 * than storing a second. Since every registration here sends the same user
 * id as the userHandle, re-registering against the same provider silently
 * replaces the previous credential.
 *
 * The server never hears about that: it only sees a new credential arrive and
 * happily leaves the old row `active`. So the table accumulates rows that
 * claim to be usable signing keys but cannot sign — which is how one account
 * ended up with four "active" Android credentials backed by one real key.
 *
 * The right fix is `excludeCredentials`, which would make the authenticator
 * refuse with `InvalidStateError` instead of overwriting. expo-passkey builds
 * the creation options internally and exposes no way to populate it, so the
 * table has to be reconciled after the fact instead.
 *
 * ## Deliberately conservative
 *
 * There is no reliable server-side signal for "these two rows live in the
 * same authenticator". This matches on platform *and* device model, and
 * revokes nothing when the device is unknown. That leaves an orphan row in
 * the rare ambiguous case — two devices reporting the identical model, each
 * with its own provider account — which is the right way to be wrong:
 * wrongly revoking a credential that still works would tell the user a
 * usable key is dead, while a stray row is merely untidy.
 */

/** `deviceName` as expo-passkey records it: `Device.modelName` on native. */
function deviceNameOf(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const name = parsed["deviceName"];
    return typeof name === "string" && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

/**
 * @param newCredentialId the credential just registered, which is kept.
 * @returns how many rows were revoked.
 */
export async function revokeSupersededPasskeys(
  newCredentialId: string,
): Promise<number> {
  const fresh = await db.passkey.findUnique({
    where: { credentialId: newCredentialId },
  });
  // Nothing to reconcile against — the registration did not land, or the
  // hook fired for a credential this server does not own.
  if (!fresh) return 0;

  const deviceName = deviceNameOf(fresh.metadata);
  // Without a device we cannot tell an overwrite from a second device
  // legitimately holding its own credential. Leave everything alone.
  if (!deviceName) return 0;

  const siblings = await db.passkey.findMany({
    where: {
      userId: fresh.userId,
      platform: fresh.platform,
      status: "active",
      credentialId: { not: newCredentialId },
    },
  });

  const superseded = siblings.filter(
    (s) => deviceNameOf(s.metadata) === deviceName,
  );
  if (superseded.length === 0) return 0;

  const now = new Date().toISOString();
  const { count } = await db.passkey.updateMany({
    where: { id: { in: superseded.map((s) => s.id) } },
    data: {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
      // Names the replacement so the record is auditable, and reversible by
      // hand if this ever fires on a credential that turns out to have
      // survived.
      revokedReason:
        `Superseded by ${newCredentialId} on the same device ` +
        `(${deviceName}). Re-registering a discoverable passkey with the ` +
        `same (rpId, userHandle) overwrites the previous credential in the ` +
        `authenticator, so this key no longer exists and can never sign again.`,
    },
  });
  return count;
}
