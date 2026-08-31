"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Fingerprint,
  Loader2,
  Mail,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  authenticateWithPasskey,
  emailOtp,
  refreshSession,
  signIn,
} from "@/lib/auth-client";
import { getRememberedUserId } from "@/lib/last-user";
import { verifyLivenessWeb } from "@/lib/liveness-web";

type OtpStep = "email" | "code";
type Mode = "passkey" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("passkey");

  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      {/* atmospheric layers */}
      <div className="bg-grain pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-dot opacity-40" />

      {/* split layout */}
      <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
        {/* ============== LEFT — CRYPTO PANEL ============== */}
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border-strong/70 bg-paper/30 p-10 lg:flex">
          <div className="pointer-events-none absolute -left-32 top-1/3 h-[420px] w-[420px] rounded-full bg-phosphor/15 blur-[120px]" />
          <div className="pointer-events-none absolute -right-20 bottom-10 h-[320px] w-[320px] rounded-full bg-blood/10 blur-[100px]" />

          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Sigil />
              <span className="data text-[11px] uppercase tracking-[0.18em]">
                Expo Passkey Kit
              </span>
            </Link>
            <span className="tag tag-phosphor">
              <span className="h-1.5 w-1.5 rounded-full bg-phosphor phosphor-flicker" />
              ceremony pending
            </span>
          </div>

          <div className="relative">
            <CipherDiagram />
          </div>

          <div className="space-y-6">
            <h2 className="display text-[clamp(36px,4vw,60px)]">
              The credential
              <br />
              <span className="display-italic text-phosphor">never leaves</span>
              <br />
              your device.
            </h2>
            <p className="max-w-md text-[14.5px] leading-relaxed text-muted-foreground">
              A liveness token is minted and bound to your origin, then verified
              alongside the WebAuthn assertion. The server only sees that the
              key holder is present — not the key itself.
            </p>

            <div className="data flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>▸ es256</span>
              <span>▸ resident key</span>
              <span>▸ uv = required</span>
              <span>▸ rp = {typeof window !== "undefined" ? window.location.hostname : "epk.app"}</span>
            </div>
          </div>
        </aside>

        {/* ============== RIGHT — AUTH PANEL ============== */}
        <main className="relative flex flex-col">
          {/* top bar */}
          <header className="flex items-center justify-between border-b border-border-strong/60 px-6 py-5 lg:px-12">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="data tracking-[0.12em] uppercase">Back</span>
            </Link>
            <span className="data text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              § auth · session = 00
            </span>
          </header>

          <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12 lg:py-16">
            <div className="w-full max-w-md rise">
              <span className="tag mb-6">§ Sign in</span>

              <h1 className="display text-[clamp(40px,4vw,60px)]">
                Begin the
                <br />
                <span className="display-italic text-phosphor">ceremony</span>.
              </h1>

              <p className="mt-5 max-w-sm text-[14.5px] leading-relaxed text-muted-foreground">
                Passwordless. Use a passkey already bound to this site, or have
                us send a one-time code.
              </p>

              {/* segmented control */}
              <div
                role="tablist"
                aria-label="Sign in method"
                className="mt-10 grid grid-cols-2 overflow-hidden rounded-full border border-border-strong p-1 text-[12px]"
              >
                <ModeButton
                  active={mode === "passkey"}
                  onClick={() => setMode("passkey")}
                  icon={<Fingerprint className="h-3.5 w-3.5" />}
                  label="Passkey"
                />
                <ModeButton
                  active={mode === "otp"}
                  onClick={() => setMode("otp")}
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email code"
                />
              </div>

              <div className="mt-8">
                {mode === "passkey" ? (
                  <PasskeyForm onSuccess={() => router.push("/dashboard")} />
                ) : (
                  <OtpForm onSuccess={() => router.push("/dashboard")} />
                )}
              </div>

              <div className="hr-tick mt-12" />
              <p className="data mt-6 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                ▌ New here?{" "}
                <span className="text-foreground">
                  Choose email first — register a passkey from the dashboard.
                </span>
              </p>
            </div>
          </div>

          <footer className="border-t border-border-strong/60 px-6 py-5 lg:px-12">
            <div className="flex items-center justify-between">
              <p className="data text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                mit · iosazee / epk-example-app
              </p>
              <Link
                href="https://github.com/iosazee/epk-example-app"
                target="_blank"
                rel="noopener noreferrer"
                className="data text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
              >
                source ↗
              </Link>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   Mode button
   ============================================================ */

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "data inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.14em] transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

/* ============================================================
   PASSKEY
   ============================================================ */

function PasskeyForm({ onSuccess }: { onSuccess: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAuthenticate() {
    setBusy(true);
    setError(null);
    try {
      // Read at click time rather than during render — keeps localStorage
      // out of the server-rendered markup.
      const userId = getRememberedUserId();
      if (!userId) {
        setError(
          "This browser has no passkey bound yet. Sign in with an email code once, then register a passkey from the dashboard.",
        );
        return;
      }

      const live = await verifyLivenessWeb({
        challenge: "authentication",
        userId,
      });
      if (live.error || !live.data) {
        setError(live.error?.message ?? "Liveness check failed");
        return;
      }
      const r = await authenticateWithPasskey({
        livenessToken: live.data.livenessToken,
      });
      if (r.error) {
        setError(r.error.message || "Sign in failed");
        return;
      }

      // The ceremony passed and the server set a session cookie, but
      // useSession() is still holding its pre-ceremony value — navigating
      // now lands on a dashboard that reads a stale null and bounces
      // straight back here. Refetch first, and only hand off once a
      // session is actually in hand.
      if (!(await refreshSession())) {
        setError(
          "Passkey verified, but no session came back. Check that the auth cookie is not being blocked for this origin.",
        );
        return;
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        Use Touch ID, Windows Hello, or any platform authenticator already bound
        to this site. Liveness is verified as part of the ceremony.
      </p>

      <button
        type="button"
        onClick={handleAuthenticate}
        disabled={busy}
        className="group inline-flex h-12 w-full items-center justify-between rounded-full bg-foreground px-5 text-background transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
      >
        <span className="data text-[12px] uppercase tracking-[0.12em]">
          {busy ? "Verifying ceremony…" : "Sign in with passkey"}
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-phosphor text-phosphor-foreground transition-transform group-hover:rotate-45">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Fingerprint className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {error ? <ErrorRow message={error} /> : null}
    </div>
  );
}

/* ============================================================
   OTP
   ============================================================ */

function OtpForm({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<OtpStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (r.error) {
        setError(r.error.message ?? r.error.code ?? "Couldn't send code");
        return;
      }
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await signIn.emailOtp({ email, otp });
      if (r.error) {
        setError(r.error.message ?? r.error.code ?? "Invalid code");
        return;
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={handleSend} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            ▌ Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 rounded-full border-border-strong bg-paper px-5 text-[14px]"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !email}
          className="group inline-flex h-12 w-full items-center justify-between rounded-full bg-foreground px-5 text-background transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          <span className="data text-[12px] uppercase tracking-[0.12em]">
            {busy ? "Sending…" : "Send 6-digit code"}
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-phosphor text-phosphor-foreground transition-transform group-hover:rotate-45">
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" />
            )}
          </span>
        </button>

        {error ? <ErrorRow message={error} /> : null}
      </form>
    );
  }

  return (
    <form onSubmit={handleVerify} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="otp" className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          ▌ 6-digit code
        </Label>
        <Input
          id="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
          className="data h-14 rounded-full border-border-strong bg-paper px-5 text-center text-[22px] tracking-[0.4em]"
        />
        <p className="data text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          ▸ sent to <span className="text-foreground">{email}</span> · check
          spam if delayed
        </p>
      </div>

      <button
        type="submit"
        disabled={busy || otp.length !== 6}
        className="group inline-flex h-12 w-full items-center justify-between rounded-full bg-foreground px-5 text-background transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
      >
        <span className="data text-[12px] uppercase tracking-[0.12em]">
          {busy ? "Verifying…" : "Verify and sign in"}
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-phosphor text-phosphor-foreground transition-transform group-hover:rotate-45">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUpRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          setStep("email");
          setOtp("");
          setError(null);
        }}
        disabled={busy}
        className="data block w-full text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
      >
        ↺ Use a different email
      </button>

      {error ? <ErrorRow message={error} /> : null}
    </form>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-blood/40 bg-blood/8 px-4 py-3">
      <span className="data mt-0.5 text-[10px] uppercase tracking-[0.16em] text-blood">
        err
      </span>
      <p className="text-[13px] leading-relaxed text-foreground">{message}</p>
    </div>
  );
}

/* ============================================================
   Sigil + cipher diagram
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

function CipherDiagram() {
  return (
    <div className="relative aspect-square w-full max-w-[460px]">
      {/* ringed orbiter */}
      <svg
        viewBox="0 0 400 400"
        className="orbit-slow absolute inset-0 h-full w-full text-foreground/30"
        aria-hidden="true"
      >
        <circle cx="200" cy="200" r="180" fill="none" stroke="currentColor" strokeDasharray="2 6" />
        <circle cx="200" cy="200" r="140" fill="none" stroke="currentColor" strokeDasharray="4 10" />
        <circle cx="200" cy="200" r="100" fill="none" stroke="currentColor" />
        {Array.from({ length: 24 }).map((_, i) => (
          <line
            key={i}
            x1="200"
            y1="20"
            x2="200"
            y2="32"
            stroke="currentColor"
            strokeWidth={1}
            transform={`rotate(${(i * 360) / 24} 200 200)`}
          />
        ))}
      </svg>

      {/* center fingerprint badge */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative h-32 w-32 rounded-full border border-phosphor/50 bg-paper/80 backdrop-blur">
          <div className="absolute inset-1 rounded-full bg-phosphor/8 phosphor-flicker" />
          <div className="absolute inset-0 grid place-items-center">
            <Fingerprint className="h-12 w-12 text-phosphor" strokeWidth={1.25} />
          </div>
        </div>
      </div>

      {/* hash strip */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border-strong bg-background/80 px-4 py-1.5 backdrop-blur">
        <span className="data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          0x4f1c · ad29 · 7b88 · <span className="text-phosphor">verified</span>
        </span>
      </div>
    </div>
  );
}
