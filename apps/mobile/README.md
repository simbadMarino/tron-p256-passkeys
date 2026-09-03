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
- **Wallet screen** — signs a `P256SmartWallet` operation digest with the
  same passkey and emits the ABI-encoded `parameter` for `execute`. The
  native counterpart of the web app's `/p256` page; both share
  [`@tron-p256/wallet-core`](../../packages/wallet-core), so the digest is
  computed by one implementation rather than two

The default `apps/web` backend uses a demo `customProvider` called `demo`.
That is enough to test server enforcement and audit rows, but a real native
camera ceremony needs a provider adapter. Configure `rekognitionProvider` or
`iproovProvider` server-side, add the same provider to the
`expo-passkey-liveness` config plugin options in `app.config.ts`, and rebuild
the dev client.

## Prerequisites

Beyond the root [prerequisites](../../README.md#prerequisites):

| Tool | Version | Check with | Why |
|---|---|---|---|
| Xcode | 16+ | `xcodebuild -version` | iOS build; deployment target is 16.0 |
| Android Studio | — | — | Android build; compileSdk 36, minSdk 26 |
| Java JDK | 17 | `java -version` | Gradle |
| ngrok | any | `ngrok version` | a public HTTPS hostname for the rpId |
| A physical device | iOS 16+ / Android 9+ | — | biometrics; simulators can register but behave differently |

You also need the web app running and reachable over HTTPS — mobile talks to
it for auth and for the passkey challenge endpoints.

**A development build is required.** Native passkeys do not work in Expo Go,
because Expo Go cannot carry your app's associated-domains entitlement.

## Local dev

### Step 1 — The rpId decides everything (read this first)

A passkey is scoped to an **rpId**: a bare domain, no scheme and no port.
The rpId is hashed into every assertion (`authenticatorData[0..31]` is
`sha256(rpId)`), fixed at credential creation, and it determines where the
credential can be used at all.

`localhost` works **in browsers only** — WebAuthn treats it as a trustworthy
origin as a special case. Native passkeys resolve the rpId through Apple
App Site Association / Android Digital Asset Links, which means the device
fetches:

```
https://<rpId>/.well-known/apple-app-site-association
https://<rpId>/.well-known/assetlinks.json
```

That requires **HTTPS with a valid certificate on a real domain**. So:

| rpId | web | native |
|---|---|---|
| `localhost` | works | **no** — from the device, that is the device itself |
| a LAN IP (`192.168.x.x`) | works | **no** — an IP cannot serve a trusted cert for itself, and WebAuthn requires a domain |
| a tunnelled hostname | works | **yes** |
| a real deployed domain | works | **yes** |

Older versions of this README suggested a LAN IP. That is enough to reach
the dev server, but native passkey registration will still fail — the
address is not a domain and cannot be verified.

**Consequences worth planning for.** A different rpId means a different
credential, which means a **different public key**, which means the
`P256SmartWallet` deployed against the old key no longer matches — see
[`tron_contracts`](../../tron_contracts/README.md). Pick the hostname once,
before deploying a wallet you intend to keep.

### Step 2 — Get a stable HTTPS hostname (ngrok)

```bash
brew install ngrok
ngrok config add-authtoken <token from dashboard.ngrok.com>
```

In the ngrok dashboard, claim your **static domain** (the free plan
includes one). Do not use an ephemeral URL: random subdomains change on
every restart, and a changed hostname means a new rpId, a new credential
and a native rebuild, because the domain is baked into the app's
entitlements at build time.

```bash
ngrok http 3000 --url=your-static-domain.ngrok-free.app
```

Two ngrok quirks:

- Free plans serve an HTML interstitial to browser-like clients. If Apple's
  fetcher receives that instead of JSON, associated domains fail silently.
  Check with the `curl` below — if it returns HTML rather than JSON, that is
  the cause.
- Apple caches the AASA aggressively. Appending `?mode=developer` to the
  associated-domain entry makes the device fetch it directly, which is what
  you want while iterating.

### Step 3 — Configure env on both sides

`apps/mobile/.env` — the hostname is a bare domain here:

```env
EXPO_PUBLIC_API_URL=https://your-static-domain.ngrok-free.app
EXPO_PUBLIC_RP_ID=your-static-domain.ngrok-free.app
```

`apps/web/.env` — the same hostname, bare and as a URL, plus the two
`MOBILE_IOS_*` values or the `.well-known` routes return 404:

```env
NEXT_PUBLIC_APP_URL=https://your-static-domain.ngrok-free.app
BETTER_AUTH_URL=https://your-static-domain.ngrok-free.app
RP_ID=your-static-domain.ngrok-free.app
MOBILE_IOS_BUNDLE_ID=com.cctechmx.tronpasskeydemo
MOBILE_IOS_TEAM_ID=ABCDE12345
```

Verify before building anything:

```bash
curl -s https://your-static-domain.ngrok-free.app/.well-known/apple-app-site-association
```

You want JSON containing `TEAMID.com.cctechmx.tronpasskeydemo`. A 404 means the
`MOBILE_IOS_*` vars are not set; HTML means the ngrok interstitial.

### Step 4 — Install and build

```bash
npm install                  # from the monorepo root; runs patch-package
```

Native passkeys do **not** work in Expo Go — you need a development build:

```bash
npm run -w @tron-p256-passkey/mobile ios       # Xcode + iOS 16+
npm run -w @tron-p256-passkey/mobile android   # Android Studio + API 28+
```

### Step 5 — Iterate

```bash
npm run dev:mobile           # expo start
npx expo start --clear       # when a resolution error looks stale
```

**Metro restart vs native rebuild** — worth knowing which you need:

| change | what to do |
|---|---|
| TypeScript / React / a screen | reload the dev client |
| a Metro resolver setting | `expo start --clear` |
| `EXPO_PUBLIC_RP_ID`, anything in `app.config.ts` | **full rebuild** — the rpId is written into the entitlements at build time |
| adding a native module | **full rebuild** — autolinking and Gradle have to pick it up |

## Troubleshooting — build failures we hit, and why

Real failures, with the cause rather than just the fix.

### `Unable to resolve "expo-network"` / `"expo-web-browser"`

`@better-auth/expo` declares both as **optional** peer dependencies, but
reaches them through `import("expo-network")`. Metro resolves every import
at bundle time, dynamic ones included, and does not care that a peer is
optional — a missing specifier fails the bundle whether or not it is reached
at runtime.

```bash
cd apps/mobile && npx expo install expo-network expo-web-browser
```

Use `expo install`, not `npm install`, so the versions match the SDK. Both
are native modules, so this needs a full rebuild.

### `Unable to resolve "semver/functions/satisfies"`

Not a missing package. `react-native-reanimated` needs `semver@7`, which it
has nested in its own `node_modules`; the hoisted root copy is `semver@6`,
which has no `functions/` directory. `metro.config.js` had:

```js
config.resolver.disableHierarchicalLookup = true;
```

That stops Metro looking inside a package's own `node_modules`, so it only
saw the root `semver@6` and failed. It is now explicitly `false` (also
Metro's default) with a comment explaining why it must stay that way.
`watchFolders` and `nodeModulesPaths` are what make the monorepo resolve;
that third line was only a restriction.

### `'getCode' overrides nothing` — Kotlin compile failure

`expo-passkey-liveness@0.1.0-alpha.2` overrides `CodedException.getCode()`,
which expo-modules-core 55 replaced with a `val code` plus a
`(code, message, cause)` constructor. Fixed by
[`patches/expo-passkey-liveness+0.1.0-alpha.2.patch`](../../patches), applied
automatically by `patch-package` on `postinstall`. Reported upstream — see
[`UPSTREAM-ISSUE-1-android-kotlin.md`](../../UPSTREAM-ISSUE-1-android-kotlin.md).

### `Unable to resolve a valid config plugin for expo-passkey-liveness`

Same package. Its `exports` map keys the plugin as `./app.plugin` without
the extension, but Expo's resolver asks for `app.plugin.js` — which an
`exports` map then blocks, even though the file ships. Expo falls back to the
package main, which throws `_guard is not defined`.

The plugin is therefore **not** listed in `app.config.ts`. Its only effect is
adding camera permissions for a real PAD provider's capture ceremony, and the
demo `customProvider` opens no camera. **Face ID is unaffected** — that runs
in the OS and needs `NSFaceIDUsageDescription`, supplied by
`expo-local-authentication`. See
[`UPSTREAM-ISSUE-2-config-plugin.md`](../../UPSTREAM-ISSUE-2-config-plugin.md).

Camera permissions are commented out in `app.config.ts` for the same reason —
re-enable them together with the plugin when a real provider goes in.

## Pointing at a remote backend

Same shape as the ngrok setup above — a real domain simply replaces the
tunnel, and it is the better choice if you want an rpId that outlives your
dev machine. For a deployed `apps/web` on Vercel:

```env
EXPO_PUBLIC_API_URL=https://your-app.vercel.app
EXPO_PUBLIC_RP_ID=your-app.vercel.app
```

The web app must also have these env vars set so the `.well-known`
files are populated (see [`apps/web/.env.example`](../web/.env.example)):

```
MOBILE_IOS_BUNDLE_ID=com.cctechmx.tronpasskeydemo
MOBILE_IOS_TEAM_ID=ABCDE12345
MOBILE_ANDROID_PACKAGE=com.cctechmx.tronpasskeydemo
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
npm run -w @tron-p256-passkey/mobile build:dev:ios
npm run -w @tron-p256-passkey/mobile build:prod:ios
npm run -w @tron-p256-passkey/mobile build:prod:android

# Submit (after configuring the IDs in eas.json)
npm run -w @tron-p256-passkey/mobile submit:ios
npm run -w @tron-p256-passkey/mobile submit:android
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
- **Bundle identifier** — change `com.cctechmx.tronpasskeydemo` in
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
