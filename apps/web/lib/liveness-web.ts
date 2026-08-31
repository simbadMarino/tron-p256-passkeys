"use client";

/**
 * Web-only adapter for the liveness flow.
 *
 * `expo-passkey-liveness/web` is a stub that always returns
 * NOT_SUPPORTED — by design, since real web liveness is deferred
 * to a later release. For this demo we want to exercise the SERVER
 * pipeline (create-session, verify-session, hook) from a browser
 * without a camera ceremony, so we call the endpoints directly and
 * skip the native runLivenessCheck step. The demo's customProvider
 * returns a deterministic auto-pass, which is what makes this safe.
 *
 * In a real native app you'd use
 *   import { verifyLiveness } from "expo-passkey-liveness/native"
 * instead. The function signature is similar — same options shape,
 * same {data, error} return — so swapping when you move from this
 * web demo to a mobile client is a one-line change.
 */

import { $fetch } from "./auth-client";

export type LivenessChallenge = "registration" | "authentication" | "step-up";

export interface VerifyLivenessWebResult {
  data: {
    livenessToken: string;
    expiresAt: string;
    score: number;
    provider: string;
    sessionId: string;
  } | null;
  error: { code?: string; message?: string } | null;
}

export async function verifyLivenessWeb(opts: {
  challenge: LivenessChallenge;
  userId?: string;
}): Promise<VerifyLivenessWebResult> {
  const sessionRes = await $fetch<{
    sessionId: string;
    provider: string;
    challenge: LivenessChallenge;
    expiresAt: string;
    clientBootstrap: Record<string, unknown>;
  }>("/expo-passkey/liveness/session", {
    method: "POST",
    body: {
      challenge: opts.challenge,
      registeredModality: "face",
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    throw: false,
  });
  if (sessionRes.error || !sessionRes.data) {
    return {
      data: null,
      error: sessionRes.error ?? { message: "create-session failed" },
    };
  }

  // In a native flow the camera ceremony runs here. In the web demo
  // we go straight to /verify, which is the auto-pass the
  // customProvider configured on the server returns.

  const verifyRes = await $fetch<{
    livenessToken: string;
    expiresAt: string;
    score: number;
    provider: string;
    sessionId: string;
  }>("/expo-passkey/liveness/verify", {
    method: "POST",
    body: { sessionId: sessionRes.data.sessionId },
    throw: false,
  });
  if (verifyRes.error || !verifyRes.data) {
    return {
      data: null,
      error: verifyRes.error ?? { message: "verify-session failed" },
    };
  }

  return {
    data: {
      livenessToken: verifyRes.data.livenessToken,
      expiresAt: verifyRes.data.expiresAt,
      score: verifyRes.data.score,
      provider: verifyRes.data.provider,
      sessionId: verifyRes.data.sessionId,
    },
    error: null,
  };
}
