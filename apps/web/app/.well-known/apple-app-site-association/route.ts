import { NextResponse } from "next/server";

import { env } from "@/lib/env";

/**
 * Apple App Site Association — required for iOS associated domains.
 * Enables passkeys (webcredentials) and universal links (applinks)
 * to bind the apps/mobile bundle to this domain.
 *
 * Apple requires this file to be served:
 *   - over HTTPS
 *   - from `/.well-known/apple-app-site-association`
 *   - with `Content-Type: application/json`
 *   - WITHOUT a `.json` extension in the URL
 *
 * Set `MOBILE_IOS_BUNDLE_ID` and `MOBILE_IOS_TEAM_ID` in your env to
 * enable this route. Until then it returns 404, which is fine for a
 * web-only deployment.
 */
export async function GET() {
  if (!env.MOBILE_IOS_BUNDLE_ID || !env.MOBILE_IOS_TEAM_ID) {
    return new NextResponse("Not configured for mobile", { status: 404 });
  }

  const appID = `${env.MOBILE_IOS_TEAM_ID}.${env.MOBILE_IOS_BUNDLE_ID}`;

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID,
            paths: ["*"],
          },
        ],
      },
      webcredentials: {
        apps: [appID],
      },
    },
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
      },
    }
  );
}
