# tron p256 passkeys mobile

The Expo SDK 55 workspace. Runs `expo-passkey` + `expo-passkey-liveness`
natively on iOS and Android against the `apps/web` backend.

> Looking for the monorepo overview? See the
> [root README](../../README.md).

## What it demonstrates

- Email OTP sign-in via `@better-auth/expo`, session
  persisted in `expo-secure-store`
- **Register passkey + liveness** — `registerPasskeyWithLiveness`
  obtains a liveness token then binds a platform passkey to the device's
  secure enclave (Face ID / Touch ID / fingerprint)
- **Sign in with passkey + liveness** — `authenticateWithPasskeyAndLiveness`
  drives the assertion + liveness gate
- **Standalone liveness** — `verifyLiveness` on its own, returning a
  signed token (Mode 1 from the [docs](https://github.com/iosazee/expo-passkey-liveness#integration-modes))
- **Debug screen** — fetches `/api/debug/passkeys` and
  `/api/debug/liveness-sessions` so you can see what landed server-side

The default `apps/web` backend uses a demo `customProvider` called `demo`.
That is enough to test server enforcement and audit rows, but a real native
camera ceremony needs a provider adapter. Configure `rekognitionProvider` or
`iproovProvider` server-side, add the same provider to the
`expo-passkey-liveness` config plugin options in `app.config.ts`, and rebuild
the dev client.

## Local dev

```bash
# From the monorepo root
npm install --legacy-peer-deps

# Configure where the app talks to the web backend
cp apps/mobile/.env.example apps/mobile/.env
# Edit apps/mobile/.env — use your machine's LAN IP so devices can reach it:
#   EXPO_PUBLIC_API_URL=http://192.168.1.10:3000
#   EXPO_PUBLIC_RP_ID=192.168.1.10
```

Native passkeys do **not** work in Expo Go — you need a development
build. First time on each platform:

```bash
# iOS (requires Xcode + an iOS 16+ device or simulator)
npm run -w @epk-example/mobile ios

# Android (requires Android Studio + an Android 10+ device or emulator)
npm run -w @epk-example/mobile android
```

After the first build, just use:

```bash
npm run dev:mobile                 # expo start
```

and reload the dev client on your device.

## Pointing at a remote backend

For a deployed `apps/web` on Vercel:

```env
EXPO_PUBLIC_API_URL=https://your-app.vercel.app
EXPO_PUBLIC_RP_ID=your-app.vercel.app
```

The web app must also have these env vars set so the `.well-known`
files are populated (see [`apps/web/.env.example`](../web/.env.example)):

```
MOBILE_IOS_BUNDLE_ID=com.iosazee.epkexample
MOBILE_IOS_TEAM_ID=ABCDE12345
MOBILE_ANDROID_PACKAGE=com.iosazee.epkexample
MOBILE_ANDROID_CERT_SHA256=AA:BB:CC:...
```

Verify before publishing builds:

```bash
curl https://your-app.vercel.app/.well-known/apple-app-site-association
curl https://your-app.vercel.app/.well-known/assetlinks.json
```

Both must return JSON with the right bundle/package + 200. iOS caches
this aggressively — uninstall + reinstall the app after changing it.

## App store builds (EAS)

`eas.json` ships with three profiles:

| Profile         | Use                                                                               |
| --------------- | --------------------------------------------------------------------------------- |
| `development` | Dev client for local iteration.`distribution: internal`, iOS simulator allowed. |
| `preview`     | Internal TestFlight / Internal Track APK before submission.                       |
| `production`  | Store-ready build.`autoIncrement: true` so build numbers tick.                  |

```bash
# One-time
eas login
eas init                           # creates the EAS project; sets EXPO_PROJECT_ID

# Build
npm run -w @epk-example/mobile build:dev:ios
npm run -w @epk-example/mobile build:prod:ios
npm run -w @epk-example/mobile build:prod:android

# Submit (after configuring the IDs in eas.json)
npm run -w @epk-example/mobile submit:ios
npm run -w @epk-example/mobile submit:android
```

### Before you submit

A few things the store reviewers will check:

- **Privacy strings** — `app.config.ts` sets `NSCameraUsageDescription`
  and `NSFaceIDUsageDescription` with clear, user-facing copy.
  Re-check after any feature change.
- **iOS encryption export compliance** — `ITSAppUsesNonExemptEncryption: false`
  is set because the app uses only Apple-shipped crypto (WebAuthn,
  Keychain). If you swap to a non-Apple PAD provider that uses custom
  crypto, change this and add the export documentation.
- **Android target SDK** — Google requires API 35+ in 2026. The
  `expo-build-properties` plugin in `app.config.ts` sets
  `compileSdkVersion: 36, targetSdkVersion: 35`.
- **Associated domains / assetlinks** — your apps/web origin must
  serve `/.well-known/apple-app-site-association` and
  `/.well-known/assetlinks.json` over HTTPS with the right
  bundle/package. Without these, passkeys silently fail to register on
  Android and the "use saved passkey" sheet refuses to open on iOS.
- **Bundle identifier** — change `com.iosazee.epkexample` in
  `app.config.ts` to your own reverse-DNS identifier before
  submitting.

If you've never submitted an Expo app to either store, the
[`brianni-project`](https://github.com/iosazee/brianni-project) public
example (live on both stores) is a useful reference for the full
EAS pipeline, fingerprint runtime versions, screen-capture protection,
and config-plugin patterns.

## What's in here

```
apps/mobile/
├── app/                              # expo-router routes
│   ├── _layout.tsx
│   ├── index.tsx                     # redirect to sign-in or tabs
│   ├── (auth)/sign-in.tsx            # email OTP + passkey sign-in
│   └── (tabs)/
│       ├── _layout.tsx
│       ├── passkey.tsx               # register/auth/standalone liveness
│       └── debug.tsx                 # /api/debug/* viewer
├── lib/
│   ├── auth-client.ts                # better-auth + expoPasskeyClient + expo plugin
│   ├── api.ts                        # debug fetches + liveness fetcher adapter
│   └── env.ts                        # read EXPO_PUBLIC_* with Constants fallback
├── assets/images/                    # icon, splash, adaptive icon
├── app.config.ts
├── eas.json
├── metro.config.js                   # workspace-aware resolver
├── babel.config.js
└── tsconfig.json
```

## Scripts

```bash
npm run start                          # expo start
npm run ios                            # expo run:ios
npm run android                        # expo run:android
npm run web                            # expo start --web
npm run prebuild                       # expo prebuild --clean
npm run doctor                         # expo-doctor
npm run type-check                     # tsc --noEmit
npm run lint                           # eslint --fix
```

## License

MIT
