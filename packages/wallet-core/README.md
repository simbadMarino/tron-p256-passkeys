# @tron-p256/wallet-core

Everything both apps need to turn a passkey assertion into something a
`P256SmartWallet` will accept — and nothing that depends on a platform.

Deliberately free of `navigator`, `window`, `crypto.subtle`, `atob`/`btoa` and
`Buffer`, so the same code runs under a browser bundler and under Metro. The
one ceremony that *is* platform-specific — asking the authenticator to sign —
stays in each app:

| | |
|---|---|
| web | `apps/web/lib/passkey-p256.ts` — `navigator.credentials.get()` |
| mobile | `apps/mobile/lib/passkey-p256-native.ts` — expo-passkey's native module |

The reason this is a package rather than a copied file: `operationDigest` must
agree byte-for-byte with `P256SmartWallet.operationDigest` in Solidity. Two
implementations of that in one repo is a drift hazard where signatures start
failing and the crypto looks blameless. One implementation cannot drift from
itself.
