import type { Metadata } from "next";

import "./globals.css";
import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EPK · passkeys + face liveness, end to end",
  description:
    "Reference monorepo for expo-passkey and expo-passkey-liveness — WebAuthn ceremonies on a single Better Auth backend, gated by face PAD.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(
        "font-sans",
        dmSans.variable,
        fraunces.variable,
        jetbrainsMono.variable
      )}
      suppressHydrationWarning
    >
      <body className="min-h-svh bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
