# TRON P256 PASSKEYS

End-to-end reference monorepo for

[`expo-passkey`](https://github.com/iosazee/expo-passkey) and
[`expo-passkey-liveness`](https://github.com/iosazee/expo-passkey-liveness).
Two apps, one backend.

| Workspace                     | What it is                      | Demonstrates                                                                                     |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`apps/web`](./apps/web)       | Next.js + Better Auth + Prisma  | Server config wiring both plugins, browser WebAuthn ceremonies, debug surface, deploys to Vercel |
| [`apps/mobile`](./apps/mobile) | Expo SDK 55 app (iOS + Android) | Native passkey ceremony, liveness-wrapper wiring, debug screen — built against the same backend |

The web app exercises everything **except** the native camera (it uses
a demo `customProvider` that auto-passes). The mobile app shows the native
client wiring; configure a real provider adapter such as Rekognition or
iProov on both server and native build when you want a real PAD ceremony.

## What you'll end up with

Working through this guide gets you, in order:

1. A web app where you sign in with an email code, then register a passkey
2. A page that exports that passkey's signature as `r`, `s`, `x`, `y`
3. A smart wallet on TRON Nile that verifies those signatures on-chain
4. Optionally, the same flow running natively on iOS or Android

Parts 1 and 2 run entirely on `localhost` and take about 20 minutes. Part 3
needs a public HTTPS hostname and a native build — budget longer, and read
its warning before you start.

## Prerequisites

**For parts 1 and 2 (web + contracts):**

| Tool | Version | Check with | Needed for |
|---|---|---|---|
| Node | ≥ 20 | `node -v` | everything |
| npm | ≥ 10 | `npm -v` | workspaces |
| Postgres | 16 | `psql --version` | the web app's database (Docker is fine) |
| tronbox | ≥ 4.8 | `tronbox version` | compiling and deploying contracts |

**Additionally for part 3 (mobile):**

| Tool | Version | Check with | Needed for |
|---|---|---|---|
| Xcode | 16+ | `xcodebuild -version` | iOS builds, iOS 16+ target |
| Android Studio | — | — | Android builds, API 28+ |
| Java JDK | 17 | `java -version` | Gradle |
| ngrok | any | `ngrok version` | a public HTTPS hostname |

You also need a **TRON Nile testnet account** with test TRX for part 2 —
free from [nileex.io](https://nileex.io/join/getJoinPage). Use a key that
has never touched mainnet.

---

# Part 1 — The web app

Start here. Everything works on `localhost`, no tunnel and no accounts.

### Step 1 — Install

```bash
git clone <this-repo>
cd tron-p256-passkeys
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is needed because `expo-passkey-liveness` is an alpha
with strict peer ranges. `postinstall` runs `patch-package`, which applies a
required fix to that package — you should see `Applying patches...` in the
output.

Pinned deliberately:

- `expo-passkey@^0.3.15` — 0.3.14+ forwards `livenessToken` from both clients
- `expo-passkey-liveness@0.1.0-alpha.2` — alpha, pin exactly

### Step 2 — Start a database

```bash
docker run -d --name tron-p256-pg -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16
```

Any Postgres 16 works; Docker is just the quickest.

### Step 3 — Configure the web app

```bash
cp apps/web/.env.example apps/web/.env
```

Edit `apps/web/.env`:

```env
DATABASE_URL="postgresql://postgres:dev@localhost:5432/postgres"
BETTER_AUTH_SECRET="any random string of 32+ characters"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
BETTER_AUTH_URL="http://localhost:3000"
RP_ID="localhost"
NEXT_PUBLIC_RP_NAME="TRON P256 Passkeys"
```

`RP_ID` is a **bare domain** — no scheme, no port. `localhost` is valid here
because WebAuthn treats it as a trustworthy origin as a deliberate
exception. Without a `RESEND_API_KEY`, sign-in codes are printed to the
server console instead of emailed, which is fine for local work.

### Step 4 — Create the schema and run

```bash
npm run db:push
npm run dev:web
```

> **If port 3000 is busy**, Next will silently move to 3001 — and the auth
> client derives its base URL from the browser's origin, so it follows
> along. But `RP_ID` and the passkey origin list still say `3000`. Free the
> port rather than fighting it.

### Step 5 — Register a passkey

1. Open [http://localhost:3000](http://localhost:3000)
2. Sign in at `/login` with **Email code** — check the server console for
   the code if you have no Resend key
3. From `/dashboard`, click **Register passkey** and complete Touch ID /
   Windows Hello

You should now see the credential listed on the dashboard with a liveness
audit row beside it.

### Step 6 — Export the signature components

Open `/p256` (linked from the dashboard footer). Pick **Wallet operation**,
and the page shows the operation digest it will ask your passkey to sign.
Sign it, and you get `r`, `s`, the public key `x`/`y`, the flags byte, and
ABI-encoded calldata ready for a contract call.

That's the whole point of the project: the credential that logs you in also
signs transactions.

---

# Part 2 — The smart wallet on TRON Nile

`P256VERIFY` is live at address `0x100` on **Nile** but **not on mainnet** at
the time of writing — the `getAllowTvmOsaka` chain parameter reads `1` on
Nile and `0` on mainnet. Check before assuming otherwise.

### Step 1 — Compile

```bash
cd tron_contracts
tronbox compile
```

### Step 2 — Configure your key

```bash
cp sample-env .env
```

Put a **Nile-only** private key in `.env` as `PRIVATE_KEY_NILE`. It is
gitignored. Never use a key that holds mainnet funds.

### Step 3 — Deploy with your passkey's public key

Edit `migrations/2_deploy_contracts.js` so the constructor receives the
`x` and `y` from `/p256`, then:

```bash
source .env && tronbox migrate --network nile
```

The `x`/`y` are **immutable** — the wallet is permanently bound to that one
credential. Lose the passkey and the wallet is unreachable.

### Step 4 — Sign and submit an operation

Full walkthrough in the
[contracts README](tron_contracts/README.md). In outline: read `nonce()`
from the deployed wallet, enter the operation in `/p256` using the deployed
address and chain id `3448148188`, sign, then submit the emitted
`parameter`.

> **The digest commits to the wallet address and chain id.** Change either
> and the signature will not verify — this is what stops a signature being
> replayed against a different wallet or a different chain.

---

# Part 3 — The mobile app

**Read this before starting.** Mobile needs more setup than web, and one
decision that is expensive to reverse.

### Native passkeys need a real HTTPS domain

A passkey is scoped to an **rpId** — a bare domain, hashed into every
assertion. On device, that rpId is verified by fetching
`https://<rpId>/.well-known/apple-app-site-association` over a valid
certificate.

| rpId | web | native |
|---|---|---|
| `localhost` | works | **no** — from the device, that is the device itself |
| a LAN IP | works | **no** — an IP cannot serve a trusted cert, and WebAuthn requires a domain |
| a tunnelled or deployed domain | works | **yes** |

So parts 1 and 2 work on `localhost`; part 3 does not.

### The decision to make first

A different rpId means a different credential, a different public key, and a
`P256SmartWallet` that no longer matches. **Pick your hostname before
deploying a wallet you intend to keep**, or you will redeploy for
`localhost`, again for the tunnel, and again for production.

### Then follow the mobile guide

```bash
ngrok http 3000 --url=your-static-domain.ngrok-free.app
```

The [mobile README](apps/mobile/README.md) covers it step by step: claiming
a static ngrok domain, the env vars on both sides, the `.well-known`
verification, the development build, and when a Metro restart suffices
versus a full native rebuild.

It also documents every build failure we hit and why — optional peer
dependencies that Metro requires anyway, a resolver setting that breaks
nested version resolution, and two bugs in `expo-passkey-liveness`
(one patched locally, both reported upstream in
[`UPSTREAM-ISSUE-1`](UPSTREAM-ISSUE-1-android-kotlin.md) and
[`UPSTREAM-ISSUE-2`](UPSTREAM-ISSUE-2-config-plugin.md)).

Native passkeys do **not** work in Expo Go — a development build is
required.

---

## Repo layout

```
tron-p256-passkeys/
├── apps/
│   ├── web/                # Next.js — server + browser, /p256 export page
│   └── mobile/             # Expo SDK 55 — iOS + Android, Wallet tab
├── packages/
│   └── wallet-core/        # isomorphic P-256 / WebAuthn / TRON encoding,
│                           # shared by both apps so operationDigest exists once
├── tron_contracts/         # TronBox — P256SmartWallet, WebAuthn.sol, P256.sol
├── patches/                # patch-package; applied on postinstall
├── package.json            # npm workspaces root (apps/*, packages/*)
├── tsconfig.base.json
└── README.md               # ← you are here
```

`packages/wallet-core` holds everything platform-free: the operation digest,
DER signature parsing, base64url, base58check, and the ABI encoding for
`execute`. Each app supplies only its own signing ceremony —
`navigator.credentials.get()` on web, the Expo native module on device — so
the digest that must match `P256SmartWallet.operationDigest` byte-for-byte is
implemented in exactly one place.

## What the apps demonstrate

### `apps/web` — server + browser

**From `expo-passkey`:**

- Cross-platform passkey registration via WebAuthn (Touch ID, Windows
  Hello, platform authenticator)
- Sign-in via passkey assertion against the unified passkey table
- Custom schema mapping (`authPasskey` → `passkey`,
  `passkeyChallenge` → `passkeyChallenge`)
- Serverless-friendly config (`cleanup.disableInterval`) for Vercel

**From `expo-passkey-liveness`:**

- Both plugins composed in one `betterAuth()` call (see
  [`apps/web/lib/auth.ts`](./apps/web/lib/auth.ts))
- `/expo-passkey/liveness/session` and `/expo-passkey/liveness/verify`
  endpoints reachable end-to-end
- Enforcement hook validates `livenessToken` on register and
  authenticate (`required: "both"`)
- Audit slice written into `passkey.metadata.liveness`
- Demo `customProvider` auto-passes — no third-party credentials
  needed to see the full server flow

### `apps/mobile` — native ceremony wiring

- Email OTP sign-in via `@better-auth/expo`, session
  persisted in `expo-secure-store`
- **Register passkey + liveness** — calls `registerPasskeyWithLiveness`,
  then registers a platform passkey bound to the device's secure enclave
- **Sign in with passkey + liveness** — assertion ceremony with the
  same liveness gate
- **Standalone liveness** — Mode 1 from the docs: runs `verifyLiveness`
  on its own, useful for step-up flows
- **Debug screen** — pulls `/api/debug/passkeys` and
  `/api/debug/liveness-sessions` from the backend so you can see the
  rows the ceremony just created

The checked-in backend uses a demo liveness provider named `demo` so the web
flow is deterministic and credential-free. To make the mobile liveness step
open a real camera SDK, switch the server provider to `rekognitionProvider`
or `iproovProvider`, add that provider to the `expo-passkey-liveness` config
plugin options in `apps/mobile/app.config.ts`, then rebuild the dev client.

## Wiring the mobile app to the web backend

Native passkeys need three pieces of cross-app setup beyond the env
vars. The example handles all three:

1. **Trusted origin** — `apps/web/lib/auth.ts` adds `https://<rpId>`
   (iOS native) and `android:apk-key-hash:<sha256>` (when Android cert
   fingerprint is set) to the `expoPasskey({ origin })` list.
2. **Apple App Site Association** — `apps/web/app/.well-known/apple-app-site-association/route.ts`
   serves `{ webcredentials: { apps: [<TeamID>.<BundleID>] } }` when
   `MOBILE_IOS_BUNDLE_ID` + `MOBILE_IOS_TEAM_ID` are set.
3. **Android assetlinks** — `apps/web/app/.well-known/assetlinks.json/route.ts`
   serves the digital asset link record when `MOBILE_ANDROID_PACKAGE` +
   `MOBILE_ANDROID_CERT_SHA256` are set.

## Scripts

```bash
# Web
npm run dev:web                    # next dev
npm run build:web                  # prisma generate && next build
npm run db:push                    # prisma db push (apps/web)
npm run db:studio                  # prisma studio (apps/web)

# Mobile
npm run dev:mobile                 # expo start
npm run -w @tron-p256-passkey/mobile ios          # expo run:ios
npm run -w @tron-p256-passkey/mobile android      # expo run:android
npm run -w @tron-p256-passkey/mobile build:prod:ios       # eas build production iOS
npm run -w @tron-p256-passkey/mobile build:prod:android   # eas build production Android

# Contracts (from tron_contracts/, needs tronbox installed globally)
tronbox compile
tronbox migrate --network nile     # source .env first

# Cross-cutting
npm run type-check                 # tsc in every workspace
npm run lint                       # eslint in every workspace
```

`postinstall` runs `patch-package`, which applies
`patches/expo-passkey-liveness+0.1.0-alpha.2.patch`. Without it the Android
build fails to compile — see the
[mobile README](apps/mobile/README.md#troubleshooting--build-failures-we-hit-and-why).

## Deploying

- **Web → Vercel**: see [`apps/web/README.md`](./apps/web/README.md).
- **Mobile → App Store / Play Store**: see
  [`apps/mobile/README.md`](./apps/mobile/README.md). The `eas.json`
  ships with `development` / `preview` / `production` profiles
  modeled on a production-deployed Expo app.

## Related

- [`expo-passkey`](https://github.com/iosazee/expo-passkey) — cross-platform passkey plugin
- [`expo-passkey-liveness`](https://github.com/iosazee/expo-passkey-liveness) — liveness / PAD extension

## Credits

This repo is based on https://github.com/iosazee/tron-p256-passkey-app, thanks

## License

MIT
