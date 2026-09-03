import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { expoPasskey } from "expo-passkey/server";
import { Resend } from "resend";

import { db } from "./db";
import { env } from "./env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * The Android signing-cert SHA-256 in the form a WebAuthn origin uses.
 *
 * The same 32 bytes are needed in two encodings, and mixing them up is
 * silent: `assetlinks.json` specifies the fingerprint as colon-separated
 * uppercase hex, while the origin Android reports inside clientDataJSON is
 * `android:apk-key-hash:<base64url>` over the raw bytes. Comparing one
 * against the other never matches, and the failure surfaces only as
 * "Invalid origin" from the ceremony.
 *
 * So `MOBILE_ANDROID_CERT_SHA256` stays in the hex form you get from
 * `keytool` — one value, one place to update — and the base64url form is
 * derived here.
 */
function androidKeyHashOrigin(fingerprint: string): string {
  const hex = fingerprint.trim().replace(/:/g, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `MOBILE_ANDROID_CERT_SHA256 must be a 32-byte SHA-256 fingerprint ` +
        `(64 hex chars, colons optional); got ${hex.length} hex chars. ` +
        `Copy the SHA256 line from keytool without its "SHA256:" label.`,
    );
  }
  const base64url = Buffer.from(hex, "hex")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `android:apk-key-hash:${base64url}`;
}

/**
 * Origins a WebAuthn assertion may legitimately claim in its
 * clientDataJSON. Not the same as the request origins Better Auth trusts —
 * see `trustedOrigins` below. Includes:
 *   - the web origin (browser ceremonies)
 *   - https://<rpId> (iOS native — origin is derived from the
 *     associated-domains `webcredentials:<rpId>` entry)
 *   - android:apk-key-hash:<base64url sha256> (Android native — only when
 *     the signing-cert SHA-256 is configured; see androidKeyHashOrigin,
 *     the encoding differs from the one assetlinks.json uses)
 */
const webauthnOrigins: string[] = [
  env.NEXT_PUBLIC_APP_URL,
  `https://${env.RP_ID}`,
  ...(env.MOBILE_ANDROID_CERT_SHA256
    ? [androidKeyHashOrigin(env.MOBILE_ANDROID_CERT_SHA256)]
    : []),
];

/**
 * Origins Better Auth will accept a *request* from — a different question
 * from which origins a WebAuthn assertion may claim.
 *
 * The native client sends `<scheme>://` as its Origin header, which is not a
 * WebAuthn origin and must never appear in the list above; but Better Auth
 * rejects any request origin it has not been told to trust, which surfaces
 * as `Invalid origin: tronpasskeydemo://`.
 *
 * The `expo()` plugin cannot supply this: it only adds `exp://` in
 * development, because the scheme is declared in the client config and the
 * server has no way to read it. Hence the env var.
 */
const trustedOrigins: string[] = [
  ...webauthnOrigins,
  ...(env.MOBILE_APP_SCHEME ? [`${env.MOBILE_APP_SCHEME}://`] : []),
];

/**
 * expo-passkey-liveness is deliberately not registered.
 *
 * Its `required` option accepts only "registration" | "authentication" |
 * "both" — there is no way to keep the plugin and make liveness optional. And
 * the demo `customProvider` is server-side only: the native module resolves a
 * provider name to a device adapter, and only Rekognition and iProov have
 * one, so a native ceremony against "demo" fails with LIVENESS_NOT_SUPPORTED
 * on both platforms regardless of device or configuration.
 *
 * Since this demo is passkey-only, enforcing liveness made native
 * registration impossible rather than merely unaudited. To bring it back,
 * configure a real provider server-side *and* in the native build, and
 * re-add `expo-passkey-liveness` to apps/mobile/app.config.ts plugins.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  // Passwordless only — passkeys (preferred) and email OTP (fallback).
  trustedOrigins,
  // Surface every API error in Vercel runtime logs while we debug the
  // 400 from /expo-passkey/register. Remove or gate to dev before final
  // shipping.
  onAPIError: {
    onError: (e) => {
      const err = e as { status?: string; statusCode?: number; message?: string; data?: unknown; body?: unknown };
      // eslint-disable-next-line no-console
      console.error("[better-auth] API error", {
        status: err?.status ?? err?.statusCode,
        message: err?.message,
        data: err?.data,
        body: err?.body,
      });
    },
  },
  plugins: [
    // Counterpart to expoClient() in apps/mobile. It adds the app's scheme
    // to trustedOrigins and normalises the Origin header on requests coming
    // from the native client, which otherwise present a scheme the server
    // does not recognise. The mobile client's cookie replay works without
    // it, but the asymmetry bites as soon as anything checks the origin.
    expo(),
    emailOTP({
      otpLength: 6,
      expiresIn: 600, // seconds — 10 minutes
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        // Type is "sign-in" | "email-verification" | "forget-password"
        const subject =
          type === "sign-in"
            ? `Your TRON P256 Passkeys sign-in code: ${otp}`
            : `Verify your email — code: ${otp}`;
        const body = `Your one-time code is ${otp}\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`;

        if (!resend) {
          // Demo fallback when no Resend key is configured.
          // eslint-disable-next-line no-console
          console.log(`[email-otp:${type}] ${email} → ${otp}`);
          return;
        }
        await resend.emails.send({
          from: env.RESEND_FROM ?? "onboarding@resend.dev",
          to: email,
          subject,
          text: body,
        });
      },
    }),
    expoPasskey({
      rpName: env.NEXT_PUBLIC_RP_NAME,
      rpId: env.RP_ID,
      origin: webauthnOrigins,
      // Enabled in production for the demo so warnings surface in Vercel
      // runtime logs. Flip to NODE_ENV-gated in a real deployment.
      logger: { enabled: true, level: "debug" },
      schema: {
        authPasskey: { modelName: "passkey" },
        passkeyChallenge: { modelName: "passkeyChallenge" },
      },
      cleanup: {
        // Serverless on Vercel — skip background timers.
        disableInterval: true,
      },
    }),
  ],
});
