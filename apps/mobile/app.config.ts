import type { ConfigContext, ExpoConfig } from "expo/config";

const projectId = process.env.EXPO_PROJECT_ID;
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const rpId = process.env.EXPO_PUBLIC_RP_ID ?? new URL(apiUrl).host;

export default ({ config: _config }: ConfigContext): ExpoConfig => ({
  name: "EPK Example",
  slug: "epk-example",
  version: "0.0.1",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "epkexample",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.iosazee.epkexample",
    associatedDomains: [`webcredentials:${rpId}`, `applinks:${rpId}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        "EPK Example uses the camera to verify your liveness during passkey registration and authentication.",
      NSFaceIDUsageDescription:
        "EPK Example uses Face ID so you can sign in with a passkey.",
    },
  },
  android: {
    package: "com.iosazee.epkexample",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    permissions: ["android.permission.CAMERA"],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0f172a",
      },
    ],
    "expo-secure-store",
    [
      "expo-local-authentication",
      {
        faceIDPermission: "Allow $(PRODUCT_NAME) to use Face ID for passkey sign-in.",
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 35,
          minSdkVersion: 26,
        },
        ios: {
          deploymentTarget: "16.0",
        },
      },
    ],
    "expo-passkey-liveness",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl,
    rpId,
    eas: { projectId },
  },
  ...(projectId
    ? {
        updates: { url: `https://u.expo.dev/${projectId}` },
        runtimeVersion: { policy: "fingerprint" as const },
      }
    : {}),
});
