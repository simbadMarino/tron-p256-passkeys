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
};
