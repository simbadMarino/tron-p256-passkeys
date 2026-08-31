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
| `src/P256.sol`            | Precompile shim. Rejects high-s; fails closed when `0x100` is absent. |
| `src/WebAuthn.sol`        | Challenge binding,`type` check, UP/UV flags, digest reconstruction.   |
| `src/P256SmartWallet.sol` | Nonce, deadline, and the authorised call.                               |

## Network support

`P256VERIFY` requires the Osaka feature set:

```bash
curl -s https://nile.trongrid.io/wallet/getchainparameters \
  | grep -A1 getAllowTvmOsaka
```

TRON **Nile** has it (`1`). TRON **mainnet** did not at the time of writing
(`0`), where `0x100` has no code. `P256.verify` returns `false` there rather
than `true` — a staticcall to a codeless address succeeds with empty
returndata, so the `out.length == 32` check is what makes an absent precompile
reject everything instead of accepting everything.

## Digest parity

`apps/web/lib/wallet-op.ts` and `P256SmartWallet.operationDigest` are two
implementations of one spec, and nothing in either language enforces that they
agree. Add a field on one side and every signature silently stops verifying,
with the crypto looking blameless.

`test/DigestParity.t.sol` is the guard. Its vectors carry digests computed by
the TypeScript; the test recomputes each one on-chain. Regenerate them after
changing either side:

```bash
npm run gen:fixture
```

## Known limits

- **One immutable key.** No rotation, no recovery. Losing the passkey loses the
  wallet. Multiple registered signers is the fix, and is far easier to design
  in now than to retrofit onto `immutable publicKeyX`.
- **Custody is invisible to the contract.** A synced passkey (`BE=1`) also
  lives in the provider's cloud. The BE flag is available in
  `authenticatorData` and is immutable per credential, but this wallet does not
  gate on it — on platform passkeys BE is effectively always 1, so a hard gate
  would reject every mainstream authenticator. It is useful as a tier signal.
- **No fee abstraction.** Someone must pay energy to call `execute`; that is
  the relayer's job and is out of scope here.
