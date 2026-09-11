import type { ConfigContext, ExpoConfig } from "expo/config";

const projectId = process.env.EXPO_PROJECT_ID;
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const rpId = process.env.EXPO_PUBLIC_RP_ID ?? new URL(apiUrl).host;

export default ({ config: _config }: ConfigContext): ExpoConfig => ({
  name: "TRON P256 Passkeys",
  slug: "tron-p256-passkeys",
  version: "0.0.1",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Matches the bundle identifier / package name below. Changing this
  // rewrites Info.plist CFBundleURLTypes and the Android intent-filter,
  // so it needs a native rebuild — and it must stay in step with
  // `scheme` in lib/auth-client.ts.
  scheme: "tronpasskeydemo",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.cctechmx.tronpasskeydemo",
    associatedDomains: [`webcredentials:${rpId}`, `applinks:${rpId}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Uncomment together with the android.permission.CAMERA entry below and
      // the expo-passkey-liveness plugin, once a real PAD provider
      // (Rekognition / iProov) replaces the auto-passing demo one. Until then
      // nothing opens a camera, and asking for access we never use is a
      // permission neither a user nor an app reviewer can be given a reason for.
      // Face ID does not need this — see NSFaceIDUsageDescription below.
      // NSCameraUsageDescription:
      //   "TRON P256 Passkeys uses the camera to verify your liveness during passkey registration and authentication.",
      NSFaceIDUsageDescription:
        "TRON P256 Passkeys uses Face ID so you can sign in with a passkey.",
    },
  },
  android: {
    package: "com.cctechmx.tronpasskeydemo",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    // Paired with NSCameraUsageDescription above — re-enable both when the
    // liveness ceremony actually captures video.
    // permissions: ["android.permission.CAMERA"],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-web-browser",
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
