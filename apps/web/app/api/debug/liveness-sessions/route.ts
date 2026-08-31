import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const rows = await db.passkeyLivenessSession.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return Response.json({ count: rows.length, sessions: rows });
}
