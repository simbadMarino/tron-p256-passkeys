"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Fingerprint, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/auth-client";
import { hexToBytes } from "@tron-p256/wallet-core";
import {
  signDigestWithPasskey,
  type Custody,
  type P256Assertion,
} from "@/lib/passkey-p256";
import {
  encodeExecuteArgs,
  EXECUTE_SIGNATURE,
} from "@tron-p256/wallet-core";
import { base58ToEvmAddress } from "@tron-p256/wallet-core";
import { operationDigestHex } from "@tron-p256/wallet-core";

type Mode = "operation" | "digest";

/**
 * Defaults point at the wallet deployed on Nile, with an operation that is
 * safe to run first: zero value and empty calldata, which reduces to
 * `destination.call{value: 0}("")` and succeeds against any plain address.
 * That exercises signature verification, the nonce and the precompile without
 * the wallet needing to hold any TRX.
 */
const DEFAULT_OP = {
  wallet: "TNJkNz41sh84p3b4HirJc4bNaNgHLgNRr4",
  chainId: "3448148188", // TRON Nile
  destination: "TMpbPJvF2f9gkK6CmWcSRrvJ4cB96qbLie",
  value: "0",
  data: "0x",
  nonce: "0",
  deadline: "4000000000",
};

type Operation = typeof DEFAULT_OP;

interface StoredKey {
  credentialId: string;
  platform: string;
  createdAt: string;
  x: string | null;
  y: string | null;
  aaguid: string | null;
  counter: number;
  error: string | null;
}

/** AAGUIDs distinctive enough to name outright. */
const KNOWN_AAGUIDS: Record<string, string> = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
};

const CUSTODY_COPY: Record<
  Custody,
  { label: string; detail: string; tone: "good" | "warn" }
> = {
  "device-bound": {
    label: "device-bound",
    detail:
      "BE=0 — this key cannot be backed up or synced, and never will be. Fixed at creation.",
    tone: "good",
  },
  "sync-eligible": {
    label: "sync-eligible",
    detail:
      "BE=1, BS=0 — syncable, but no copy exists yet. It can become backed up later without re-registering.",
    tone: "warn",
  },
  synced: {
    label: "synced",
    detail:
      "BE=1, BS=1 — a copy lives in the provider's cloud, so this key's security inherits that account's.",
    tone: "warn",
  },
};

export default function P256Page() {
  const session = useSession();
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [mode, setMode] = useState<Mode>("operation");
  const [op, setOp] = useState<Operation>(DEFAULT_OP);
  const [digestHex, setDigestHex] = useState("");
  const [assertion, setAssertion] = useState<P256Assertion | null>(null);
  const [signedOp, setSignedOp] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The wallet's challenge, computed by the same code the contract's parity
   * test pins against `P256SmartWallet.operationDigest`.
   */
  const opDigest = useMemo(() => {
    try {
      // Addresses are entered the way TRON shows them. The digest has to be
      // taken over the 20-byte form Solidity sees, so decode here — and the
      // base58 checksum means a mistyped address fails loudly instead of
      // producing a digest for some other account.
      return {
        value: operationDigestHex({
          wallet: base58ToEvmAddress(op.wallet),
          chainId: BigInt(op.chainId),
          destination: base58ToEvmAddress(op.destination),
          value: BigInt(op.value),
          data: op.data,
          nonce: BigInt(op.nonce),
          deadline: BigInt(op.deadline),
        }),
        error: null as string | null,
      };
    } catch (e) {
      return {
        value: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [op]);

  const activeDigest = mode === "operation" ? opDigest.value : digestHex;

  // Seed a random digest so the page is immediately usable; a real
  // wallet would put the userOp / transaction hash here.
  useEffect(() => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    setDigestHex(
      "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""),
    );
  }, []);

  const loadKeys = useCallback(async () => {
    const res = await fetch("/api/p256/keys", { credentials: "include" });
    if (!res.ok) return;
    const body = (await res.json()) as { keys: StoredKey[] };
    setKeys(body.keys ?? []);
  }, []);

  useEffect(() => {
    if (session.data) loadKeys();
  }, [session.data, loadKeys]);

  async function handleSign() {
    setBusy(true);
    setError(null);
    setAssertion(null);
    setSignedOp(null);
    try {
      if (!activeDigest) throw new Error(opDigest.error ?? "No digest to sign");
      const digest = hexToBytes(activeDigest);
      const result = await signDigestWithPasskey({
        digest,
        allowCredentialIds: keys.map((k) => k.credentialId),
      });
      setAssertion(result);
      if (mode === "operation") setSignedOp(op);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const signingKey = assertion
    ? keys.find((k) => k.credentialId === assertion.credentialId)
    : null;

  /**
   * Built from the operation that was signed rather than the current form
   * values, so editing a field after signing cannot produce calldata that
   * disagrees with the assertion.
   */
  const submission = useMemo(() => {
    if (!assertion || !signedOp) return null;
    try {
      const auth = {
        authenticatorData: assertion.authenticatorData,
        clientDataJSON: assertion.clientDataJSON,
        challengeIndex: assertion.challengeIndex,
        typeIndex: assertion.typeIndex,
        r: assertion.r,
        s: assertion.s,
      };
      return {
        // JSON.stringify does the escaping that hand-pasting gets wrong.
        tuple: JSON.stringify([
          auth.authenticatorData,
          auth.clientDataJSON,
          auth.challengeIndex,
          auth.typeIndex,
          auth.r,
          auth.s,
        ]),
        // TRON's `parameter` field wants bare hex — a leading 0x makes the
        // node reject the request rather than decode it.
        parameter: encodeExecuteArgs({
          destination: base58ToEvmAddress(signedOp.destination),
          value: BigInt(signedOp.value),
          data: signedOp.data,
          nonce: BigInt(signedOp.nonce),
          deadline: BigInt(signedOp.deadline),
          auth,
        }).replace(/^0x/, ""),
        error: null as string | null,
      };
    } catch (e) {
      return {
        tuple: null,
        parameter: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [assertion, signedOp]);


  if (session.isPending) {
    return (
      <div className="grid min-h-svh place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div className="bg-grain pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-dot opacity-30" />

      <header className="border-b border-border-strong/70 px-6 py-5 lg:px-12">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between">
          <Link
            href={session.data ? "/dashboard" : "/"}
            className="inline-flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="data uppercase tracking-[0.12em]">Back</span>
          </Link>
          <span className="data text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            § p256 · secp256r1 export
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-12 lg:px-12">
        <span className="tag mb-6">§ Export</span>
        <h1 className="display text-[clamp(38px,5vw,64px)]">
          Signature
          <br />
          <span className="display-italic text-phosphor">components</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">
          A passkey created with <code className="data text-foreground">alg -7</code>{" "}
          is a plain secp256r1 keypair, so its assertions verify against a
          P256VERIFY precompile. Pick the digest you want authorised, run the
          ceremony, and take <code className="data text-foreground">r</code>,{" "}
          <code className="data text-foreground">s</code>,{" "}
          <code className="data text-foreground">x</code>,{" "}
          <code className="data text-foreground">y</code> to your wallet
          contract.
        </p>

        {!session.data ? (
          <div className="mt-10 rounded-xl border border-dashed border-border-strong/70 bg-paper/20 p-6">
            <p className="text-[15px]">Sign in to load your public keys.</p>
            <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
              The (x, y) coordinates come from the credential rows bound to
              your account. The signing step itself is pure WebAuthn and never
              touches the auth server.
            </p>
            <Link
              href="/login"
              className="data mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[11px] uppercase tracking-[0.14em] text-background"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            {/* ---- digest input ---- */}
            <section className="mt-12 rounded-xl border border-border-strong bg-paper/30 p-6">
              <div
                role="tablist"
                aria-label="What to sign"
                className="mb-6 grid grid-cols-2 overflow-hidden rounded-full border border-border-strong p-1 text-[12px]"
              >
                <ModeButton
                  active={mode === "operation"}
                  onClick={() => setMode("operation")}
                  label="Wallet operation"
                />
                <ModeButton
                  active={mode === "digest"}
                  onClick={() => setMode("digest")}
                  label="Raw digest"
                />
              </div>

              {mode === "operation" ? (
                <div className="space-y-4">
                  <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                    The challenge becomes{" "}
                    <code className="data text-foreground">operationDigest</code>
                    , so the assertion is cryptographically bound to this exact
                    call. Defaults point at the wallet deployed on Nile,
                    with a zero-value, empty-calldata operation that is safe to
                    run first.
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <OpField label="wallet" value={op.wallet} onChange={(v) => setOp({ ...op, wallet: v })} />
                    <OpField label="chain id" value={op.chainId} onChange={(v) => setOp({ ...op, chainId: v })} />
                    <OpField label="destination" value={op.destination} onChange={(v) => setOp({ ...op, destination: v })} />
                    <OpField label="value (sun)" value={op.value} onChange={(v) => setOp({ ...op, value: v })} />
                    <OpField label="nonce" value={op.nonce} onChange={(v) => setOp({ ...op, nonce: v })} />
                    <OpField label="deadline (unix)" value={op.deadline} onChange={(v) => setOp({ ...op, deadline: v })} />
                  </div>
                  <OpField label="calldata" value={op.data} onChange={(v) => setOp({ ...op, data: v })} />

                  <div className="rounded-md border border-border-strong/60 bg-background/60 px-4 py-3">
                    <p className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      ▌ operation digest · the challenge
                    </p>
                    <code className="data mt-1 block break-all text-[12.5px] text-foreground">
                      {opDigest.value ?? "—"}
                    </code>
                    {opDigest.error ? (
                      <p className="mt-1 text-[12px] text-blood">{opDigest.error}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label
                    htmlFor="digest"
                    className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    ▌ Digest to authorise · 32 bytes
                  </Label>
                  <Input
                    id="digest"
                    value={digestHex}
                    onChange={(e) => setDigestHex(e.target.value.trim())}
                    spellCheck={false}
                    className="data h-12 rounded-md border-border-strong bg-background px-4 text-[12.5px]"
                  />
                  <p className="data text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    ▸ signs arbitrary bytes — nothing binds them to an operation
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleSign}
                disabled={busy || keys.length === 0 || !activeDigest}
                className="group mt-6 inline-flex h-12 items-center justify-between gap-4 rounded-full bg-foreground px-5 text-background transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
              >
                <span className="data text-[12px] uppercase tracking-[0.12em]">
                  {busy ? "Awaiting ceremony…" : "Sign digest with passkey"}
                </span>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-phosphor text-phosphor-foreground">
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Fingerprint className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>

              {keys.length === 0 ? (
                <p className="data mt-4 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  ▸ no credentials bound — register one from the dashboard first
                </p>
              ) : (
                <div className="mt-6 border-t border-border-strong/50 pt-5">
                  <p className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    ▌ bound credentials · registration hints
                  </p>
                  <ul className="mt-3 space-y-2">
                    {keys.map((k) => (
                      <li
                        key={k.credentialId}
                        className="grid gap-1 rounded-md border border-border-strong/60 bg-background/60 px-3 py-2"
                      >
                        <span className="data truncate text-[12px] text-foreground">
                          {k.credentialId.slice(0, 22)}…
                        </span>
                        <span className="data text-[10.5px] text-muted-foreground">
                          ▸ aaguid{" "}
                          <span className="text-foreground">
                            {k.aaguid
                              ? (KNOWN_AAGUIDS[k.aaguid] ?? k.aaguid)
                              : "not recorded"}
                          </span>{" "}
                          · counter{" "}
                          <span className="text-foreground">{k.counter}</span>
                          {k.counter === 0
                            ? " — characteristic of a multi-device credential"
                            : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
                    Hints only. The authoritative signal is the BE bit on an
                    assertion — sign below to read it.
                  </p>
                </div>
              )}
            </section>

            {error ? (
              <div className="mt-8 flex items-start gap-3 rounded-md border border-blood/40 bg-blood/8 px-4 py-3">
                <span className="data mt-0.5 text-[10px] uppercase tracking-[0.16em] text-blood">
                  err
                </span>
                <p className="text-[13px] leading-relaxed text-foreground">
                  {error}
                </p>
              </div>
            ) : null}

            {/* ---- results ---- */}
            {assertion ? (
              <section className="mt-10 space-y-px overflow-hidden rounded-xl border border-border-strong bg-border">
                <div className="bg-background p-6">
                  <h2 className="display text-[26px]">Precompile inputs</h2>
                  <p className="data mt-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    ▸ hash · r · s · x · y
                  </p>
                </div>

                <Row label="hash (signed digest)" value={assertion.digest} />
                <Row label="r" value={assertion.r} />
                <Row
                  label="s"
                  value={assertion.s}
                  note={
                    assertion.sNormalized
                      ? "folded to n − s (low-s form)"
                      : "already low-s"
                  }
                />
                <Row
                  label="x (public key)"
                  value={signingKey?.x ?? "— unknown credential"}
                />
                <Row
                  label="y (public key)"
                  value={signingKey?.y ?? "— unknown credential"}
                />

                <div className="bg-background p-6">
                  <h2 className="display text-[22px]">Contract-side inputs</h2>
                  <p className="data mt-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    ▸ for verifiers that re-derive the digest themselves
                  </p>
                </div>

                <Row label="authenticatorData" value={assertion.authenticatorData} />
                <Row label="clientDataJSON" value={assertion.clientDataJSON} />
                <Row
                  label="challengeIndex / typeIndex"
                  value={`${assertion.challengeIndex} / ${assertion.typeIndex}`}
                />
                <Row
                  label="flags (byte 32)"
                  value={
                    `0x${assertion.flags.raw.toString(16).padStart(2, "0")} · ` +
                    `UP=${assertion.flags.userPresent ? 1 : 0} ` +
                    `UV=${assertion.flags.userVerified ? 1 : 0} ` +
                    `BE=${assertion.flags.backupEligible ? 1 : 0} ` +
                    `BS=${assertion.flags.backupState ? 1 : 0}`
                  }
                  note={
                    assertion.flags.userVerified
                      ? undefined
                      : "UV=0 — presence only, no biometric"
                  }
                />
                <Row label="credentialId" value={assertion.credentialId} />

                <CustodyPanel custody={assertion.custody} />

                {submission ? (
                  <div className="bg-background p-6">
                    <h2 className="display text-[22px]">Ready to submit</h2>
                    <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                      Built from the operation that was signed, so editing the
                      form above will not silently change these. Escaping is
                      applied here rather than by hand — an altered
                      clientDataJSON still passes the challenge check but fails
                      the signature, which is the confusing failure.
                    </p>

                    {submission.error ? (
                      <p className="mt-4 text-[13px] text-blood">
                        {submission.error}
                      </p>
                    ) : (
                      <div className="mt-5 space-y-5">
                        <SubmitField
                          label="auth tuple · paste into a struct field"
                          value={submission.tuple!}
                        />
                        <SubmitField
                          label="function selector"
                          value={EXECUTE_SIGNATURE}
                        />
                        <SubmitField
                          label="parameter · bare hex, no 0x, no selector"
                          value={submission.parameter!}
                        />
                      </div>
                    )}
                  </div>
                ) : null}

              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "data rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.14em] transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function OpField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="data text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        spellCheck={false}
        className="data h-10 rounded-md border-border-strong bg-background px-3 text-[12px]"
      />
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard blocked — the text is selectable anyway */
        }
      }}
      className="data inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border-strong px-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3 w-3 text-phosphor" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "copied" : "copy"}
    </button>
  );
}

function SubmitField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <CopyButton label={label} value={value} />
      </div>
      <pre className="data mt-2 max-h-52 overflow-auto rounded-md border border-border-strong/60 bg-paper/30 p-3 text-[11.5px] leading-relaxed whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}

function CustodyPanel({ custody }: { custody: Custody }) {
  const copy = CUSTODY_COPY[custody];
  const good = copy.tone === "good";
  return (
    <div className="bg-background p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          key custody
        </span>
        <span
          className={[
            "data inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10.5px] uppercase tracking-[0.14em]",
            good
              ? "border-phosphor/50 bg-phosphor/8 text-phosphor"
              : "border-blood/40 bg-blood/8 text-blood",
          ].join(" ")}
        >
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              good ? "bg-phosphor" : "bg-blood",
            ].join(" ")}
          />
          {copy.label}
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        {copy.detail}
      </p>
      {!good ? (
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          BE is immutable for the life of the credential, so a wallet can
          enforce custody on-chain with{" "}
          <code className="data text-foreground">flags &amp; 0x08 == 0</code>.
          On iOS and Android platform passkeys BE is effectively always 1 —
          in practice that check means security keys only, so it is more
          useful as a tier signal than a hard gate.
        </p>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — the value is selectable anyway */
    }
  }

  return (
    <div className="grid gap-3 bg-background p-6 sm:grid-cols-[200px_1fr_auto] sm:items-start">
      <div>
        <span className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {note ? (
          <p className="data mt-1 text-[10.5px] uppercase tracking-[0.1em] text-phosphor">
            {note}
          </p>
        ) : null}
      </div>
      <code className="data block overflow-x-auto whitespace-pre-wrap break-all text-[12.5px] leading-relaxed text-foreground">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="data inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border-strong px-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-foreground hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3 w-3 text-phosphor" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
