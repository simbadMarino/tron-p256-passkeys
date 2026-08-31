# `@epk-example/web`

The Next.js 15 + Better Auth + Prisma workspace. Hosts the Better
Auth handler (which wires both `expo-passkey` and `expo-passkey-liveness`),
serves the `/.well-known` files the native mobile app needs, and
exposes the browser landing, login, and dashboard flows.

> Looking for the monorepo overview? See the
> [root README](../../README.md).

## Local dev

A Postgres database is required (the schema uses Postgres-specific
types Better Auth needs in production). Easiest local option:

```bash
docker run -d --name epk-pg -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16
```

Then:

```bash
cp .env.example .env
# Edit .env: DATABASE_URL="postgresql://postgres:dev@localhost:5432/postgres"
npm install --legacy-peer-deps              # from monorepo root
npm run db:push --workspace=@epk-example/web
npm run dev --workspace=@epk-example/web    # http://localhost:3000
```

Or from the repo root: `npm run dev:web`.

Open <http://localhost:3000> and click through:

1. **Sign in with email OTP** from `/login` (Resend sends the code; in
   dev without a key the server logs it)
2. **Register passkey + liveness** from `/dashboard` — Touch ID / Windows Hello + the
   auto-passing demo liveness provider
3. **Sign out, then sign in with passkey + liveness** — full assertion flow
4. **Inspect debug routes** — confirm the liveness audit landed on the
   passkey row and the liveness session row moved to `verified`

Inspect rows:

- <http://localhost:3000/api/debug/passkeys> — audit slice lives in
  `metadata.liveness`
- <http://localhost:3000/api/debug/liveness-sessions> — session rows
  in `verified` / `failed` / `expired` states

## Deploy to Vercel

1. Push the monorepo to GitHub. In Vercel, set the project's *Root
   Directory* to `apps/web` and *Install Command* to
   `cd ../.. && npm install --legacy-peer-deps`.
2. Create a free Postgres database on [Neon](https://neon.tech) or
   any Vercel-compatible provider.
3. Set environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon Postgres connection string |
   | `BETTER_AUTH_SECRET` | Any 32+ char random string |
   | `BETTER_AUTH_URL` | `https://your-app.vercel.app` |
   | `NEXT_PUBLIC_APP_URL` | Same as `BETTER_AUTH_URL` |
   | `RP_ID` | `your-app.vercel.app` (hostname only, no scheme) |
   | `RP_NAME` | Label users see, e.g. `"My App"` |
   | `MOBILE_IOS_BUNDLE_ID` *(optional)* | `com.iosazee.epkexample` |
   | `MOBILE_IOS_TEAM_ID` *(optional)* | Your Apple Team ID |
   | `MOBILE_ANDROID_PACKAGE` *(optional)* | `com.iosazee.epkexample` |
   | `MOBILE_ANDROID_CERT_SHA256` *(optional)* | SHA-256 of signing cert |

4. Deploy. The `postinstall` runs `prisma generate`; run
   `npx prisma db push` once against the Neon DB to create tables.

## What's in here

```
apps/web/
├── app/
│   ├── .well-known/
│   │   ├── apple-app-site-association/route.ts   ← iOS AASA
│   │   └── assetlinks.json/route.ts              ← Android assetlinks
│   ├── api/auth/[...all]/route.ts                ← Better Auth handler
│   ├── api/debug/{passkeys,liveness-sessions}/route.ts
│   ├── dashboard/page.tsx                        ← register + inspect passkeys
│   ├── layout.tsx
│   ├── login/page.tsx                            ← email OTP + passkey login
│   └── page.tsx                                  ← landing
├── lib/
│   ├── auth.ts                                   ← server config — both plugins wired
│   ├── auth-client.ts                            ← browser client
│   ├── liveness-web.ts                           ← web-only verifyLiveness adapter
│   ├── db.ts                                     ← Prisma singleton
│   └── env.ts
├── prisma/schema.prisma
└── .env.example
```

The interesting file is [`lib/auth.ts`](./lib/auth.ts) — it shows the
two plugins side-by-side in a single `betterAuth()` call, with the
trusted-origin list set up so both browser AND native ceremonies
verify against the same backend.

## Swapping in a real liveness provider

The server is configured with `customProvider({ name: "demo", ... })`
that auto-passes every check with `score: 95`. To plug in AWS
Rekognition or iProov, swap the `provider:` value in `lib/auth.ts`:

```ts
import { rekognitionProvider } from "expo-passkey-liveness/server";

provider: rekognitionProvider({
  region: process.env.AWS_REGION!,
}),
```

```ts
import { iproovProvider } from "expo-passkey-liveness/server";

provider: iproovProvider({
  apiKey: process.env.IPROOV_API_KEY!,
  secret: process.env.IPROOV_SECRET!,
  baseUrl: "https://eu.rp.secure.iproov.me/api/v2",
}),
```

## License

MIT
