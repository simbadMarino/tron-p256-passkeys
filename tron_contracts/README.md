# P256 passkey wallet (demo)

A minimal smart wallet authorised by a **WebAuthn passkey**, verified on-chain
through the `P256VERIFY` precompile at `0x100`.

> Not audited. Do not use for real funds.

## The one idea worth understanding

A passkey never signs your payload. It signs

```
sha256(authenticatorData ‖ sha256(clientDataJSON))
```

and your payload appears only base64url-encoded *inside* `clientDataJSON`.

So verifying the signature proves someone holds the key — **not** that they
approved this particular operation. `operationDigest` therefore stops being
the thing that gets verified and becomes the **challenge** the assertion must
be bound to. `WebAuthn.verify` re-encodes the expected challenge and checks it
appears at `challengeIndex` in the signed `clientDataJSON`.

Drop that check and every assertion the user ever produced on this rpId
authorises anything. It is the whole security of the design.

## Layout

| File                        | Role                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| `contracts/P256.sol`            | Precompile shim. Rejects high-s; fails closed when `0x100` is absent. |
| `contracts/WebAuthn.sol`        | Challenge binding, `type` check, UP/UV flags, digest reconstruction.  |
| `contracts/P256SmartWallet.sol` | Nonce, deadline, and the authorised call.                              |
| `contracts/ChainContext.sol`    | Test-only `block.chainid` probe. Never deploy from a migration.        |

## Network support

`P256VERIFY` requires the Osaka feature set:

```bash
curl -s https://nile.trongrid.io/wallet/getchainparameters \
  | grep -A1 getAllowTvmOsaka
```

TRON Mainnet & **Nile** have it (`1`). 

## Digest parity

`packages/wallet-core/src/wallet-op.ts` and `P256SmartWallet.operationDigest`
are two implementations of one spec. Add a field on one side and every
signature silently stops verifying, with the crypto looking blameless.

`test/operation-digest-parity.js` is the guard. It deploys the wallet, calls
`operationDigest` on-chain, and compares the result against the TypeScript
over a set of vectors — no stored fixtures, so there is nothing to regenerate
and nothing that can go stale. It also checks `OPERATION_TYPEHASH` directly,
which is where drift usually starts.

It needs a node. The `development` network in `tronbox-config.js` points at
the TronBox Runtime Environment:

```bash
docker run -d --name tron-tre -p 9090:9090 tronbox/tre
```

Then, from the repo root:

```bash
npm run test:contracts
```

That builds `packages/wallet-core` to CommonJS first — `tronbox test` runs
JavaScript only, and the digest lives in TypeScript — then runs the suite.

`ChainContext.sol` exists only for this test. `operationDigest` folds
`block.chainid` in without exposing it, so the test reads it through the same
opcode rather than hardcoding Nile's `3448148188` and quietly comparing the
wrong number on a local node. Never deploy it from a migration.

## Known limits

- **One immutable key.** No rotation, no recovery. Losing the passkey loses the
  wallet. 
- **Custody is invisible to the contract.** A synced passkey (`BE=1`) also
  lives in the provider's cloud. The BE flag is available in
  `authenticatorData` and is immutable per credential, but this wallet does not
  gate on it — on platform passkeys BE is effectively always 1, so a hard gate
  would reject every mainstream authenticator. It is useful as a tier signal.
- **No fee abstraction.** Someone must pay energy to call `execute`; that is
  the relayer's job and is out of scope here.
