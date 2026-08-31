import { NextResponse } from "next/server";

import { env } from "@/lib/env";

/**
 * Android Digital Asset Links — required for Android App Links and
 * the credential manager / passkey ceremony to bind the apps/mobile
 * package to this domain.
 *
 * The route is reached at `/.well-known/assetlinks.json` even though
 * Next's app router can't use a literal `.json` in a segment name —
 * the directory name above ends in `.json` and the GET handler here
 * serves the body.
 *
 * Set `MOBILE_ANDROID_PACKAGE` and `MOBILE_ANDROID_CERT_SHA256` to
 * enable. The fingerprint must be the SHA-256 of your signing
 * certificate, colon-separated. Until configured this route 404s.
 */
export async function GET() {
  if (!env.MOBILE_ANDROID_PACKAGE || !env.MOBILE_ANDROID_CERT_SHA256) {
    return new NextResponse("Not configured for mobile", { status: 404 });
  }

  return NextResponse.json(
    [
      {
        relation: [
          "delegate_permission/common.handle_all_urls",
          "delegate_permission/common.get_login_creds",
        ],
        target: {
          namespace: "android_app",
          package_name: env.MOBILE_ANDROID_PACKAGE,
          sha256_cert_fingerprints: [env.MOBILE_ANDROID_CERT_SHA256],
        },
      },
    ],
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
      },
    }
  );
}
