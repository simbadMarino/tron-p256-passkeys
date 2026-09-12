# End-to-end flow

How one passkey becomes a wallet that signs its own transactions, from an
empty database to an executed on-chain call.

Two diagrams: the phases first, then the full ceremony with every message.

## The short version

```mermaid
flowchart TD
    S["0 · Setup<br/>.env + db:push"] --> A

    A["1 · Email OTP sign-in<br/>identifies the user"] --> B
    B["2 · Passkey registration<br/>creates the P-256 keypair"] --> C
    C["3 · Export x, y<br/>from the stored COSE key"] --> D
    D["4 · Deploy P256SmartWallet<br/>x, y, requireUv are immutable"] --> E
    E["5 · Read nonce from the wallet"] --> F
    F["6 · Build operation digest<br/>and sign it with the passkey"] --> G
    G["7 · Broadcast execute<br/>chain verifies and calls out"]

    style S fill:#1e293b,stroke:#475569,color:#e2e8f0
    style D fill:#7f1d1d,stroke:#ef4444,color:#fee2e2
    style G fill:#14532d,stroke:#22c55e,color:#dcfce7
```

The one idea worth holding on to: **the wallet is bound to the passkey at
deploy time and never again**. Steps 1–3 produce `x` and `y`; step 4 burns
them into an immutable contract; steps 5–7 prove possession of the matching
private key on every call.

## The full ceremony

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant B as Browser (Next.js + wallet-core)
    participant S as Better Auth + Postgres
    participant M as Email (Resend or console)
    participant A as Authenticator (Touch ID)
    participant T as TronBox
    participant N as TRON Nile (wallet + 0x100)

    Note over U,N: Phase 1 — Email OTP sign-in

    U->>B: open /login, enter email
    B->>S: send verification OTP
    S->>M: 6-digit code
    M-->>U: code (server console if no RESEND_API_KEY)
    U->>B: enter code
    B->>S: verify OTP
    S->>S: create user + session rows
    S-->>B: session cookie

    Note over U,N: Phase 2 — Passkey registration

    U->>B: /dashboard, click Register passkey
    B->>S: request registration options
    S-->>B: challenge, rpId, alg -7 (ES256)
    B->>A: navigator.credentials.create
    A->>U: biometric prompt
    U-->>A: Touch ID / PIN
    A-->>B: credentialId, COSE public key, flags
    B->>S: submit attestation
    S->>S: verify challenge, origin, rpIdHash
    S->>S: store credential row
    S-->>B: registered

    Note over U,N: Phase 3 — Export the public key

    U->>B: open /p256
    B->>S: GET /api/p256/keys
    S->>S: decode COSE_Key → EC2, P-256, alg -7
    S-->>B: x, y per credential
    B-->>U: x, y (non-ES256 rows report an error instead)

    Note over U,N: Phase 4 — Deploy the wallet

    U->>T: put x, y, requireUv in 2_deploy_contracts.js
    T->>N: deploy P256SmartWallet(x, y, requireUv)
    N-->>U: contract address
    Note over N: x, y and requireUv are immutable.<br/>No rotation, no recovery.

    Note over U,N: Phase 5 — Sign an operation

    U->>N: read nonce()
    N-->>U: current nonce
    U->>B: wallet address, chainId 3448148188,<br/>destination, value, data, nonce, deadline
    B->>B: operationDigest = keccak256(abi.encode(...))
    B->>A: navigator.credentials.get, challenge = digest
    A->>U: biometric prompt
    U-->>A: Touch ID / PIN
    A-->>B: authenticatorData, clientDataJSON, signature
    B->>B: parse r, s → normalise to low-s
    B->>B: encode execute calldata as bare hex

    Note over U,N: Phase 6 — Execute on-chain

    U->>N: broadcast execute(...) via broadcast.js
    N->>N: nonce and deadline check
    N->>N: recompute digest from address(this) + block.chainid
    N->>N: WebAuthn: UP flag, UV if required,<br/>type == webauthn.get, challenge matches
    N->>N: sha256(authData ‖ sha256(clientDataJSON))
    N->>N: P256VERIFY at 0x100
    N->>N: nonce++ then destination.call
    N-->>U: Executed event
```

## Steps that are easy to miss

The five phases people usually list leave these out, and each one breaks the
flow silently if skipped:

| Step | Why it matters |
|---|---|
| `npm run db:push` before first sign-in | Better Auth writes to tables that do not exist yet; the OTP step fails with a database error, not an auth error. |
| **Reading `nonce()` before signing** | The digest commits to the nonce. Sign against a stale one and the signature is valid but `execute` reverts with `InvalidNonce`. |
| Choosing `requireUv` at deploy time | It is immutable. Deploying with `false` means a bare tap can move funds, and the only fix is redeploying. |
| The `deadline` | Also inside the digest. A past deadline reverts with `OperationExpired` no matter how good the signature is. |
| Low-s normalisation | The precompile rejects high-s signatures. Authenticators emit either form, so the browser folds `s` to `n - s` before encoding. |
| `RP_ID` chosen before deploying | A different rpId means a different credential, a different `x`/`y`, and a wallet that no longer matches. |

## What the passkey actually signs

Worth being explicit, because it is the one place this differs from a raw
P-256 wallet: the passkey never signs your operation digest. It signs

```
sha256(authenticatorData ‖ sha256(clientDataJSON))
```

so the operation digest travels as the **challenge** inside `clientDataJSON`.
The contract re-derives the digest itself and checks that the challenge in
the assertion matches. That is what binds a signature to one wallet, one
chain, one nonce.

The off-chain and on-chain digests agreeing is enforced by
`tron_contracts/test/operation-digest-parity.js` — see
[the contracts README](../tron_contracts/README.md#digest-parity).
