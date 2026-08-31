/**
 * Lazy env access via a Proxy so that route modules can be imported
 * (e.g. during Next's "collecting page data" build phase) without
 * eagerly throwing if a var is missing. Validation runs the first
 * time a key is actually read at request time.
 */

const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "RP_ID",
  "RP_NAME",
] as const;

const OPTIONAL = [
  "RESEND_API_KEY",
  "RESEND_FROM",
  "MOBILE_IOS_BUNDLE_ID",
  "MOBILE_IOS_TEAM_ID",
  "MOBILE_ANDROID_PACKAGE",
  "MOBILE_ANDROID_CERT_SHA256",
] as const;

type RequiredKey = (typeof REQUIRED)[number];
type OptionalKey = (typeof OPTIONAL)[number];
type EnvShape = Record<RequiredKey, string> & Record<OptionalKey, string | undefined>;

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export const env = new Proxy({} as EnvShape, {
  get(_, prop: string) {
    const value = read(prop);
    if ((REQUIRED as readonly string[]).includes(prop) && !value) {
      throw new Error(`Missing required env var: ${prop}`);
    }
    return value;
  },
});
