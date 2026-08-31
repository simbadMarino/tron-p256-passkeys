import Link from "next/link";
import {
  ArrowUpRight,
  Camera,
  Fingerprint,
  KeyRound,
  Layers,
  Mail,
  Smartphone,
} from "lucide-react";

function Github(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.39.97 0 1.95.13 2.86.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.73.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="relative overflow-hidden bg-background">
      {/* atmospheric layers */}
      <div className="bg-grain pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-dot opacity-60" />
      <div className="pointer-events-none absolute -left-40 top-[-180px] -z-10 h-[520px] w-[520px] rounded-full bg-phosphor/12 blur-[140px]" />
      <div className="pointer-events-none absolute -right-40 top-[28%] -z-10 h-[420px] w-[420px] rounded-full bg-blood/12 blur-[140px]" />

      {/* ============== NAV ============== */}
      <header className="sticky top-0 z-20 border-b border-border-strong/70 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Sigil />
            <div className="flex items-baseline gap-2">
              <span className="data text-[13px] tracking-[0.18em] uppercase">
                Expo Passkey Kit
              </span>
              <span className="data text-[11px] text-muted-foreground">
                / v0.1.0-α
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            <a
              href="#ledger"
              className="data text-[11px] tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
            >
              Ledger
            </a>
            <a
              href="#primitives"
              className="data text-[11px] tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
            >
              Primitives
            </a>
            <a
              href="#sequence"
              className="data text-[11px] tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
            >
              Sequence
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="https://github.com/iosazee/epk-example-app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-strong px-3 text-[12px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" />
              <span className="data tracking-[0.1em]">Source</span>
            </Link>
            <Link
              href="/login"
              className="group inline-flex h-9 items-center gap-2 rounded-full bg-phosphor px-4 text-[12px] font-medium text-phosphor-foreground transition-transform hover:-translate-y-px"
            >
              <span className="data tracking-[0.1em] uppercase">Enter demo</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:rotate-45" />
            </Link>
          </div>
        </div>
      </header>

      {/* ============== HERO ============== */}
      <section className="relative">
        <div className="mx-auto max-w-[1320px] px-6 pt-16 pb-24 md:pt-24 md:pb-32">
          <div className="grid gap-14 lg:grid-cols-[1.15fr_1fr]">
            {/* left — display */}
            <div className="rise">
              <div className="mb-8 flex items-center gap-3">
                <span className="tag tag-phosphor">
                  <span className="h-1.5 w-1.5 rounded-full bg-phosphor phosphor-flicker" />
                  Reference monorepo · live
                </span>
              </div>

              <h1 className="display text-[clamp(58px,9vw,140px)]">
                <span className="block">Passkeys.</span>
                <span className="block display-italic text-phosphor">
                  Face liveness.
                </span>
                <span className="block">End to end.</span>
              </h1>

              <div className="mt-10 grid max-w-2xl gap-5 text-[15.5px] leading-relaxed text-muted-foreground">
                <p>
                  A reference deployment of{" "}
                  <code className="data rounded-sm bg-paper px-1.5 py-0.5 text-foreground">
                    expo-passkey
                  </code>{" "}
                  &amp;{" "}
                  <code className="data rounded-sm bg-paper px-1.5 py-0.5 text-foreground">
                    expo-passkey-liveness
                  </code>
                  . One Better Auth backend, two clients — web and native — both
                  running real WebAuthn ceremonies gated by face PAD.
                </p>
                <p>
                  No passwords are ever stored. The audit slice is written to{" "}
                  <code className="data text-foreground">
                    passkey.metadata.liveness
                  </code>
                  .
                </p>
              </div>

              <div className="mt-12 flex flex-wrap items-center gap-4">
                <Link
                  href="/login"
                  className="group inline-flex h-12 items-center gap-3 rounded-full bg-foreground px-6 text-background transition-transform hover:-translate-y-0.5"
                >
                  <span className="data text-[12px] tracking-[0.12em] uppercase">
                    Try the demo
                  </span>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-phosphor text-phosphor-foreground transition-transform group-hover:rotate-45">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
                <Link
                  href="https://github.com/iosazee/epk-example-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-border-strong px-5 text-[13px] hover:border-foreground"
                >
                  <Github className="h-4 w-4" />
                  <span className="data tracking-[0.06em]">
                    iosazee / epk-example-app
                  </span>
                </Link>
              </div>
            </div>

            {/* right — terminal card */}
            <div className="rise [animation-delay:120ms]">
              <TerminalCard />
            </div>
          </div>

          {/* ============== Ledger strip ============== */}
          <div
            id="ledger"
            className="mt-20 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-strong bg-border md:grid-cols-4"
          >
            <Stat k="01" label="Backend" value="Next.js + Better Auth" sub="single source of truth" />
            <Stat k="02" label="Clients" value="Web · iOS · Android" sub="one passkey table" />
            <Stat k="03" label="Crypto" value="WebAuthn / FIDO2" sub="platform authenticators" />
            <Stat k="04" label="PAD" value="ISO 30107 Level 1" sub="auto-pass demo provider" />
          </div>
        </div>
      </section>

      {/* ============== PRIMITIVES ============== */}
      <section id="primitives" className="relative border-t border-border-strong/70">
        <div className="mx-auto max-w-[1320px] px-6 py-24 md:py-32">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="tag">§ Primitives</span>
              <h2 className="display mt-6 text-[clamp(40px,5.5vw,72px)]">
                Six things this
                <br />
                stack <span className="display-italic text-phosphor">does well</span>.
              </h2>
            </div>
            <p className="data max-w-sm text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
              ▌ Each primitive maps to a concrete file and an endpoint. Read the
              source — nothing is hand-waved.
            </p>
          </div>

          <div className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border-strong bg-border md:grid-cols-2 lg:grid-cols-3">
            <Primitive
              n="01"
              icon={<Fingerprint className="h-4 w-4" />}
              title="Cross-platform passkeys"
              body={
                <>
                  <code className="data">expo-passkey</code> drives WebAuthn on
                  web, iOS 16+ and Android 10+ against a single unified passkey
                  table. Touch ID, Windows Hello, Face ID, fingerprint — same
                  code path.
                </>
              }
            />
            <Primitive
              n="02"
              icon={<Camera className="h-4 w-4" />}
              title="Face liveness gating"
              body={
                <>
                  <code className="data">expo-passkey-liveness</code> validates
                  a signed liveness token on register &amp; authenticate. Audit
                  slice lands on{" "}
                  <code className="data">passkey.metadata.liveness</code>.
                </>
              }
            />
            <Primitive
              n="03"
              icon={<KeyRound className="h-4 w-4" />}
              title="Passwordless by default"
              body="No passwords stored, ever. Passkey-first, email OTP as fallback. Strong identity binding without the phishing-friendly anti-pattern."
            />
            <Primitive
              n="04"
              icon={<Layers className="h-4 w-4" />}
              title="One backend, two clients"
              body="Next.js + Better Auth serves both browser and Expo native. Same endpoints, same Postgres rows, mobile and web passkeys interoperate."
            />
            <Primitive
              n="05"
              icon={<Smartphone className="h-4 w-4" />}
              title="Real device camera"
              body="The web demo uses an auto-passing provider for determinism. The Expo app runs the actual PAD ceremony against the same backend."
            />
            <Primitive
              n="06"
              icon={<Mail className="h-4 w-4" />}
              title="Email OTP fallback"
              body="First-time users sign in via a 6-digit code (Resend), then bind a passkey from the dashboard. No password reset paths because there are no passwords."
            />
          </div>
        </div>
      </section>

      {/* ============== SEQUENCE ============== */}
      <section id="sequence" className="relative border-t border-border-strong/70 bg-paper/30">
        <div className="mx-auto grid max-w-[1320px] gap-16 px-6 py-24 md:py-32 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <span className="tag">§ Sequence</span>
            <h2 className="display mt-6 text-[clamp(40px,5.5vw,72px)]">
              Ninety <span className="display-italic text-phosphor">seconds</span>.
              <br />
              No password.
            </h2>
            <p className="mt-8 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Run through the full passwordless ceremony end-to-end. The audit
              trail on the dashboard updates in real time as each phase
              completes.
            </p>

            <div className="mt-10">
              <Link
                href="/login"
                className="group inline-flex h-12 items-center gap-3 rounded-full bg-phosphor px-6 text-phosphor-foreground transition-transform hover:-translate-y-0.5"
              >
                <span className="data text-[12px] tracking-[0.12em] uppercase font-semibold">
                  Begin ceremony
                </span>
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:rotate-45" />
              </Link>
            </div>
          </div>

          <ol className="space-y-px overflow-hidden rounded-xl border border-border-strong bg-border">
            <Phase
              n="00"
              cmd="GET /login"
              title="Request an OTP"
              body={
                <>
                  Click{" "}
                  <Link href="/login" className="link-rule text-foreground">
                    Sign in
                  </Link>{" "}
                  and request a code. Resend delivers a 6-digit OTP to your
                  inbox.
                </>
              }
            />
            <Phase
              n="01"
              cmd="POST /api/auth/verify-otp"
              title="Land on the dashboard"
              body="Enter the code. You're signed in — no password ever created. A new user row is bound to your email."
            />
            <Phase
              n="02"
              cmd="POST /expo-passkey/liveness/verify"
              title="Run the liveness check"
              body={
                <>
                  Hit <strong className="text-foreground">Register passkey</strong>.
                  The provider returns a signed liveness token; the audit slice
                  lands on{" "}
                  <code className="data">passkey.metadata.liveness</code>.
                </>
              }
            />
            <Phase
              n="03"
              cmd="navigator.credentials.create()"
              title="WebAuthn ceremony"
              body="Your browser runs the WebAuthn registration ceremony — Touch ID, Windows Hello, or a security key. The credential is stored alongside the liveness audit."
            />
            <Phase
              n="04"
              cmd="navigator.credentials.get()"
              title="Sign in via passkey"
              body={
                <>
                  Sign out, then sign back in via the{" "}
                  <strong className="text-foreground">Passkey</strong> tab — full
                  assertion flow, no email needed.
                </>
              }
            />
          </ol>
        </div>
      </section>

      {/* ============== STACK PROOF ============== */}
      <section className="relative border-t border-border-strong/70">
        <div className="mx-auto max-w-[1320px] px-6 py-20">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <span className="data text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              ▌ Standards &amp; runtime
            </span>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-[13px]">
              {[
                "Next.js 15",
                "Expo SDK 55",
                "Better Auth",
                "Prisma + Postgres",
                "WebAuthn / FIDO2",
                "ISO 30107 PAD",
              ].map((b) => (
                <span key={b} className="data tracking-[0.04em]">
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============== FOOTER ============== */}
      <footer className="border-t border-border-strong/70 bg-paper/40">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Sigil />
            <span className="data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              MIT · built by{" "}
              <Link
                href="https://github.com/iosazee"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-phosphor"
              >
                @iosazee
              </Link>
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="https://github.com/iosazee/expo-passkey"
              className="data text-[12px] text-muted-foreground hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              expo-passkey ↗
            </Link>
            <Link
              href="https://github.com/iosazee/expo-passkey-liveness"
              className="data text-[12px] text-muted-foreground hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              expo-passkey-liveness ↗
            </Link>
          </div>
        </div>
      </footer>
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

function TerminalCard() {
  return (
    <div className="relative">
      {/* outer card */}
      <div className="relative overflow-hidden rounded-xl border border-border-strong bg-paper/80 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)] backdrop-blur">
        {/* glow */}
        <div className="pointer-events-none absolute -top-20 right-0 h-40 w-40 rounded-full bg-phosphor/20 blur-3xl" />

        {/* titlebar */}
        <div className="flex items-center justify-between border-b border-border-strong px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blood/80" />
            <span className="h-2 w-2 rounded-full bg-amber/80" />
            <span className="h-2 w-2 rounded-full bg-phosphor" />
          </div>
          <span className="data text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            zsh — ceremony.log
          </span>
          <span className="data text-[10px] text-muted-foreground">
            120×40
          </span>
        </div>

        {/* terminal body */}
        <div className="bg-scan relative p-5 font-mono">
          <div className="space-y-1.5 text-[12.5px] leading-relaxed">
            <Line prompt="$" body="curl -X POST /api/auth/sign-in/email-otp" />
            <Line muted body="→ 200 OK · otp_sent=true" />
            <Line prompt="$" body="echo $OTP | verify" />
            <Line muted body="→ session.created · uid=usr_4f1c…" />
            <Line prompt="$" body="passkey.register --liveness=auto" />
            <Out>
              <span className="text-muted-foreground">phase 1/3</span>{" "}
              <span className="text-phosphor">liveness ✓</span>{" "}
              <span className="text-muted-foreground">
                · score 0.97 · pad L1
              </span>
            </Out>
            <Out>
              <span className="text-muted-foreground">phase 2/3</span>{" "}
              <span className="text-phosphor">credentials.create() ✓</span>
            </Out>
            <Out>
              <span className="text-muted-foreground">phase 3/3</span>{" "}
              <span className="text-phosphor">stored ✓</span>{" "}
              <span className="text-muted-foreground">
                · platform=mac · alg=ES256
              </span>
            </Out>
            <Line muted body="→ passkey.metadata.liveness written" />
            <div className="pt-2">
              <span className="text-phosphor">$ </span>
              <span className="caret text-foreground" />
            </div>
          </div>
        </div>

        {/* footer chips */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border-strong px-4 py-3">
          <span className="tag">▸ Touch ID</span>
          <span className="tag">▸ Windows Hello</span>
          <span className="tag">▸ Face ID</span>
          <span className="tag tag-phosphor">verified ✓</span>
        </div>
      </div>

      {/* annotation */}
      <div className="absolute -bottom-6 right-2 hidden md:block">
        <p className="data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          fig. 01 — registration ceremony, condensed
        </p>
      </div>
    </div>
  );
}

function Line({
  prompt,
  body,
  muted,
}: {
  prompt?: string;
  body: string;
  muted?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {prompt ? <span className="text-phosphor">{prompt}</span> : null}
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>
        {body}
      </span>
    </div>
  );
}

function Out({ children }: { children: React.ReactNode }) {
  return <div className="pl-3 text-[12.5px]">{children}</div>;
}

function Stat({
  k,
  label,
  value,
  sub,
}: {
  k: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="group relative bg-background p-6 transition-colors hover:bg-paper/50">
      <div className="flex items-baseline justify-between">
        <span className="data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <span className="data text-[10px] text-phosphor">{k}</span>
      </div>
      <p className="mt-5 text-[20px] leading-tight">{value}</p>
      <p className="mt-1 data text-[11px] text-muted-foreground tracking-[0.04em]">
        {sub}
      </p>
    </div>
  );
}

function Primitive({
  n,
  icon,
  title,
  body,
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="group relative flex flex-col gap-5 bg-background p-7 transition-colors hover:bg-paper/40">
      <div className="flex items-start justify-between">
        <span className="display-italic text-[44px] leading-none text-muted-foreground/40 transition-colors group-hover:text-phosphor/80">
          {n}
        </span>
        <span className="inline-grid h-9 w-9 place-items-center rounded-md border border-border-strong text-muted-foreground transition-colors group-hover:border-phosphor group-hover:text-phosphor">
          {icon}
        </span>
      </div>
      <div className="space-y-2">
        <h3 className="text-[18px] tracking-tight">{title}</h3>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  );
}

function Phase({
  n,
  cmd,
  title,
  body,
}: {
  n: string;
  cmd: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="group relative grid grid-cols-[auto_1fr] gap-5 bg-background p-7 transition-colors hover:bg-paper/50">
      <div className="flex flex-col items-center gap-2">
        <span className="data text-[11px] text-phosphor">{n}</span>
        <span className="h-full w-px bg-border-strong/60 group-last:hidden" />
      </div>
      <div>
        <p className="data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          ▸ {cmd}
        </p>
        <h4 className="mt-3 text-[19px] tracking-tight">{title}</h4>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </li>
  );
}
