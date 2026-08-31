import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { base64UrlToBytes, coseToPublicKey, toHex32 } from "@tron-p256/wallet-core";

/**
 * The (x, y) coordinates of the current user's passkeys, decoded out of
 * the stored COSE_Key.
 *
 * These are the values a smart wallet stores as its owner/signer. They
 * are public — the private half never leaves the authenticator — but
 * the endpoint is still session-scoped so one user cannot enumerate
 * another's credentials.
 */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const rows = await db.passkey.findMany({
    where: { userId: session.user.id, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  const keys = rows.map((row) => {
    try {
      const { x, y } = coseToPublicKey(base64UrlToBytes(row.publicKey));
      return {
        credentialId: row.credentialId,
        platform: row.platform,
        createdAt: row.createdAt,
        x: toHex32(x),
        y: toHex32(y),
        // Registration-time hints about custody. Neither is conclusive —
        // the authoritative signal is the BE bit on an assertion — but a
        // zero signature counter is characteristic of multi-device
        // credentials, which cannot keep a counter coherent across copies.
        aaguid: row.aaguid,
        counter: row.counter,
        error: null as string | null,
      };
    } catch (err) {
      // A non-ES256 credential (RSA, Ed25519) lands here. Report it
      // rather than dropping the row silently.
      return {
        credentialId: row.credentialId,
        platform: row.platform,
        createdAt: row.createdAt,
        x: null,
        y: null,
        aaguid: row.aaguid,
        counter: row.counter,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  return Response.json({ keys });
}
