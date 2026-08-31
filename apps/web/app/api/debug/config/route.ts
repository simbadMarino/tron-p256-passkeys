import { env } from "@/lib/env";

/**
 * Debug-only configuration dump. Lets us confirm what the server
 * actually thinks rpId / origin are vs. what the browser sends.
 *
 * Returns a small JSON payload — does NOT leak secrets — so it's
 * safe to leave deployed while iterating. Remove once the demo is
 * solid if you'd prefer the surface area trimmed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return Response.json({
    server: {
      rpId: env.RP_ID,
      rpName: env.RP_NAME,
      nextPublicAppUrl: env.NEXT_PUBLIC_APP_URL,
      betterAuthUrl: env.BETTER_AUTH_URL,
    },
    request: {
      host: req.headers.get("host"),
      origin: req.headers.get("origin"),
      forwardedHost: req.headers.get("x-forwarded-host"),
      forwardedProto: req.headers.get("x-forwarded-proto"),
      url: url.toString(),
    },
  });
}
