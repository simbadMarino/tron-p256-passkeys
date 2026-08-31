"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cpu,
  Fingerprint,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  getSession,
  refreshSession,
  registerPasskey,
  signOut,
  useSession,
} from "@/lib/auth-client";
import { rememberUserId } from "@/lib/last-user";
import { verifyLivenessWeb } from "@/lib/liveness-web";

/**
 * expo-passkey wraps non-Error fetch failures via `String(err)`, which
 * turns the BetterFetch error envelope into the literal "[object Object]".
 * Walk a few common shapes to surface something useful regardless of how
 * the error was thrown.
 */
function formatError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err || fallback;

  const candidates: unknown[] = [];
  const seen = new WeakSet<object>();
  function visit(node: unknown, depth: number) {
    if (depth > 4 || node == null) return;
    if (typeof node === "string") {
      candidates.push(node);
      return;
    }
    if (typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const obj = node as Record<string, unknown>;
    // Most common nested error fields, in priority order.
    for (const key of ["message", "error", "body", "data", "code", "statusText"]) {
      if (key in obj) visit(obj[key], depth + 1);
    }
  }
  visit(err, 0);

  for (const c of candidates) {
    if (typeof c === "string" && c.trim() && c !== "[object Object]") {
      return c;
    }
  }

  try {
    const json = JSON.stringify(err);
    if (json && json !== "{}") return json;
  } catch {
    /* fall through */
  }
  return fallback;
}

interface PasskeyRow {
  id: string;
  credentialId: string;
  platform: string;
  lastUsed: string;
  createdAt: string;
  metadata: {
    liveness?: {
      provider?: string;
      score?: number;
      padLevel?: string;
      registeredModality?: string;
    };
  } | null;
}

interface LivenessRow {
  id: string;
  provider: string;
  status: string;
  score: number | null;
  challenge: string;
  createdAt: string;
}

export default function DashboardPage() {
  const session = useSession();
  const router = useRouter();
  const user = session.data?.user ?? null;

  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [livenessSessions, setLivenessSessions] = useState<LivenessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.isPending || session.data || session.error) return;

    // A `null` here is not proof of being signed out — it can be a value
    // the store cached before a passkey sign-in, which Better Auth never
    // invalidates (see refreshSession in lib/auth-client.ts). Confirm
    // against the server before bouncing, or we ping-pong with /login.
    let cancelled = false;
    (async () => {
      const fresh = await getSession();
      if (cancelled) return;
      if (fresh.data) {
        await refreshSession();
        return;
      }
      router.replace("/login");
    })();
    return () => {
      cancelled = true;
    };
  }, [session.isPending, session.data, session.error, router]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [pkRes, lsRes] = await Promise.all([
        fetch("/api/debug/passkeys", { credentials: "include" }),
        fetch("/api/debug/liveness-sessions", { credentials: "include" }),
      ]);
      const pk = pkRes.ok
        ? ((await pkRes.json()) as { passkeys: PasskeyRow[] })
        : { passkeys: [] };
      const ls = lsRes.ok
        ? ((await lsRes.json()) as { sessions: LivenessRow[] })
        : { sessions: [] };
      setPasskeys(pk.passkeys ?? []);
      setLivenessSessions(ls.sessions ?? []);

      // Seed the sign-in hint as soon as we know this browser has a
      // credential to offer. Covers the case where the passkey was bound
      // elsewhere and synced in (iCloud Keychain, Google Password
      // Manager), so registration never ran here to write it.
      if ((pk.passkeys ?? []).length > 0 && user) {
        rememberUserId(user.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleRegisterPasskey() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const live = await verifyLivenessWeb({ challenge: "registration" });
      if (live.error || !live.data) {
        setError(formatError(live.error, "Liveness check failed"));
        return;
      }
      const r = await registerPasskey({
        userId: user.id,
        userName: user.email,
        displayName: user.name ?? user.email,
        rpId: window.location.hostname,
        rpName: "EPK Example",
        livenessToken: live.data.livenessToken,
      });
      if (r.error) {
        setError(formatError(r.error, "Passkey registration failed"));
        return;
      }
      // The login screen needs this id to open an authentication
      // liveness session — see lib/last-user.ts.
      rememberUserId(user.id);
      await refresh();
    } catch (e) {
      setError(formatError(e, "Passkey registration failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  const verifiedCount = useMemo(
    () => livenessSessions.filter((s) => s.status === "verified").length,
    [livenessSessions]
  );
  const avgScore = useMemo(() => {
    const scored = livenessSessions.filter((s) => typeof s.score === "number");
    if (!scored.length) return null;
    return (
      scored.reduce((a, s) => a + (s.score ?? 0), 0) / scored.length
    ).toFixed(2);
  }, [livenessSessions]);

  if (session.isPending || !user) {
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
      <div className="pointer-events-none absolute -left-40 top-0 -z-10 h-[420px] w-[420px] rounded-full bg-phosphor/8 blur-[140px]" />

      {/* ============== HEADER ============== */}
      <header className="sticky top-0 z-20 border-b border-border-strong/70 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Sigil />
            <div className="flex items-baseline gap-2">
              <span className="data text-[13px] tracking-[0.18em] uppercase">
                EPK · Ledger
              </span>
              <span className="data text-[11px] text-muted-foreground">
                / dashboard
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-phosphor phosphor-flicker" />
              <span className="data text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                session · {user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="data inline-flex h-8 items-center gap-2 rounded-full border border-border-strong px-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:border-blood hover:text-blood"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ============== MAIN ============== */}
      <main className="mx-auto max-w-[1320px] px-6 py-10 md:py-14">
        {/* WELCOME */}
        <section className="rise grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <span className="tag tag-phosphor">
              <span className="h-1.5 w-1.5 rounded-full bg-phosphor phosphor-flicker" />
              authenticated
            </span>
            <h1 className="display mt-6 text-[clamp(44px,6vw,84px)]">
              Welcome back,
              <br />
              <span className="display-italic text-phosphor">
                {user.name ?? user.email.split("@")[0]}
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              {passkeys.length === 0
                ? "You're signed in via email OTP. Bind a passkey to skip the email step next time — the ceremony writes an audit slice to "
                : "Below is the audit trail emitted by "}
              <code className="data text-foreground">
                /expo-passkey/liveness/verify
              </code>
              {passkeys.length === 0
                ? "."
                : ", with one row per ceremony. Add another passkey to bind a new device."}
            </p>
          </div>

          {/* primary action card — empty-state CTA flips to a bound-passkey
              summary once the user has registered at least one credential. */}
          {passkeys.length === 0 ? (
            <div className="relative overflow-hidden rounded-xl border border-border-strong bg-paper/40 p-6">
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-phosphor/12 blur-3xl" />
              <span className="tag">§ Action</span>
              <h3 className="mt-5 text-[20px] leading-tight">
                Bind a new passkey to this device.
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                Runs liveness · creates credential · writes audit slice.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleRegisterPasskey}
                  disabled={busy}
                  className="group inline-flex h-11 items-center justify-between gap-3 rounded-full bg-phosphor px-5 text-phosphor-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
                >
                  <span className="data text-[11px] uppercase tracking-[0.14em] font-bold">
                    {busy ? "Registering ceremony…" : "Register passkey"}
                  </span>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-phosphor-foreground/15">
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Fingerprint className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={loading}
                  className="data inline-flex h-11 items-center gap-2 rounded-full border border-border-strong px-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                  Refresh
                </button>
              </div>
            </div>
          ) : (
            <BoundSummary
              passkeys={passkeys}
              busy={busy}
              loading={loading}
              onAddAnother={handleRegisterPasskey}
              onRefresh={refresh}
            />
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

        {/* ============== STATS LEDGER ============== */}
        <section className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-strong bg-border md:grid-cols-4">
          <Stat
            k="A1"
            label="Bound credentials"
            value={passkeys.length.toString().padStart(2, "0")}
            sub="WebAuthn ES256"
            icon={<KeyRound className="h-3.5 w-3.5" />}
          />
          <Stat
            k="A2"
            label="Liveness sessions"
            value={livenessSessions.length.toString().padStart(2, "0")}
            sub={`${verifiedCount} verified`}
            icon={<Activity className="h-3.5 w-3.5" />}
          />
          <Stat
            k="A3"
            label="Mean PAD score"
            value={avgScore ?? "—"}
            sub="auto-pass · L1"
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
          />
          <Stat
            k="A4"
            label="RP host"
            value={
              typeof window !== "undefined"
                ? window.location.hostname.replace("www.", "")
                : "—"
            }
            sub="origin-bound"
            icon={<Cpu className="h-3.5 w-3.5" />}
          />
        </section>

        {/* ============== PASSKEYS PANEL ============== */}
        <section className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border-strong bg-border lg:grid-cols-[1.4fr_1fr]">
          {/* Passkeys */}
          <div className="bg-background p-7">
            <PanelHeader
              n="§ 01"
              title="Bound passkeys"
              sub="device credentials with attached liveness audit"
            />

            <div className="mt-6">
              {loading ? (
                <Skeleton rows={2} />
              ) : passkeys.length === 0 ? (
                <EmptyState
                  title="No credentials bound yet."
                  body="Register a passkey above — the ceremony binds it to this device and writes a liveness audit slice."
                />
              ) : (
                <ul className="divide-y divide-border-strong/40">
                  {passkeys.map((p, i) => (
                    <PasskeyEntry key={p.id} row={p} idx={i} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Liveness audit */}
          <div className="bg-background p-7">
            <PanelHeader
              n="§ 02"
              title="Liveness audit"
              sub={
                <>
                  ▸ <code className="data">/expo-passkey/liveness/verify</code>
                </>
              }
            />

            <div className="mt-6">
              {loading ? (
                <Skeleton rows={4} />
              ) : livenessSessions.length === 0 ? (
                <EmptyState
                  title="No sessions yet."
                  body="They appear here after registering a passkey or signing in with one."
                />
              ) : (
                <ol className="space-y-2">
                  {livenessSessions.slice(0, 8).map((s) => (
                    <LivenessEntry key={s.id} row={s} />
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>

        <footer className="mt-12 flex flex-col gap-3 border-t border-border-strong/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="data text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            mit · iosazee / epk-example-app
          </p>
          <div className="flex items-center gap-5">
            <Link
              href="/p256"
              className="data text-[10px] uppercase tracking-[0.16em] text-phosphor hover:text-foreground"
            >
              export r/s for p256verify →
            </Link>
            <Link
              href="https://github.com/iosazee/expo-passkey"
              target="_blank"
              rel="noopener noreferrer"
              className="data text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
            >
              expo-passkey ↗
            </Link>
            <Link
              href="https://github.com/iosazee/expo-passkey-liveness"
              target="_blank"
              rel="noopener noreferrer"
              className="data text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
            >
              expo-passkey-liveness ↗
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */

function Sigil() {
  return (
    <span className="relative inline-grid h-7 w-7 place-items-center">
      <span className="absolute inset-0 rounded-md border border-foreground/70" />
      <span className="absolute inset-1 rounded-sm bg-phosphor/80 phosphor-flicker" />
      <span className="relative data text-[10px] font-bold text-phosphor-foreground">
        EPK
      </span>
    </span>
  );
}

function BoundSummary({
  passkeys,
  busy,
  loading,
  onAddAnother,
  onRefresh,
}: {
  passkeys: PasskeyRow[];
  busy: boolean;
  loading: boolean;
  onAddAnother: () => void;
  onRefresh: () => void;
}) {
  const count = passkeys.length;
  const preview = passkeys.slice(0, 3);
  return (
    <div className="relative overflow-hidden rounded-xl border border-border-strong bg-paper/40 p-6">
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-phosphor/12 blur-3xl" />
      <div className="flex items-center justify-between">
        <span className="tag tag-phosphor">
          <span className="h-1.5 w-1.5 rounded-full bg-phosphor phosphor-flicker" />
          bound
        </span>
        <span className="data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {count} credential{count === 1 ? "" : "s"}
        </span>
      </div>

      <h3 className="mt-5 text-[20px] leading-tight">
        This device is{" "}
        <span className="text-phosphor">passkey-ready</span>.
      </h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        Sign out and sign back in via the{" "}
        <span className="text-foreground">Passkey</span> tab — no email needed.
      </p>

      <ul className="mt-5 space-y-2">
        {preview.map((p, i) => {
          const liveness = p.metadata?.liveness;
          return (
            <li
              key={p.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-border-strong/60 bg-background/60 px-3 py-2"
            >
              <span className="data text-[10px] text-phosphor tracking-[0.1em]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="data truncate text-[12px]">
                  <span className="inline-flex items-center gap-1 rounded-sm bg-paper px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.12em] text-foreground">
                    {p.platform}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {p.credentialId.slice(0, 14)}…
                  </span>
                </p>
                {liveness ? (
                  <p className="data mt-0.5 text-[10.5px] text-muted-foreground">
                    ▸ {liveness.provider} · score{" "}
                    <span className="text-phosphor">{liveness.score}</span> ·{" "}
                    {liveness.padLevel}
                  </p>
                ) : null}
              </div>
              <span className="data shrink-0 text-[10px] text-muted-foreground">
                {new Date(p.createdAt).toLocaleDateString()}
              </span>
            </li>
          );
        })}
        {count > preview.length ? (
          <li className="data px-3 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            + {count - preview.length} more in the ledger below
          </li>
        ) : null}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onAddAnother}
          disabled={busy}
          className="data inline-flex h-10 items-center gap-2 rounded-full border border-phosphor/60 bg-phosphor/8 px-4 text-[11px] uppercase tracking-[0.14em] text-phosphor hover:bg-phosphor/15 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Fingerprint className="h-3.5 w-3.5" />
          )}
          {busy ? "Registering…" : "Add another"}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="data inline-flex h-10 items-center gap-2 rounded-full border border-border-strong px-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          Refresh
        </button>
      </div>
    </div>
  );
}

function Stat({
  k,
  label,
  value,
  sub,
  icon,
}: {
  k: string;
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group relative bg-background p-6 transition-colors hover:bg-paper/40">
      <div className="flex items-center justify-between">
        <span className="data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <span className="inline-grid h-6 w-6 place-items-center rounded-md border border-border-strong text-muted-foreground transition-colors group-hover:border-phosphor group-hover:text-phosphor">
          {icon}
        </span>
      </div>
      <p className="data mt-5 text-[28px] leading-none tracking-tight">
        {value}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="data text-[11px] text-muted-foreground tracking-[0.04em]">
          {sub}
        </span>
        <span className="data text-[10px] text-phosphor">{k}</span>
      </div>
    </div>
  );
}

function PanelHeader({
  n,
  title,
  sub,
}: {
  n: string;
  title: string;
  sub: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="data text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {n}
        </span>
      </div>
      <h2 className="display mt-3 text-[clamp(26px,3vw,38px)]">{title}</h2>
      <p className="data mt-2 text-[11.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {sub}
      </p>
      <div className="hr-tick mt-5" />
    </div>
  );
}

function PasskeyEntry({ row, idx }: { row: PasskeyRow; idx: number }) {
  const liveness = row.metadata?.liveness;
  return (
    <li className="group flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex items-start gap-4">
        <span className="data mt-1 text-[10px] text-phosphor tracking-[0.1em]">
          {String(idx + 1).padStart(2, "0")}
        </span>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="data inline-flex items-center gap-1 rounded-sm bg-paper px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.12em] text-foreground">
              {row.platform}
            </span>
            <span className="data text-[12px] text-muted-foreground">
              {row.credentialId.slice(0, 22)}…
            </span>
          </div>
          {liveness ? (
            <p className="data text-[11.5px] text-muted-foreground">
              ▸ via{" "}
              <span className="text-foreground">{liveness.provider}</span> ·
              score{" "}
              <span className="text-phosphor">{liveness.score}</span> ·{" "}
              {liveness.padLevel}
              {liveness.registeredModality ? (
                <> · modality {liveness.registeredModality}</>
              ) : null}
            </p>
          ) : (
            <p className="data text-[11.5px] text-muted-foreground italic">
              ▸ no liveness slice
            </p>
          )}
        </div>
      </div>
      <span className="data shrink-0 text-[11px] text-muted-foreground">
        {new Date(row.createdAt).toLocaleString()}
      </span>
    </li>
  );
}

function LivenessEntry({ row }: { row: LivenessRow }) {
  const accent =
    row.status === "verified"
      ? "text-phosphor border-phosphor/40 bg-phosphor/8"
      : row.status === "failed"
      ? "text-blood border-blood/40 bg-blood/8"
      : "text-muted-foreground border-border-strong bg-paper/40";

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-border-strong/60 bg-paper/30 px-3 py-2">
      <span
        className={[
          "data inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em]",
          accent,
        ].join(" ")}
      >
        {row.status}
      </span>
      <div className="min-w-0">
        <p className="data truncate text-[12px]">
          <span className="text-foreground">{row.challenge}</span>
          <span className="text-muted-foreground"> · {row.provider}</span>
          <span className="text-muted-foreground">
            {" "}
            · score {row.score ?? "—"}
          </span>
        </p>
      </div>
      <span className="data shrink-0 text-[10.5px] text-muted-foreground">
        {new Date(row.createdAt).toLocaleTimeString()}
      </span>
    </li>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border-strong/60 bg-paper/20 p-6">
      <span className="data text-[10px] uppercase tracking-[0.16em] text-phosphor">
        ▌ empty
      </span>
      <p className="text-[15px] leading-tight">{title}</p>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-md bg-paper/40"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
