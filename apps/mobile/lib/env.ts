import Constants from "expo-constants";

type Extra = { apiUrl?: string; rpId?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env: ${name}. Copy .env.example to .env and set it before running the mobile app.`
    );
  }
  return value;
}

export const env = {
  apiUrl: required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl),
  rpId: required("EXPO_PUBLIC_RP_ID", process.env.EXPO_PUBLIC_RP_ID ?? extra.rpId),
  /**
   * Label shown in the system passkey prompt. Taken from `name` in
   * app.config.ts so there is one source rather than another env var; it
   * should read the same as the server's NEXT_PUBLIC_RP_NAME.
   */
  rpName: Constants.expoConfig?.name ?? "TRON P256 Passkeys",
};
