import type { LivenessFetcher } from "expo-passkey-liveness/native";

import { env } from "./env";

export interface PasskeyDebugRow {
  id: string;
  userId: string;
  platform: string;
  createdAt: string;
  metadata: {
    liveness?: {
      provider?: string;
      score?: number;
      padLevel?: string;
      verifiedAt?: string;
      registeredModality?: string;
    };
  } | null;
}

export interface LivenessSessionDebugRow {
  id: string;
  userId: string | null;
  provider: string;
  state: "pending" | "verified" | "failed" | "expired";
  score: number | null;
  challenge: string;
  createdAt: string;
  expiresAt: string;
}

export async function fetchPasskeys(): Promise<PasskeyDebugRow[]> {
  const r = await fetch(`${env.apiUrl}/api/debug/passkeys`);
  if (!r.ok) throw new Error(`debug/passkeys: ${r.status}`);
  return r.json();
}

export async function fetchLivenessSessions(): Promise<LivenessSessionDebugRow[]> {
  const r = await fetch(`${env.apiUrl}/api/debug/liveness-sessions`);
  if (!r.ok) throw new Error(`debug/liveness-sessions: ${r.status}`);
  return r.json();
}

/**
 * Adapt Better Auth's $fetch to the LivenessFetcher contract.
 *
 * Better Auth's $fetch returns { data, error } when `throw: false` is
 * passed — same shape LivenessFetcher requires. We re-serialize the
 * body so it matches RequestInit's BodyInit.
 */
export function makeLivenessFetcher(authClient: {
  $fetch: (
    path: string,
    init: { method: string; body?: string; headers?: Record<string, string>; throw: false }
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
}): LivenessFetcher {
  return (async (path, init) => {
    const r = await authClient.$fetch(path, {
      method: init.method,
      body: init.body == null ? undefined : JSON.stringify(init.body),
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      throw: false,
    });
    return r as { data: unknown; error: { code?: string; message?: string } | null };
  }) as LivenessFetcher;
}
