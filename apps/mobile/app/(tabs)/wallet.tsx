import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  base58ToEvmAddress,
  encodeExecuteArgs,
  EXECUTE_SIGNATURE,
  operationDigestHex,
  type P256Assertion,
} from "@tron-p256/wallet-core";

import { fetchP256Keys, type P256KeyRow } from "@/lib/api";
import { env } from "@/lib/env";
import { signDigestWithPasskeyNative } from "@/lib/passkey-p256-native";

/**
 * The native counterpart of the web app's /p256 page.
 *
 * Every value below the ceremony — the operation digest, the ABI encoding,
 * the address decoding — comes from @tron-p256/wallet-core, the same module
 * the web app uses. Only the signing call differs.
 */

const DEFAULTS = {
  wallet: "TGJDgV9zs8Fpq3xFDncDyJsKUkFNUk2JgJ",
  chainId: "3448148188", // TRON Nile
  destination: "TJDMQzjJSh5eC8WezVtnDXDuWXAwjV23eF",
  value: "0",
  data: "0x",
  nonce: "0",
  deadline: "4000000000",
  // Must match the rpId the credential was registered under — a domain, no
  // scheme and no port. A credential registered on another rpId is not just
  // rejected, it is never offered: Credential Manager finds nothing to show
  // and collapses to a bare "Sign in another way" sheet, which reads as "the
  // passkey prompt never appeared". So this tracks the same env var the
  // Passkey tab registers with rather than carrying its own default.
  rpId: env.rpId,
};

type Operation = typeof DEFAULTS;

export default function WalletScreen() {
  const [op, setOp] = useState<Operation>(DEFAULTS);
  const [assertion, setAssertion] = useState<P256Assertion | null>(null);
  const [signedOp, setSignedOp] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<P256KeyRow[]>([]);
  const [keysError, setKeysError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await fetchP256Keys());
      setKeysError(null);
    } catch (e) {
      setKeysError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // On focus rather than on mount: the tab bar keeps this screen mounted, so
  // a passkey registered on the Passkey tab would otherwise never show up
  // here until the app restarted.
  useFocusEffect(
    useCallback(() => {
      void loadKeys();
    }, [loadKeys]),
  );

  /**
   * The public key belongs to whichever credential the selector actually
   * used, which the user picks during the ceremony — so it is resolved from
   * the assertion's credentialId, not from "the first registered key".
   */
  const signingKey = assertion
    ? (keys.find((k) => k.credentialId === assertion.credentialId) ?? null)
    : null;

  const digest = useMemo(() => {
    try {
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
      return { value: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [op]);

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
        // JSON.stringify does the escaping that hand-pasting gets wrong —
        // clientDataJSON is itself JSON, and its inner quotes have to survive
        // the paste into a struct field.
        tuple: JSON.stringify([
          auth.authenticatorData,
          auth.clientDataJSON,
          auth.challengeIndex,
          auth.typeIndex,
          auth.r,
          auth.s,
        ]),
        // TRON's `parameter` field takes bare hex; a leading 0x is rejected
        // by the node's decoder.
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

  async function handleSign() {
    setBusy(true);
    setError(null);
    setAssertion(null);
    setSignedOp(null);
    try {
      if (!digest.value) throw new Error(digest.error ?? "No digest to sign");
      const bytes = new Uint8Array(
        (digest.value.slice(2).match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
      );
      const result = await signDigestWithPasskeyNative({
        digest: bytes,
        rpId: op.rpId,
      });
      setAssertion(result);
      setSignedOp(op);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Wallet operation</Text>
        <Text style={styles.body}>
          Signs the operation digest with a passkey on this device. Same shared
          encoding as the web app — only the ceremony is native.
        </Text>

        {(
          [
            ["wallet", "wallet"],
            ["destination", "destination"],
            ["chainId", "chain id"],
            ["value", "value (sun)"],
            ["nonce", "nonce"],
            ["deadline", "deadline (unix)"],
            ["data", "calldata"],
            ["rpId", "rpId"],
          ] as [keyof Operation, string][]
        ).map(([key, label]) => (
          <View key={key} style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              value={op[key]}
              onChangeText={(v) => setOp({ ...op, [key]: v.trim() })}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
        ))}

        <View style={styles.panel}>
          <Text style={styles.label}>operation digest · the challenge</Text>
          <Text style={styles.mono}>{digest.value ?? "—"}</Text>
          {digest.error ? (
            <Text style={styles.err}>{digest.error}</Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleSign}
          disabled={busy || !digest.value}
          style={[styles.button, (busy || !digest.value) && styles.buttonOff]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign with passkey</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {/* A failure here is not fatal — signing still works, only the public
            key is unavailable — so it reads as a warning rather than an error. */}
        {keysError ? (
          <Text style={styles.hint}>
            Could not load public keys: {keysError}
          </Text>
        ) : null}

        {assertion ? (
          <View style={styles.panel}>
            <Text style={styles.label}>custody</Text>
            <Text style={styles.mono}>
              {assertion.custody} · flags 0x
              {assertion.flags.raw.toString(16).padStart(2, "0")} · UV=
              {assertion.flags.userVerified ? 1 : 0}
            </Text>

            <Text style={[styles.label, styles.spaced]}>credentialId</Text>
            <Text style={styles.mono} selectable>
              {assertion.credentialId}
            </Text>

            <Text style={[styles.label, styles.spaced]}>publicKeyX</Text>
            <Text style={styles.mono} selectable>
              {signingKey?.x ?? "— unknown credential"}
            </Text>
            <Text style={[styles.label, styles.spaced]}>publicKeyY</Text>
            <Text style={styles.mono} selectable>
              {signingKey?.y ?? "— unknown credential"}
            </Text>
            {signingKey?.error ? (
              <Text style={styles.err}>{signingKey.error}</Text>
            ) : null}
            {!signingKey && !keysError ? (
              <Text style={styles.hint}>
                No registered key matches this credential. It was created
                against a different account or server than the one this app is
                signed in to.
              </Text>
            ) : null}

            <Text style={[styles.label, styles.spaced]}>r</Text>
            <Text style={styles.mono} selectable>
              {assertion.r}
            </Text>
            <Text style={[styles.label, styles.spaced]}>s</Text>
            <Text style={styles.mono} selectable>
              {assertion.s}
            </Text>

            <Text style={[styles.label, styles.spaced]}>
              auth tuple · paste into a struct field
            </Text>
            <Text style={styles.mono} selectable>
              {submission?.tuple ?? "—"}
            </Text>

            <Text style={[styles.label, styles.spaced]}>function selector</Text>
            <Text style={styles.mono} selectable>
              {EXECUTE_SIGNATURE}
            </Text>

            <Text style={[styles.label, styles.spaced]}>
              parameter · bare hex, no 0x
            </Text>
            <Text style={styles.mono} selectable>
              {submission?.parameter ?? "—"}
            </Text>

            {submission?.error ? (
              <Text style={styles.err}>{submission.error}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0b0b0c" },
  content: { padding: 20, gap: 12 },
  title: { color: "#fafafa", fontSize: 24, fontWeight: "600" },
  body: { color: "#a1a1aa", fontSize: 14, lineHeight: 20 },
  field: { gap: 4 },
  label: {
    color: "#71717a",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  spaced: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fafafa",
    fontFamily: "Menlo",
    fontSize: 12,
  },
  panel: {
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  mono: { color: "#e4e4e7", fontFamily: "Menlo", fontSize: 11, lineHeight: 16 },
  button: {
    backgroundColor: "#16a34a",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonOff: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  err: { color: "#f87171", fontSize: 13, lineHeight: 18 },
  hint: { color: "#a1a1aa", fontSize: 12, lineHeight: 17, marginTop: 6 },
});
