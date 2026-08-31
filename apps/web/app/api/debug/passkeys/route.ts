import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Read-only debug endpoint: returns the persisted passkey rows for
 * the current session, including the `metadata.liveness` audit slice
 * injected by the liveness enforcement hook. Demo purposes only.
 */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const rows = await db.passkey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  const parsed = rows.map((r) => ({
    ...r,
    metadata: r.metadata ? safeParse(r.metadata) : null,
  }));
  return Response.json({ user: session.user, passkeys: parsed });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
